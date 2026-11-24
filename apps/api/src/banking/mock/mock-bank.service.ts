import type {
  BankingImportReport,
  BankingImportResult,
} from "@lazyfinance/contracts";
import type { DemoBankSource } from "@lazyfinance/contracts/internal";
import { Injectable, NotFoundException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { EnvironmentService } from "../../environment/environment.service";
import { PersistenceClient } from "../../persistence/persistence.client";
import type { BankingConnector } from "../connector/banking-connector";
import type {
  ConnectorResult,
  NormalizedMovement,
} from "../connector/normalized-banking.schema";
import { BankingIngestionService } from "../ingestion/banking-ingestion.service";

const mainAccountIds = [
  "demo-main-checking",
  "demo-main-savings",
  "demo-main-creditCard",
];

export function demoBankConnector(
  source: DemoBankSource,
  selected: readonly string[],
): BankingConnector {
  const accounts = source.accounts.filter((account) =>
    selected.includes(account.externalId),
  );
  const rows = source.movements.filter((row) =>
    selected.includes(row.accountExternalId),
  );
  const observedAt = new Date().toISOString();
  const firstDay = "2024-01-01";
  const through = observedAt.slice(0, 10);
  return {
    provider: "mock_bank",
    async fetchPage({
      connectionId,
      pageCursor,
      signal,
    }): Promise<ConnectorResult> {
      signal?.throwIfAborted();
      if (connectionId !== source.connectionId)
        throw new Error("Source connection changed");
      if (source.failure)
        return {
          kind: "failure",
          reason: source.failure,
          observedAt,
          retryAfter: null,
        };
      const offset = pageCursor === null ? 0 : Number(pageCursor);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > rows.length)
        throw new Error("Invalid simulated cursor");
      const batch = rows.slice(offset, offset + 200);
      const next = offset + batch.length;
      const complete = next === rows.length;
      return {
        kind: "page",
        observedAt,
        accounts:
          offset === 0
            ? accounts.map((account) => ({
                externalId: account.externalId,
                type: account.type,
                currency: "CLP",
                number: account.number,
                holderName: account.holderName,
                reportedBalance: {
                  amount: account.balance,
                  meaning:
                    account.type === "credit_card"
                      ? "card_liability"
                      : "cash_balance",
                  asOf: source.updatedAt,
                },
                historyCoverage: {
                  completeness: "complete",
                  from: firstDay,
                  through,
                },
              }))
            : [],
        movements: batch
          .filter((row) => !row.removed)
          .map(
            (row): NormalizedMovement => ({
              accountExternalId: row.accountExternalId,
              externalId: row.externalId,
              booked: { precision: "instant", at: row.bookedAt },
              amount: row.amount,
              description: row.description,
              merchant: row.merchant,
              providerUpdatedAt: null,
              providerKind:
                row.relatedMovement?.kind === "card_payment_pair"
                  ? "card_payment"
                  : row.relatedMovement
                    ? "transfer"
                    : "other",
              relatedMovement: row.relatedMovement
                ? {
                    kind: row.relatedMovement.kind,
                    accountExternalId: row.relatedMovement.accountExternalId,
                    movementExternalId: row.relatedMovement.externalId,
                  }
                : null,
              counterpartyHolder: null,
            }),
          ),
        removedMovements: batch
          .filter((row) => row.removed)
          .map((row) => ({
            accountExternalId: row.accountExternalId,
            externalId: row.externalId,
            reason: "removed" as const,
            providerUpdatedAt: source.updatedAt,
          })),
        nextCursor: complete ? null : String(next),
        checkpoint: complete ? source.updatedAt : null,
        complete,
      };
    },
  };
}

@Injectable()
export class MockBankService {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly persistence: PersistenceClient,
    private readonly ingestion: BankingIngestionService,
  ) {}

  private enabled() {
    if (!this.environment.get("DEMO_TOOLS_ENABLED"))
      throw new NotFoundException("Simulated banking is disabled");
  }

  async source(userId: string, id: string) {
    this.enabled();
    const client = this.persistence.user(userId);
    const owned = await client.providerLinks.connection.query({ id });
    if (owned.connection.provider !== "mock_bank")
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Demo bank not found",
      });
    return { owned, source: await client.demoTools.bankSource.query({ id }) };
  }

  async discover(userId: string, id: string) {
    const { owned, source } = await this.source(userId, id);
    if (
      owned.connection.disconnectedAt ||
      owned.connection.status !== "active" ||
      source.failure
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Restore demo bank access before discovering accounts",
      });
    return this.persistence.user(userId).providerSelection.discover.mutate({
      connectionId: id,
      expectedCredentialVersion: owned.version,
      accounts: source.accounts.map((account) => ({
        externalId: account.externalId,
        name: `${account.type === "credit_card" ? "Tarjeta" : account.type === "savings" ? "Ahorro" : "Cuenta corriente"} · ${account.number}`,
        currency: "CLP",
        numberSuffix: account.number.slice(-4),
        unavailableReason: null,
      })),
    });
  }

  async importSnapshot(
    userId: string,
    id: string,
  ): Promise<BankingImportResult> {
    const { owned, source } = await this.source(userId, id);
    if (owned.connection.disconnectedAt || owned.connection.status !== "active")
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reconnect the demo bank before importing",
      });
    const tracking = await this.persistence
      .user(userId)
      .providerSelection.get.query({ id });
    const selected = tracking.selection.accountIds;
    if (!tracking.selection.confirmedAt || !selected.length)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Select accounts before importing",
      });
    if (
      selected.some(
        (account) => !source.accounts.some((row) => row.externalId === account),
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "A selected demo bank account is missing",
      });
    const result = await this.ingestion.syncForUser(
      userId,
      id,
      demoBankConnector(source, selected),
      owned.version,
      {
        selectionVersion: tracking.selection.version,
      },
    );
    if (!("checkpoint" in result)) return result;
    const rows = source.movements.filter((row) =>
      selected.includes(row.accountExternalId),
    );
    const report: BankingImportReport = {
      requestedHistory: {
        from: "2024-01-01",
        through: new Date().toISOString().slice(0, 10),
      },
      importedAccounts: selected.length,
      bookedMovements: rows.filter((row) => !row.removed).length,
      reversedMovements: rows.filter((row) => row.removed).length,
      ignoredPendingMovements: 0,
      ignoredProcessingMovements: 0,
      uncertainMovements: 0,
      skippedAccounts: [],
      unknownCardBalances: [],
    };
    return {
      status: result.status,
      conflictCount: result.conflictCount,
      report,
    };
  }

  async prepare(userId: string, id: string) {
    const client = this.persistence.user(userId);
    const selection = await client.providerSelection.get.query({ id });
    if (!selection.selection.confirmedAt) {
      const discovered = await this.discover(userId, id);
      await client.providerSelection.select.mutate({
        id,
        expectedVersion: discovered.version,
        discoveryVersion: discovered.discoveryVersion,
        accountIds: mainAccountIds,
        automaticEnrolled: false,
      });
    }
    return this.importSnapshot(userId, id);
  }
}

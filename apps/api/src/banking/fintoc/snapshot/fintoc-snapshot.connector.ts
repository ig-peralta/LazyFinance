import type { BankingImportReport } from "@lazyfinance/contracts";
import type { ProviderLinkSecret } from "@lazyfinance/contracts/internal";
import type { BankingConnector } from "../../connector/banking-connector";
import type {
  ConnectorPage,
  ConnectorResult,
  NormalizedAccountSnapshot,
} from "../../connector/normalized-banking.schema";
import { FintocClient, FintocFailure } from "../client/fintoc-client";
import {
  normalizeFintocAccount,
  normalizeFintocMovement,
} from "./normalize-fintoc";

/** One owned run, not a singleton: raw credentials, inventory and cursors never
 * cross requests/users. Each normalized page makes at most one upstream call. */
export class FintocSnapshotConnector implements BankingConnector {
  readonly provider = "fintoc";
  readonly report: BankingImportReport;
  private phase: "link" | "accounts" | "movements" | "done" = "link";
  private cursor: string | null = null;
  private sequence = 0;
  private page = 1;
  private total: number | null | undefined;
  private readonly seenAccounts = new Set<string>();
  private readonly accounts: NormalizedAccountSnapshot[] = [];
  private accountIndex = 0;
  private readonly seenMovements = new Set<string>();
  private from: string | null = null;
  private through: string | null = null;

  constructor(
    private readonly fintoc: FintocClient,
    private readonly owned: Pick<
      ProviderLinkSecret,
      "connection" | "externalId"
    >,
    private readonly token: string,
    private readonly window: BankingImportReport["requestedHistory"],
  ) {
    this.report = {
      requestedHistory: { ...window },
      importedAccounts: 0,
      bookedMovements: 0,
      reversedMovements: 0,
      ignoredPendingMovements: 0,
      ignoredProcessingMovements: 0,
      uncertainMovements: 0,
      skippedAccounts: [],
      unknownCardBalances: [],
    };
  }

  async fetchPage(
    input: Parameters<BankingConnector["fetchPage"]>[0],
  ): Promise<ConnectorResult> {
    try {
      if (
        input.connectionId !== this.owned.connection.id ||
        input.pageCursor !== this.cursor ||
        this.phase === "done"
      )
        throw new FintocFailure("invalid_data");
      const result: ConnectorPage = {
        kind: "page",
        observedAt: new Date().toISOString(),
        accounts: [],
        movements: [],
        removedMovements: [],
        nextCursor: null,
        checkpoint: null,
        complete: false,
      };
      if (this.phase === "link") {
        const link = await this.fintoc.link(this.token);
        if (
          link.id !== this.owned.externalId ||
          link.mode !== this.owned.connection.mode ||
          link.holder_type !== this.owned.connection.holderType
        )
          throw new FintocFailure("invalid_data");
        if (!link.active || link.status === "inactive")
          return this.failure("revoked");
        if (link.status === "login_required") return this.failure("expired");
        this.phase = "accounts";
      } else if (this.phase === "accounts") {
        const data = await this.fintoc.accounts(this.token, this.page);
        this.checkTotal(data.total);
        for (const raw of data.items) {
          if (this.seenAccounts.has(raw.id) || this.seenAccounts.size >= 1000)
            throw new FintocFailure("invalid_data");
          this.seenAccounts.add(raw.id);
          const normalized = normalizeFintocAccount(raw);
          if ("skipped" in normalized) {
            this.report.skippedAccounts.push(normalized.skipped);
            continue;
          }
          const account = normalized.snapshot;
          this.accounts.push(account);
          result.accounts.push(account);
          this.report.importedAccounts++;
          if (account.type === "credit_card")
            this.report.unknownCardBalances.push(account.externalId);
        }
        if (data.hasMore) this.page++;
        else {
          this.phase = this.accounts.length ? "movements" : "done";
          this.page = 1;
          this.total = undefined;
        }
      } else {
        const account = this.accounts[this.accountIndex];
        const data = await this.fintoc.movements(
          this.token,
          account.externalId,
          this.page,
          this.window,
        );
        this.checkTotal(data.total);
        for (const raw of data.items) {
          const day = raw.post_date.slice(0, 10);
          if (day < this.window.from || day > this.window.through)
            throw new FintocFailure("invalid_data");
          if (this.seenMovements.has(raw.id))
            throw new FintocFailure("invalid_data");
          this.seenMovements.add(raw.id);
          if (raw.status === "reversed" || raw.status === "manually_reversed") {
            result.removedMovements.push({
              accountExternalId: account.externalId,
              externalId: raw.id,
              reason: "reversed",
              providerUpdatedAt: null,
            });
            this.report.reversedMovements++;
          } else if (raw.pending) this.report.ignoredPendingMovements++;
          else if (raw.status === "processing")
            this.report.ignoredProcessingMovements++;
          else {
            const movement = normalizeFintocMovement(account.externalId, raw);
            result.movements.push(movement);
            this.report.bookedMovements++;
            this.report.uncertainMovements++;
            if (this.from === null || day < this.from) this.from = day;
            if (this.through === null || day > this.through) this.through = day;
          }
        }
        if (data.hasMore) this.page++;
        else {
          result.accounts.push({
            ...account,
            historyCoverage: {
              completeness: "partial",
              from: this.from,
              through: this.through,
            },
          });
          this.accountIndex++;
          this.page = 1;
          this.total = undefined;
          this.from = this.through = null;
          this.seenMovements.clear();
          if (this.accountIndex === this.accounts.length) this.phase = "done";
        }
      }
      result.observedAt = new Date().toISOString();
      result.complete = this.phase === "done";
      this.cursor = result.complete ? null : `fintoc-page-${++this.sequence}`;
      result.nextCursor = this.cursor;
      return result;
    } catch (error) {
      return this.failure(
        error instanceof FintocFailure && error.kind === "revoked"
          ? "revoked"
          : error instanceof FintocFailure && error.kind === "invalid_data"
            ? "invalid_data"
            : "retryable",
        error instanceof FintocFailure ? error.retryAfter : null,
      );
    }
  }

  private checkTotal(total: number | null) {
    if (this.total !== undefined && this.total !== total)
      throw new FintocFailure("invalid_data");
    this.total = total;
  }

  private failure(
    reason: "retryable" | "expired" | "revoked" | "invalid_data",
    retryAfter: string | null = null,
  ): ConnectorResult {
    this.phase = "done";
    return {
      kind: "failure",
      reason,
      retryAfter,
      observedAt: new Date().toISOString(),
    };
  }
}

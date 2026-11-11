import type { BankingImportResult } from "@lazyfinance/contracts";
import type { ProviderScheduleClaim } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../../../persistence/persistence.client";
import { BankingIngestionService } from "../../ingestion/banking-ingestion.service";
import { FintocClient } from "../client/fintoc-client";
import { FintocCredentials } from "../credentials/fintoc-credentials";
import { FintocSnapshotConnector } from "../snapshot/fintoc-snapshot.connector";
import { fintocTrackingWindow } from "./fintoc-tracking-window";

@Injectable()
export class FintocImportService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly fintoc: FintocClient,
    private readonly credentials: FintocCredentials,
    private readonly ingestion: BankingIngestionService,
  ) {}

  /** Current accounts and movements since first link, never a pre-link backfill. */
  async importSnapshot(
    userId: string,
    connectionId: string,
    options: { claim?: ProviderScheduleClaim; signal?: AbortSignal } = {},
  ): Promise<BankingImportResult> {
    const owned = await this.persistence
      .user(userId)
      .providerLinks.connection.query({ id: connectionId });
    const config = this.fintoc.configuration();
    if (!config.enabled || config.mode !== owned.connection.mode)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Banking is not configured for this connection's mode",
      });
    if (
      options.claim &&
      (!config.automaticSyncEnabled ||
        options.claim.userId !== userId ||
        options.claim.connectionId !== connectionId ||
        options.claim.credentialVersion !== owned.version)
    )
      return { status: "superseded" };
    const tracking = await this.persistence
      .user(userId)
      .providerSelection.get.query({ id: connectionId });
    if (
      !tracking.selection.confirmedAt ||
      !tracking.selection.accountIds.length
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Selecciona las cuentas que deseas seguir antes de importar",
      });
    if (
      options.claim &&
      options.claim.selectionVersion !== tracking.selection.version
    )
      return { status: "superseded" };
    if (
      owned.connection.disconnectedAt ||
      owned.connection.status !== "active" ||
      !owned.encryptedCredential
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reconnect this bank before importing",
      });
    const token = this.credentials.open(
      owned.encryptedCredential,
      userId,
      owned.connection.mode,
      owned.externalId,
    );
    const connector = new FintocSnapshotConnector(
      this.fintoc,
      owned,
      token,
      fintocTrackingWindow(new Date(owned.connection.createdAt), new Date()),
      tracking.selection.accountIds,
    );
    const outcome = await this.ingestion.syncForUser(
      userId,
      connectionId,
      connector,
      owned.version,
      {
        selectionVersion: tracking.selection.version,
        claimId: options.claim?.id,
        signal: options.signal,
      },
    );
    if (
      outcome.status === "failed" ||
      outcome.status === "superseded" ||
      outcome.status === "in_progress" ||
      outcome.status === "retry_later"
    )
      return outcome;
    return {
      status: outcome.status,
      conflictCount: outcome.conflictCount,
      report: connector.report,
    };
  }
}

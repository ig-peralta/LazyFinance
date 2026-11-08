import type { BankingImportResult } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../../../persistence/persistence.client";
import { BankingIngestionService } from "../../ingestion/banking-ingestion.service";
import { FintocClient } from "../client/fintoc-client";
import { FintocCredentials } from "../credentials/fintoc-credentials";
import { FintocSnapshotConnector } from "../snapshot/fintoc-snapshot.connector";
import { fintocInitialHistoryWindow } from "./fintoc-history-window";

@Injectable()
export class FintocImportService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly fintoc: FintocClient,
    private readonly credentials: FintocCredentials,
    private readonly ingestion: BankingIngestionService,
  ) {}

  /** Current accounts and bounded partial history; not a bank refresh/job. */
  async importInitial(
    userId: string,
    connectionId: string,
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
      fintocInitialHistoryWindow(new Date()),
    );
    const outcome = await this.ingestion.syncForUser(
      userId,
      connectionId,
      connector,
      owned.version,
    );
    if (outcome.status === "failed" || outcome.status === "superseded")
      return outcome;
    return {
      status: outcome.status,
      conflictCount: outcome.conflictCount,
      report: connector.report,
    };
  }
}

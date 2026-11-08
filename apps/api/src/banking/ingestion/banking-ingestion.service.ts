import {
  MAX_NORMALIZED_SYNC_BYTES,
  MAX_PERSISTENCE_RPC_BYTES,
  MAX_SYNC_RECORDS,
  type ProviderSyncBegin,
  type ProviderSyncFacts,
  type ProviderSyncOutcome,
} from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../../persistence/persistence.client";
import { persistenceException } from "../../rpc/persistence-error";
import type { BankingConnector } from "../connector/banking-connector";
import {
  type ConnectorFailure,
  type ConnectorPage,
  ConnectorResultSchema,
} from "../connector/normalized-banking.schema";
import { InvalidBatchError, prepareSync, syncScope } from "./prepare-sync";

const MAX_PAGES = 100;

@Injectable()
export class BankingIngestionService {
  constructor(private readonly persistence: PersistenceClient) {}

  /** Provider calls and every financial/tagging calculation run outside SQL transactions. */
  async syncForUser(
    userId: string,
    connectionId: string,
    connector: BankingConnector,
    expectedCredentialVersion?: number,
  ): Promise<ProviderSyncOutcome> {
    const client = this.persistence.user(userId);
    let state: ProviderSyncBegin;
    try {
      state = await client.providerSync.begin.mutate({
        connectionId,
        provider: connector.provider,
        ...(expectedCredentialVersion === undefined
          ? {}
          : { expectedCredentialVersion }),
      });
    } catch (error) {
      if (persistenceException(error)?.getStatus() === 409)
        return { status: "superseded" };
      throw error;
    }
    if (!state.acquired) {
      if (
        state.leaseExpiresAt &&
        new Date(state.leaseExpiresAt).getTime() > Date.now()
      )
        return { status: "in_progress", until: state.leaseExpiresAt };
      if (state.retryAfter && new Date(state.retryAfter).getTime() > Date.now())
        return { status: "retry_later", retryAfter: state.retryAfter };
      return { status: "superseded" };
    }
    const fetched = await this.fetchPages(
      connector,
      connectionId,
      state.checkpoint,
    );
    const failure = (value: ConnectorFailure) =>
      client.providerSync.failure.mutate({
        connectionId,
        revision: state.revision,
        reason: value.reason,
        observedAt: value.observedAt,
        retryAfter: value.retryAfter,
      });
    if ("failure" in fetched) return failure(fetched.failure);

    const scope = syncScope(connectionId, state.revision, fetched.pages);

    for (let attempt = 0; ; attempt++) {
      let facts: ProviderSyncFacts;

      try {
        facts = await client.providerSync.facts.query(scope);
      } catch (error) {
        if (persistenceException(error)?.getStatus() === 409)
          return { status: "superseded" };
        if (persistenceException(error)?.getStatus() === 413)
          return failure(this.invalidData());

        throw error;
      }

      try {
        const prepared = prepareSync(scope, facts, fetched.pages);
        if (
          Buffer.byteLength(JSON.stringify(prepared)) >
          MAX_PERSISTENCE_RPC_BYTES
        )
          throw new InvalidBatchError("Prepared sync exceeds transport budget");

        return await client.providerSync.commit.mutate(prepared);
      } catch (error) {
        if (
          error instanceof InvalidBatchError ||
          persistenceException(error)?.getStatus() === 400
        )
          return failure(this.invalidData());
        if (persistenceException(error)?.getStatus() !== 409 || attempt >= 2)
          throw error;
      }
    }
  }

  listPendingReviewForUser(userId: string) {
    return this.persistence.user(userId).providerSync.review.query();
  }

  private invalidData(): ConnectorFailure {
    return {
      kind: "failure",
      reason: "invalid_data",
      observedAt: new Date().toISOString(),
      retryAfter: null,
    };
  }

  private async fetchPages(
    connector: BankingConnector,
    connectionId: string,
    checkpoint: string | null,
  ): Promise<{ pages: ConnectorPage[] } | { failure: ConnectorFailure }> {
    const pages: ConnectorPage[] = [],
      seen = new Set<string>();
    const signal = AbortSignal.timeout(60_000);
    let pageCursor: string | null = null,
      records = 0,
      bytes = 0;

    for (let i = 0; i < MAX_PAGES; i++) {
      try {
        signal.throwIfAborted();
        const parsed = ConnectorResultSchema.safeParse(
          await connector.fetchPage({
            connectionId,
            checkpoint,
            pageCursor,
            signal,
          }),
        );
        signal.throwIfAborted();
        if (!parsed.success) return { failure: this.invalidData() };
        if (parsed.data.kind === "failure") return { failure: parsed.data };

        const page = parsed.data;
        if (
          pages.length &&
          new Date(page.observedAt) < new Date(pages.at(-1)!.observedAt)
        )
          return { failure: this.invalidData() };

        records +=
          page.accounts.length +
          page.movements.length +
          page.removedMovements.length +
          (page.suspendedMovements?.length ?? 0);
        bytes += Buffer.byteLength(JSON.stringify(page));
        if (records > MAX_SYNC_RECORDS || bytes > MAX_NORMALIZED_SYNC_BYTES)
          return { failure: this.invalidData() };

        pages.push(page);
        if (page.complete) return { pages };
        if (page.nextCursor === null || seen.has(page.nextCursor))
          return { failure: this.invalidData() };

        seen.add(page.nextCursor);
        pageCursor = page.nextCursor;
      } catch {
        return {
          failure: {
            kind: "failure",
            reason: "retryable",
            observedAt: new Date().toISOString(),
            retryAfter: null,
          },
        };
      }
    }

    return { failure: this.invalidData() };
  }
}

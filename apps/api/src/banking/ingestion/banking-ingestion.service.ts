import { Injectable } from '@nestjs/common';
import { BankingIngestionRepository, type SyncOutcome } from '../../persistence/repositories/banking-ingestion.repository';
import type { BankingConnector } from '../connector/banking-connector';
import {
  ConnectorResultSchema, type ConnectorFailure, type ConnectorPage,
} from '../connector/normalized-banking.schema';

const MAX_PAGES = 100;
const MAX_RECORDS = 50_000;

@Injectable()
export class BankingIngestionService {
  constructor(private readonly ingestion: BankingIngestionRepository) {}

  /** Provider payloads and credentials do not enter persistence until the pages have been validated. */
  async syncForUser(userId: string, connectionId: string, connector: BankingConnector): Promise<SyncOutcome> {
    const { checkpoint, revision } = await this.ingestion.startSyncForUser(userId, connectionId, connector.provider);
    const fetched = await this.fetchPages(connector, connectionId, checkpoint);
    if ('failure' in fetched) return this.ingestion.recordFailureForUser(userId, connectionId, revision, fetched.failure);

    return this.ingestion.applyBatchForUser(userId, connectionId, revision, fetched.pages);
  }

  listPendingReviewForUser(userId: string) {
    return this.ingestion.listPendingReviewForUser(userId);
  }

  private async fetchPages(connector: BankingConnector, connectionId: string, checkpoint: string | null): Promise<
    { pages: ConnectorPage[] } | { failure: ConnectorFailure }
  > {
    const pages: ConnectorPage[] = [];
    const seen = new Set<string>();
    let pageCursor: string | null = null;
    let recordCount = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      try {
        const parsed = ConnectorResultSchema.safeParse(await connector.fetchPage({ connectionId, checkpoint, pageCursor }));
        if (!parsed.success) return { failure: this.invalidData() };
        if (parsed.data.kind === 'failure') return { failure: parsed.data };
        const page = parsed.data;
        if (pages.length && new Date(page.observedAt) < new Date(pages.at(-1)!.observedAt)) {
          return { failure: this.invalidData() };
        }
        recordCount += page.accounts.length + page.movements.length + page.removedMovements.length;
        if (recordCount > MAX_RECORDS) return { failure: this.invalidData() };
        pages.push(page);
        if (page.complete) return { pages };
        if (page.nextCursor === null || seen.has(page.nextCursor)) return { failure: this.invalidData() };
        seen.add(page.nextCursor);
        pageCursor = page.nextCursor;
      } catch {
        return { failure: {
          kind: 'failure', reason: 'retryable', observedAt: new Date().toISOString(), retryAfter: null,
        } };
      }
    }
    return { failure: this.invalidData() };
  }

  private invalidData(): ConnectorFailure {
    return { kind: 'failure', reason: 'invalid_data', observedAt: new Date().toISOString(), retryAfter: null };
  }
}

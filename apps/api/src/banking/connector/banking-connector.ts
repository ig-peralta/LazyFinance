import type { ConnectorResult } from './normalized-banking.schema';

/** Backend-only boundary between a provider adapter and the ingestion service. */
export interface BankingConnector {
  readonly provider: string;

  /** The caller verifies connection ownership; the adapter resolves its credentials server-side. */
  fetchPage(input: Readonly<{
    connectionId: string;
    checkpoint: string | null;
    pageCursor: string | null;
  }>): Promise<ConnectorResult>;
}

import type {
  DemoBankAccount,
  DemoBankMovement,
} from "@lazyfinance/contracts/internal";
import type { ColumnType, Generated } from "kysely";

export interface DemoBankSourceTable {
  connectionId: string;
  userId: string;
  accounts: ColumnType<DemoBankAccount[], string, string>;
  movements: ColumnType<DemoBankMovement[], string, string>;
  failure: "retryable" | "expired" | null;
  prepared: Generated<boolean>;
  fixtureAsOf: Date;
  initialMovementCount: number;
  updatedAt: Generated<Date>;
}

export interface DemoBankSyncEventTable {
  id: Generated<string>;
  connectionId: string;
  userId: string;
  occurredAt: Date;
  origin: "generated" | "executed";
  result: "complete" | "needs_review" | "failed";
  movementCount: number;
  failureReason: string | null;
}

export type DemoBankTables = {
  "finance.demo_bank_source": DemoBankSourceTable;
  "finance.demo_bank_sync_event": DemoBankSyncEventTable;
};

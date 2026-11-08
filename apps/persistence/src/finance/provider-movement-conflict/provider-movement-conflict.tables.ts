export interface ProviderMovementConflictTable {
  transactionId: string;
  reason:
    | "receipt_incompatible"
    | "internal_override_disagrees"
    | "removed_confirmed_income"
    | "provider_unbooked";
  previousFacts: Record<string, unknown>;
  incomingFacts: Record<string, unknown>;
  observedAt: Date;
  resolvedAt: Date | null;
}

export type ProviderMovementConflictTables = {
  "finance.provider_movement_conflict": ProviderMovementConflictTable;
};

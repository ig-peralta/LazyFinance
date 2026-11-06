export interface ProviderMovementRemovalTable {
  providerConnectionId: string;
  accountExternalId: string;
  movementExternalId: string;
  reason: "removed" | "reversed";
  observedAt: Date;
  providerUpdatedAt: Date | null;
}

export type ProviderMovementRemovalTables = {
  "finance.provider_movement_removal": ProviderMovementRemovalTable;
};

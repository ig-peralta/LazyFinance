import type { Generated } from "kysely";

export interface TransactionTable {
  id: Generated<string>;
  accountId: string;
  tagId: string | null;
  tagDecisionOrigin: Generated<"unreviewed" | "manual" | "rule">;
  tagRuleId: string | null;
  tagDecidedAt: Date | null;
  bookedAt: Date;
  bookedPrecision: Generated<"instant" | "calendar_day">;
  bookedOn: string | null;
  amount: string;
  type: "debit" | "credit";
  source: Generated<"manual" | "provider">;
  merchant: string | null;
  description: string | null;
  externalId: string | null;
  providerUpdatedAt: Date | null;
  providerObservedAt: Date | null;
  providerKind:
    | "transfer"
    | "card_payment"
    | "reversal"
    | "other"
    | "unknown"
    | null;
  relationKind: "transfer_pair" | "card_payment_pair" | "reversal" | null;
  relatedAccountExternalId: string | null;
  relatedMovementExternalId: string | null;
  counterpartyHolder: { scheme: string; value: string } | null;
  isInternalMovement: boolean | null;
  providerInternalAssessment: Generated<"internal" | "external" | "unknown">;
  userInternalOverride: boolean | null;
  reviewStatus: Generated<"clear" | "needs_review">;
  removedAt: Date | null;
  removalReason: "removed" | "reversed" | null;
  createdAt: Generated<Date>;
}

export type TransactionTables = { "finance.transaction": TransactionTable };

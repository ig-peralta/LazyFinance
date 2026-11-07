import { z } from "zod";
import { TagSummarySchema } from "../tags/tag-summary.schema";
import { RecentTransactionSchema } from "../transactions/recent-transaction.schema";

export const RecentTransactionRecordSchema = RecentTransactionSchema.omit({
  account: true,
}).extend({
  accountId: z.uuid(),
  accountAlias: z.string().nullable(),
  accountType: z.enum(["checking", "savings", "credit_card"]),
  currency: z.literal("CLP"),
});

export const RecentTransactionRecordsSchema = z
  .array(RecentTransactionRecordSchema)
  .max(10);

export const MovementAggregateSchema = z.object({
  type: z.enum(["debit", "credit"]),
  isInternalMovement: z.boolean().nullable(),
  reviewStatus: z.enum(["clear", "needs_review"]),
  hasReceipt: z.boolean(),
  amount: z.string(),
  count: z.number().int().nonnegative(),
});

// 2 directions × 3 internal states × 2 review states × 2 receipt states.
export const MovementAggregatesSchema = z
  .array(MovementAggregateSchema)
  .max(24);

export const TaggedMovementAggregateSchema = MovementAggregateSchema.extend({
  tag: TagSummarySchema.nullable(),
});

export const TaggedMovementAggregatesSchema = z
  .array(TaggedMovementAggregateSchema)
  .max(50000);

export type MovementAggregate = z.infer<typeof MovementAggregateSchema>;

export type TaggedMovementAggregate = z.infer<
  typeof TaggedMovementAggregateSchema
>;

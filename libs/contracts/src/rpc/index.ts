import { z } from "zod";
import { AccountSummarySchema } from "../accounts";
import {
  IncomeExpectationInputSchema,
  IncomeExpectationSchema,
  IncomeReceiptSchema,
  IncomeSourceInputSchema,
  IncomeSourceSchema,
} from "../income";
import { BudgetProgressSchema, ObjectiveSummarySchema } from "../objectives";
import { MonthSchema } from "../summaries/month.schema";
import {
  TagRuleInputSchema,
  TagSuggestionSchema,
  TagSummarySchema,
} from "../tags";
import { RecentTransactionSchema } from "../transactions";

export const RpcEmptySchema = z.void();
export const RpcVoidSchema = z.void();
export const RpcIdSchema = z.strictObject({ id: z.uuid() });
export const RpcMonthSchema = z.strictObject({ month: MonthSchema.optional() });
export const AccountsResultSchema = z.array(AccountSummarySchema);
export const RecentTransactionsResultSchema = z.array(RecentTransactionSchema);
export const ObjectivesResultSchema = z.array(ObjectiveSummarySchema);
export const BudgetProgressResultSchema = z.array(BudgetProgressSchema);
export const TagsResultSchema = z.array(TagSummarySchema);
export const SuggestionsResultSchema = z.array(TagSuggestionSchema);
export const TagRuleResultSchema = z.object({
  id: z.uuid(),
  tagId: z.uuid(),
  accountId: z.uuid().nullable(),
  direction: z.enum(["debit", "credit"]),
  matchField: z.enum(["merchant", "description"]),
  matchValue: z.string(),
  priority: z.number().int(),
  mode: z.enum(["suggest", "auto"]),
  approvedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const TagRulesResultSchema = z.array(TagRuleResultSchema);
export const ReplaceTagRuleSchema = z.strictObject({
  id: z.uuid(),
  rule: TagRuleInputSchema,
});
export const ApplyTagRuleSchema = z.strictObject({
  id: z.uuid(),
  after: z.uuid().optional(),
});
export const AppliedTagRuleSchema = z.object({
  changed: z.number().int().nonnegative(),
  nextCursor: z.uuid().nullable(),
});
export const SetTagSchema = z.strictObject({
  transactionId: z.uuid(),
  tagId: z.uuid().nullable(),
});
export const IncomeSourcesResultSchema = z.array(IncomeSourceSchema);
export const IncomeExpectationsResultSchema = z.array(IncomeExpectationSchema);
export const IncomeReceiptsResultSchema = z.array(IncomeReceiptSchema);
export const ReplaceIncomeSourceSchema = z.strictObject({
  id: z.uuid(),
  source: IncomeSourceInputSchema,
});
export const CreateIncomeExpectationSchema = z.strictObject({
  sourceId: z.uuid(),
  expectation: IncomeExpectationInputSchema,
});
export const ReplaceIncomeExpectationSchema = z.strictObject({
  id: z.uuid(),
  expectation: IncomeExpectationInputSchema,
});
export const ConfirmIncomeReceiptSchema = z.strictObject({
  transactionId: z.uuid(),
  sourceId: z.uuid(),
});

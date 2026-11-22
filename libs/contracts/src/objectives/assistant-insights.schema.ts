import { z } from "zod";
import { MonthSchema } from "../summaries/month.schema";
import { TagSummarySchema } from "../tags";
import {
  SavingsHistoryCoverageSchema,
  SavingsTrackingSchema,
} from "./savings-progress.schema";

const amount = z.string();
const nonnegative = z.number().int().nonnegative();
const allocation = z.object({
  contributions: amount,
  withdrawals: amount,
  netContributions: amount,
  pendingCount: nonnegative,
  incompleteCoverage: z.boolean(),
});

export const MonthlyGoalAllocationSchema = allocation.extend({
  id: z.uuid(),
  name: z.string(),
  month: MonthSchema,
  basis: z.literal("recorded_allocations"),
  tracking: SavingsTrackingSchema,
  historyCoverage: SavingsHistoryCoverageSchema,
});

export const SavingsGoalsOverviewSchema = z.object({
  month: MonthSchema,
  asOf: z.iso.datetime(),
  totalGoals: nonnegative,
  hasMore: z.boolean(),
  goals: z
    .array(
      allocation.extend({
        id: z.uuid(),
        name: z.string(),
        period: z.enum(["cumulative", "monthly", "yearly", "fixed"]),
        target: amount,
        remaining: amount,
      }),
    )
    .max(12),
});

export const MonthlyBudgetPlanSchema = z.object({
  month: MonthSchema,
  asOf: z.iso.datetime(),
  total: amount.nullable(),
  budgetCount: nonnegative,
  hasMore: z.boolean(),
  totalReason: z.enum([
    "comparable",
    "no_budgets",
    "overlapping_tags",
    "mixed_periods",
    "partial_month",
    "different_windows",
    "changed_definitions",
  ]),
  budgets: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        period: z.enum(["monthly", "yearly", "fixed"]),
        limit: amount,
        spent: amount.nullable(),
        remaining: amount.nullable(),
        tags: z.array(TagSummarySchema),
        start: z.string(),
        end: z.string(),
        archivedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(12),
});

import { z } from "zod";
import { MonthSchema } from "../summaries/month.schema";

export const FinancialCoverageSchema = z.object({
  month: MonthSchema,
  asOf: z.iso.datetime(),
  accounts: z
    .array(
      z.object({
        id: z.uuid(),
        alias: z.string().nullable(),
        type: z.enum(["checking", "savings", "credit_card"]),
        lastSyncedAt: z.iso.datetime().nullable(),
        trackingStatus: z
          .enum(["tracked", "paused", "disconnected"])
          .nullable(),
        historyCompleteness: z.enum(["complete", "partial", "unknown"]),
        historyFrom: z.iso.date().nullable(),
        historyThrough: z.iso.date().nullable(),
        monthCovered: z.boolean(),
      }),
    )
    .max(1000),
  unresolvedMovementCount: z.number().int().nonnegative(),
  unclassifiedCreditCount: z.number().int().nonnegative(),
});

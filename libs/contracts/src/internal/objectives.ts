import { z } from "zod";
import { ObjectiveSummarySchema } from "../objectives/objective-summary.schema";
import { TagSummarySchema } from "../tags/tag-summary.schema";
import { LocalTimestampSchema } from "./common";

export const ObjectiveRecordSchema = ObjectiveSummarySchema.extend({
  tags: z.array(TagSummarySchema).max(50000),
});

export const ObjectiveRecordsSchema = z.array(ObjectiveRecordSchema).max(10000);

export const ObjectiveSpendingInputSchema = z.strictObject({
  windows: z
    .array(
      z
        .strictObject({
          id: z.uuid(),
          start: LocalTimestampSchema,
          end: LocalTimestampSchema,
        })
        .refine((window) => window.start < window.end, "Empty budget window"),
    )
    .min(1)
    .max(10000)
    .refine(
      (windows) => new Set(windows.map(({ id }) => id)).size === windows.length,
      "Duplicate budget windows",
    ),
  asOf: z.iso.datetime().optional(),
});

export const ObjectiveSpendingFactsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      amount: z.string(),
      count: z.number().int().nonnegative(),
    }),
  )
  .max(10000);

export type ObjectiveSpendingInput = z.infer<
  typeof ObjectiveSpendingInputSchema
>;

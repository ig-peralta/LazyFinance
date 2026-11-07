import { z } from "zod";
import { TagSummarySchema } from "../tags/tag-summary.schema";

export const TagRecordSchema = TagSummarySchema.extend({
  isArchived: z.boolean(),
});

export const TagRecordsSchema = z.array(TagRecordSchema).max(10000);

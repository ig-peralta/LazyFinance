import { z } from "zod";
import { TagCreateInputSchema } from "./tag-rule.schema";
import { TagSummarySchema } from "./tag-summary.schema";

export const UpdateTagSchema = TagCreateInputSchema.partial()
  .extend({
    id: z.uuid(),
    color: TagCreateInputSchema.shape.color.removeDefault().optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.color !== undefined,
    "Provide a name or color change",
  );

export const ManagedTagSchema = TagSummarySchema.extend({
  isArchived: z.boolean(),
});
export type UpdateTag = z.infer<typeof UpdateTagSchema>;

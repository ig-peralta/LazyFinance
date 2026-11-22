import { z } from "zod";
import { TagCreateInputSchema } from "./tag-rule.schema";
import { TagSummarySchema } from "./tag-summary.schema";

export const UpdateTagSchema = TagCreateInputSchema.partial()
  .extend({
    id: z.uuid(),
    color: TagCreateInputSchema.shape.color
      .removeDefault()
      .optional()
      .describe(
        "Color de reemplazo en formato interno #RRGGBB: interpreta el nombre o tono indicado, sin pedir un código. Omite este campo para conservar el color actual; null solo si pidió quitarlo.",
      ),
  })
  .refine(
    (input) => input.name !== undefined || input.color !== undefined,
    "Provide a name or color change",
  );

export const ManagedTagSchema = TagSummarySchema.extend({
  isArchived: z.boolean(),
});
export type UpdateTag = z.infer<typeof UpdateTagSchema>;

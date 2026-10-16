import { z } from 'zod';

export const TagSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
});

export type TagSummary = z.infer<typeof TagSummarySchema>;

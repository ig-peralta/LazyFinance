import { z } from "zod";

export const MAX_CURSOR_PAGE_SIZE = 100;

export const CursorPageInputSchema = z.strictObject({
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.number().int().min(1).max(MAX_CURSOR_PAGE_SIZE).default(25),
});

export const CursorPageInfoSchema = z
  .object({
    nextCursor: z.string().min(1).max(2048).nullable(),
    hasMore: z.boolean(),
  })
  .refine((page) => page.hasMore === (page.nextCursor !== null), {
    message: "A continuation cursor is required exactly when more items exist",
  });

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item).max(MAX_CURSOR_PAGE_SIZE),
    pageInfo: CursorPageInfoSchema,
  });
}

export type CursorPageInput = z.infer<typeof CursorPageInputSchema>;
export type CursorPageInfo = z.infer<typeof CursorPageInfoSchema>;

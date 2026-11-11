import { z } from "zod";

export const AccountSummarySchema = z.object({
  id: z.uuid(),
  alias: z.string().nullable(),
  type: z.enum(["checking", "savings", "credit_card"]),
  currency: z.literal("CLP"),
  balance: z.string().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
});

export type AccountSummary = z.infer<typeof AccountSummarySchema>;

/** Stored financial summary plus current tracking metadata for account management. */
export const AccountListItemSchema = AccountSummarySchema.extend({
  trackingStatus: z.enum(["tracked", "paused", "disconnected"]).nullable(),
});

export const SetAccountAliasSchema = z.strictObject({
  id: z.uuid(),
  alias: z
    .string()
    .refine(
      (value) => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value),
      "Control characters are not allowed",
    )
    .trim()
    .transform((value) => value.normalize("NFC"))
    .pipe(z.string().min(1).max(80))
    .nullable(),
});

export type AccountListItem = z.infer<typeof AccountListItemSchema>;
export type SetAccountAlias = z.infer<typeof SetAccountAliasSchema>;

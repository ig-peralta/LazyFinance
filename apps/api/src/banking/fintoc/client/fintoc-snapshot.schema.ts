import { z } from "zod";

const id = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(512);
const text = z.string().max(4096);
// Fintoc sends integer smallest units. Reject rounded JSON numbers and values
// outside the core's numeric(15,2) CLP representation before doing arithmetic.
const pesos = z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999);

export const FintocAccountSchema = z.object({
  id,
  object: z.literal("account"),
  type: z.string().min(1).max(100),
  currency: z.string().min(1).max(10),
  number: text.nullable(),
  holder_name: text.nullable(),
  removed_from_link: z.boolean(),
  refreshed_at: z.iso.datetime().nullable(),
  // Validate supported-currency balances separately; foreign currencies are
  // reported as unsupported, never converted or treated as CLP.
  balance: z.unknown(),
});

export const FintocCashBalanceSchema = z.object({
  current: pesos.nullable(),
});

const transferAccount = z.object({
  holder_id: text.nullable(),
});

export const FintocMovementSchema = z.object({
  id,
  object: z.literal("movement"),
  amount: pesos,
  currency: z.literal("CLP"),
  description: text.nullable(),
  pending: z.boolean(),
  status: z.enum(["confirmed", "processing", "reversed", "manually_reversed"]),
  post_date: z
    .string()
    .regex(/^[1-9]\d{3}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/)
    .refine((value) => z.iso.date().safeParse(value.slice(0, 10)).success),
  type: z.string().min(1).max(100),
  sender_account: transferAccount.nullable(),
  recipient_account: transferAccount.nullable(),
});

export type FintocAccount = z.infer<typeof FintocAccountSchema>;
export type FintocMovement = z.infer<typeof FintocMovementSchema>;

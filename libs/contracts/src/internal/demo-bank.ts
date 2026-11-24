import { z } from "zod";

const Money = z.string().regex(/^-?(0|[1-9]\d{0,12})\.\d{2}$/);
const ExternalId = z.string().min(1).max(512);

export const DemoBankAccountSchema = z.strictObject({
  externalId: ExternalId,
  type: z.enum(["checking", "savings", "credit_card"]),
  number: z.string().min(1).max(64),
  holderName: z.string().min(1).max(120),
  balance: Money,
});

export const DemoBankMovementSchema = z.strictObject({
  accountExternalId: ExternalId,
  externalId: ExternalId,
  bookedAt: z.iso.datetime(),
  amount: Money.refine((value) => value !== "0.00"),
  merchant: z.string().max(120).nullable(),
  description: z.string().max(240).nullable(),
  relatedMovement: z
    .strictObject({
      accountExternalId: ExternalId,
      externalId: ExternalId,
      kind: z.enum(["transfer_pair", "card_payment_pair"]),
    })
    .nullable(),
  removed: z.boolean(),
});

export const DemoBankSourceSchema = z.strictObject({
  connectionId: z.uuid(),
  updatedAt: z.iso.datetime(),
  accounts: z.array(DemoBankAccountSchema).length(6),
  movements: z.array(DemoBankMovementSchema).max(50000),
  failure: z.enum(["retryable", "expired"]).nullable(),
  prepared: z.boolean(),
});

export type DemoBankAccount = z.infer<typeof DemoBankAccountSchema>;
export type DemoBankMovement = z.infer<typeof DemoBankMovementSchema>;
export type DemoBankSource = z.infer<typeof DemoBankSourceSchema>;

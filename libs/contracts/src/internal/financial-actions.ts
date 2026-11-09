import { z } from "zod";
import {
  DirectFinancialActionSchema,
  FinancialActionRequestSchema,
  FinancialActionVersionSchema,
  TagActionRequestSchemas,
} from "../financial-actions";
import { BudgetWriteDefinitionSchema } from "./objectives";
import { SavingsWriteDefinitionSchema } from "./savings";

const commandSelection = {
  tagIds: z.array(z.uuid()).max(50),
  newTags: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(80),
        color: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .nullable(),
      }),
    )
    .max(5),
};
export const FinancialActionCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("create_budget"),
    definition: BudgetWriteDefinitionSchema.safeExtend(commandSelection),
  }),
  z.strictObject({
    kind: z.literal("create_savings_goal"),
    definition: SavingsWriteDefinitionSchema.safeExtend(commandSelection),
  }),
  ...TagActionRequestSchemas,
]);
export const PrepareFinancialActionSchema = z.strictObject({
  conversationId: z.uuid(),
  turnId: z.uuid(),
  action: FinancialActionRequestSchema,
  command: FinancialActionCommandSchema,
});
export const PreviewFinancialActionSchema = z.strictObject({
  action: FinancialActionRequestSchema,
});
export const ApplyFinancialActionSchema = FinancialActionVersionSchema.extend({
  command: FinancialActionCommandSchema.nullable(),
});
export const ReviseFinancialActionCommandSchema =
  FinancialActionVersionSchema.extend({
    action: FinancialActionRequestSchema,
    command: FinancialActionCommandSchema,
  });
export const ExecuteFinancialActionSchema = z.strictObject({
  input: DirectFinancialActionSchema,
  command: FinancialActionCommandSchema.nullable(),
  grantId: z.string().min(1).max(256),
  clientId: z.string().min(1).max(2048),
});
export type FinancialActionCommand = z.infer<
  typeof FinancialActionCommandSchema
>;
export type PrepareFinancialAction = z.infer<
  typeof PrepareFinancialActionSchema
>;
export type ExecuteFinancialAction = z.infer<
  typeof ExecuteFinancialActionSchema
>;

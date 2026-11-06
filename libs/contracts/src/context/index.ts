import { z } from "zod";
import { VerifiedExternalIdentitySchema } from "../auth/verified-external-identity.schema";

export const UserContextSchema = z.strictObject({
  kind: z.literal("user"),
  userId: z.uuid(),
  requestId: z.uuid(),
});
export const IdentityBootstrapContextSchema = z.strictObject({
  kind: z.literal("identity-bootstrap"),
  requestId: z.uuid(),
  identity: VerifiedExternalIdentitySchema,
});
export const PersistenceContextSchema = z.discriminatedUnion("kind", [
  UserContextSchema,
  IdentityBootstrapContextSchema,
]);
export type UserContext = z.infer<typeof UserContextSchema>;
export type IdentityBootstrapContext = z.infer<
  typeof IdentityBootstrapContextSchema
>;
export type PersistenceContext = z.infer<typeof PersistenceContextSchema>;

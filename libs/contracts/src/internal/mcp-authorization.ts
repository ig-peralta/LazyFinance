import { z } from "zod";
import { McpPermissionSchema } from "../financial-actions";
import { McpGrantSchema } from "../mcp-authorization";

// Only enabled oidc-provider models. Financial data never enters this store.
export const McpArtifactModelSchema = z.enum([
  "AccessToken",
  "AuthorizationCode",
  "Client",
  "Grant",
  "Interaction",
  "RefreshToken",
  "ReplayDetection",
  "Session",
  "RegistrationAccessToken",
]);

export const McpArtifactKeySchema = z.strictObject({
  model: McpArtifactModelSchema,
  key: z.string().regex(/^[a-f0-9]{64}$/),
});

export const McpArtifactSaveResultSchema = z.object({ saved: z.boolean() });
export const McpArtifactConsumeResultSchema = z.object({
  consumed: z.boolean(),
});
export const McpArtifactDestroyResultSchema = z.object({ ok: z.literal(true) });

export const SaveMcpArtifactSchema = McpArtifactKeySchema.extend({
  ciphertext: z.string().min(1).max(350_000),
  grantId: z.string().min(1).max(256).nullable(),
  accountId: z.uuid().nullable(),
  clientId: z.string().min(1).max(2048).nullable(),
  uidHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  expiresIn: z.number().int().min(1).max(2_592_000).nullable(),
}).refine(
  (value) => (value.expiresIn === null) === (value.model === "Client"),
  "Only client registrations have no artifact expiry",
);

export const McpArtifactSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  ciphertext: z.string(),
  consumedAt: z.iso.datetime().nullable(),
});

export const FindMcpArtifactSchema = McpArtifactKeySchema.extend({
  byUid: z.boolean().default(false),
});

export const BindMcpGrantSchema = z.strictObject({
  id: z.string().min(1).max(256),
  key: z.string().regex(/^[a-f0-9]{64}$/),
  interactionId: z.string().min(1).max(256),
  clientId: z.string().min(1).max(2048),
  clientName: z.string().min(1).max(200),
  redirectUri: z.url().max(2048).nullable().optional(),
  resource: z.url().max(2048),
  scopes: z.array(McpPermissionSchema).min(1).max(7),
});

export const McpGrantIdentitySchema = McpGrantSchema.extend({
  userId: z.uuid(),
});
export type SaveMcpArtifact = z.infer<typeof SaveMcpArtifactSchema>;
export type McpArtifactKey = z.infer<typeof McpArtifactKeySchema>;
export type FindMcpArtifact = z.infer<typeof FindMcpArtifactSchema>;
export type BindMcpGrant = z.infer<typeof BindMcpGrantSchema>;

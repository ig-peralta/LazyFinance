import { z } from "zod";
import { FinancialWriteScopeSchema } from "./financial-actions";

export const McpGrantIdSchema = z.strictObject({
  id: z.string().min(1).max(256),
});
export const McpAccessConfigurationSchema = z.object({ enabled: z.boolean() });
export const McpRevokeResultSchema = z.object({ revoked: z.boolean() });

export const McpGrantSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  redirectUri: z.url().max(2048).nullable().optional(),
  resource: z.url(),
  scopes: z.array(z.string()),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const McpGrantsSchema = z.array(McpGrantSchema).max(100);
export type McpGrant = z.infer<typeof McpGrantSchema>;

// OAuth interaction HTTP responses, not third-party tool or token responses.
export const McpConsentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  redirectUri: z.url(),
  resource: z.url(),
  scopes: z.array(z.string()),
  expiresAt: z.iso.datetime(),
});

export const McpConsentDecisionSchema = z.strictObject({
  approve: z.boolean(),
  scopes: z.array(FinancialWriteScopeSchema).max(4).optional(),
});
export const McpConsentResultSchema = z.object({ redirectTo: z.url() });

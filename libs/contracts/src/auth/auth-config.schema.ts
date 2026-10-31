import { z } from 'zod';

export const AuthProviderSchema = z.enum(['firebase', 'mock']);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

export const AuthConfigSchema = z.object({ provider: AuthProviderSchema }).strict();
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

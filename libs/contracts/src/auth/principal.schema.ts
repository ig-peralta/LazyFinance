import { z } from 'zod';

export const AuthPrincipalSchema = z.object({
  userId: z.string().min(1),
  email: z.string(),
  name: z.string(),
});

export type AuthPrincipal = z.infer<typeof AuthPrincipalSchema>;

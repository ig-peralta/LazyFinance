import { z } from 'zod';

/** Only a server-side verifier may produce a trusted identity. Parsing this shape is not authentication. */
export const VerifiedExternalIdentitySchema = z.object({
  provider: z.string().min(1),
  issuer: z.url(),
  providerSubject: z.string().min(1),
  verifiedEmail: z.email().nullable(),
  displayName: z.string().min(1).nullable(),
}).strict();

export type VerifiedExternalIdentity = z.infer<typeof VerifiedExternalIdentitySchema>;

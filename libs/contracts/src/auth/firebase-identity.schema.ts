import { z } from 'zod';

/** Only a server-side token verifier may produce a trusted identity. Parsing this shape is not authentication. */
export const FirebaseIdentitySchema = z.object({
  provider: z.literal('firebase'),
  projectId: z.string().min(1),
  providerSubject: z.string().min(1),
  verifiedEmail: z.email().nullable(),
  displayName: z.string().min(1).nullable(),
}).strict();

export type FirebaseIdentity = z.infer<typeof FirebaseIdentitySchema>;

import { z } from 'zod';

export const MockLoginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
}).strict();
export type MockLoginInput = z.infer<typeof MockLoginInputSchema>;

export const MockLoginResultSchema = z.object({ token: z.string().min(1) }).strict();
export type MockLoginResult = z.infer<typeof MockLoginResultSchema>;

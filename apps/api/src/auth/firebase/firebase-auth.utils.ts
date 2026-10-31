import { cert, type AppOptions } from 'firebase-admin/app';

const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
]);

export function isInvalidToken(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return typeof error.code === 'string' && invalidTokenCodes.has(error.code);
}

/** Handle literal, escaped and double-escaped PEM newlines from environment variables. */
export function normalizePrivateKey(privateKey: string): string {
  return privateKey
    .replace(/^["']+|["']+$/g, '')
    .replace(/\\\\n/g, '\\n')
    .replace(/\\n/g, '\n')
    .trim();
}

export function firebaseAppOptions(projectId: string, clientEmail?: string, privateKey?: string): AppOptions {
  return clientEmail && privateKey
    ? { projectId, credential: cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) }) }
    : { projectId };
}

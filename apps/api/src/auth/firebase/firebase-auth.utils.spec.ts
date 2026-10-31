import { describe, expect, it } from 'vitest';
import { isInvalidToken, normalizePrivateKey } from './firebase-auth.utils';

describe('Firebase Auth helpers', () => {
  it.each([
    '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----\\\\nkey\\\\n-----END PRIVATE KEY-----',
  ])('normalizes PEM keys with literal or escaped newlines', (key) => {
    expect(normalizePrivateKey(key)).toBe('-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----');
  });

  it('distinguishes rejected ID tokens from SDK availability failures', () => {
    expect(isInvalidToken({ code: 'auth/id-token-expired' })).toBe(true);
    expect(isInvalidToken({ code: 'auth/argument-error' })).toBe(true);
    expect(isInvalidToken({ code: 'auth/internal-error' })).toBe(false);
    expect(isInvalidToken(new Error('network failure'))).toBe(false);
  });
});

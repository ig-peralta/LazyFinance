import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentService } from '../../environment/environment.service';
import { FirebaseIdTokenVerifier, normalizePrivateKey } from './firebase-id-token.verifier';

const admin = vi.hoisted(() => {
  const apps: { name: string; options: { projectId: string } }[] = [];
  return {
    apps,
    cert: vi.fn((account: { projectId: string; clientEmail: string; privateKey: string }) => ({ account })),
    initializeApp: vi.fn((options: { projectId: string; credential?: unknown }, name: string) => {
      const app = { name, options };
      apps.push(app);
      return app;
    }),
    verifyIdToken: vi.fn(),
  };
});

vi.mock('firebase-admin/app', () => ({
  cert: admin.cert,
  getApps: () => admin.apps,
  initializeApp: admin.initializeApp,
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: admin.verifyIdToken }),
}));

const projectId = 'lazyfinance-dev';
const decoded = {
  uid: 'firebase-user-1',
  aud: projectId,
  iss: `https://securetoken.google.com/${projectId}`,
  email: 'verified@example.com',
  email_verified: true,
  name: 'Finance User',
};

function verifier(config: { projectId?: string; clientEmail?: string; privateKey?: string } = { projectId }): FirebaseIdTokenVerifier {
  const environment = {
    get: (key: string) => ({
      FIREBASE_PROJECT_ID: config.projectId,
      FIREBASE_CLIENT_EMAIL: config.clientEmail,
      FIREBASE_PRIVATE_KEY: config.privateKey,
    })[key as 'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY'],
  } as unknown as EnvironmentService;
  return new FirebaseIdTokenVerifier(environment);
}

describe('Firebase ID token verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.apps.length = 0;
    admin.verifyIdToken.mockResolvedValue(decoded);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('verifies with the configured project and returns an external identity, never a financial user ID', async () => {
    await expect(verifier().verify('signed-id-token')).resolves.toEqual({
      provider: 'firebase',
      projectId,
      providerSubject: decoded.uid,
      verifiedEmail: decoded.email,
      displayName: decoded.name,
    });
    expect(admin.initializeApp).toHaveBeenCalledExactlyOnceWith(
      { projectId }, `lazyfinance-auth-${projectId}`,
    );
    expect(admin.verifyIdToken).toHaveBeenCalledExactlyOnceWith('signed-id-token');
  });

  it('does not use an unverified or missing email as an identity link', async () => {
    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email_verified: false });
    await expect(verifier().verify('signed-id-token')).resolves.toMatchObject({ verifiedEmail: null });

    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email: undefined });
    await expect(verifier().verify('signed-id-token')).resolves.toMatchObject({ verifiedEmail: null });
  });

  it('keeps distinct Firebase subjects separate even when their verified email matches', async () => {
    admin.verifyIdToken.mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce({ ...decoded, uid: 'firebase-user-2' });
    const first = await verifier().verify('first-token');
    const second = await verifier().verify('second-token');

    expect(first.verifiedEmail).toBe(second.verifiedEmail);
    expect(first.providerSubject).not.toBe(second.providerSubject);
  });

  it.each(['', ' ', undefined])('rejects an absent ID token without calling Firebase: %s', async (token) => {
    await expect(verifier().verify(token as string)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed', 'auth/argument-error'],
    ['expired', 'auth/id-token-expired'],
    ['invalid', 'auth/invalid-id-token'],
  ])('rejects %s tokens reported by Firebase without disclosing SDK details', async (_case, code) => {
    admin.verifyIdToken.mockRejectedValueOnce({ code, message: 'SDK detail' });
    await expect(verifier().verify('rejected-id-token')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid Firebase ID token',
    });
  });

  it.each([
    { aud: 'another-project' },
    { iss: 'https://securetoken.google.com/another-project' },
    { uid: '' },
  ])('rejects claims outside the configured project or with no subject: %j', async (claims) => {
    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, ...claims });
    await expect(verifier().verify('signed-id-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed verified identity claims', async () => {
    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email: 'not-an-email' });
    await expect(verifier().verify('signed-id-token'))
      .rejects.toMatchObject({ status: 401, message: 'Invalid Firebase identity claims' });
  });

  it('does not turn SDK availability failures into invalid-user errors', async () => {
    admin.verifyIdToken.mockRejectedValueOnce(new Error('Could not fetch verification keys'));
    await expect(verifier().verify('signed-id-token'))
      .rejects.toThrow('Could not fetch verification keys');
  });

  it('requires an explicit Firebase project when verification is used', async () => {
    await expect(verifier({}).verify('signed-id-token'))
      .rejects.toThrow('FIREBASE_PROJECT_ID is required');
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });

  it('reuses the Admin app for the same project', async () => {
    await verifier().verify('first-token');
    await verifier().verify('second-token');
    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
  });

  it('configures Admin with the paired service account when one is supplied', async () => {
    const clientEmail = 'firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com';
    await verifier({
      projectId,
      clientEmail,
      privateKey: '"-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----"',
    }).verify('signed-id-token');

    expect(admin.cert).toHaveBeenCalledExactlyOnceWith({
      projectId,
      clientEmail,
      privateKey: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
    });
    expect(admin.initializeApp).toHaveBeenCalledWith(
      { projectId, credential: admin.cert.mock.results[0].value },
      `lazyfinance-auth-${projectId}`,
    );
  });

  it.each([
    '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----\\\\nkey\\\\n-----END PRIVATE KEY-----',
  ])('normalizes PEM keys with literal or escaped newlines', (key) => {
    expect(normalizePrivateKey(key)).toBe('-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----');
  });

  it('does not require service-account credentials for ID-token verification', async () => {
    await verifier().verify('signed-id-token');
    expect(admin.cert).not.toHaveBeenCalled();
    expect(admin.initializeApp).toHaveBeenCalledWith({ projectId }, `lazyfinance-auth-${projectId}`);
  });

  it('fails closed if production would accept unsigned Auth emulator tokens', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    await expect(verifier().verify('signed-id-token'))
      .rejects.toThrow('cannot be accepted in production');
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });
});

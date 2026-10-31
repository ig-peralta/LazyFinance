import { VerifiedExternalIdentitySchema } from '@lazyfinance/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentService } from '../../environment/environment.service';
import { FirebaseAuthService } from './firebase-auth.service';

const admin = vi.hoisted(() => {
  const apps: { name: string; options: { projectId: string } }[] = [];
  const verifyIdToken = vi.fn();
  return {
    apps,
    cert: vi.fn((account: { projectId: string; clientEmail: string; privateKey: string }) => ({ account })),
    getAuth: vi.fn(() => ({ verifyIdToken })),
    initializeApp: vi.fn((options: { projectId: string; credential?: unknown }, name: string) => {
      const app = { name, options };
      apps.push(app);
      return app;
    }),
    verifyIdToken,
  };
});

vi.mock('firebase-admin/app', () => ({
  cert: admin.cert,
  getApps: () => admin.apps,
  initializeApp: admin.initializeApp,
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: admin.getAuth,
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

function service(config: {
  provider?: 'firebase' | 'mock';
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
} = { projectId }): FirebaseAuthService {
  const environment = {
    get: (key: string) => ({
      AUTH_PROVIDER: config.provider ?? 'firebase',
      FIREBASE_PROJECT_ID: config.projectId,
      FIREBASE_CLIENT_EMAIL: config.clientEmail,
      FIREBASE_PRIVATE_KEY: config.privateKey,
    })[key as 'AUTH_PROVIDER' | 'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY'],
  } as unknown as EnvironmentService;
  const firebase = new FirebaseAuthService(environment);
  firebase.onModuleInit();
  return firebase;
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
    const firebase = service();
    expect(admin.initializeApp).toHaveBeenCalledExactlyOnceWith(
      { projectId }, `lazyfinance-auth-${projectId}`,
    );
    expect(admin.getAuth).toHaveBeenCalledOnce();
    await expect(firebase.verify('signed-id-token')).resolves.toEqual({
      provider: 'firebase',
      issuer: decoded.iss,
      providerSubject: decoded.uid,
      verifiedEmail: decoded.email,
      displayName: decoded.name,
    });
    expect(admin.verifyIdToken).toHaveBeenCalledExactlyOnceWith('signed-id-token');
  });

  it('uses an external identity contract that can represent another verified issuer', () => {
    expect(VerifiedExternalIdentitySchema.parse({
      provider: 'oidc',
      issuer: 'https://login.example.com',
      providerSubject: 'external-user-1',
      verifiedEmail: null,
      displayName: null,
    })).toMatchObject({ provider: 'oidc', providerSubject: 'external-user-1' });
  });

  it('does not use an unverified or missing email as an identity link', async () => {
    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email_verified: false });
    await expect(service().verify('signed-id-token')).resolves.toMatchObject({ verifiedEmail: null });

    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email: undefined });
    await expect(service().verify('signed-id-token')).resolves.toMatchObject({ verifiedEmail: null });
  });

  it('keeps distinct Firebase subjects separate even when their verified email matches', async () => {
    admin.verifyIdToken.mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce({ ...decoded, uid: 'firebase-user-2' });
    const firebase = service();
    const first = await firebase.verify('first-token');
    const second = await firebase.verify('second-token');

    expect(first.verifiedEmail).toBe(second.verifiedEmail);
    expect(first.providerSubject).not.toBe(second.providerSubject);
  });

  it.each(['', ' ', undefined])('rejects an absent ID token without calling Firebase: %s', async (token) => {
    await expect(service().verify(token as string)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed', 'auth/argument-error'],
    ['expired', 'auth/id-token-expired'],
    ['invalid', 'auth/invalid-id-token'],
  ])('rejects %s tokens reported by Firebase without disclosing SDK details', async (_case, code) => {
    admin.verifyIdToken.mockRejectedValueOnce({ code, message: 'SDK detail' });
    await expect(service().verify('rejected-id-token')).rejects.toMatchObject({
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
    await expect(service().verify('signed-id-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed verified identity claims', async () => {
    admin.verifyIdToken.mockResolvedValueOnce({ ...decoded, email: 'not-an-email' });
    await expect(service().verify('signed-id-token'))
      .rejects.toMatchObject({ status: 401, message: 'Invalid Firebase identity claims' });
  });

  it('does not turn SDK availability failures into invalid-user errors', async () => {
    admin.verifyIdToken.mockRejectedValueOnce(new Error('Could not fetch verification keys'));
    await expect(service().verify('signed-id-token'))
      .rejects.toThrow('Could not fetch verification keys');
  });

  it('requires an explicit Firebase project at startup', () => {
    expect(() => service({})).toThrow('FIREBASE_PROJECT_ID is required');
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });

  it('initializes the Admin app once and reuses Auth across requests', async () => {
    const firebase = service();
    firebase.onModuleInit();
    await firebase.verify('first-token');
    await firebase.verify('second-token');
    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    expect(admin.getAuth).toHaveBeenCalledTimes(1);
  });

  it('reuses an already initialized Admin app for the project', async () => {
    const existing = { name: `lazyfinance-auth-${projectId}`, options: { projectId } };
    admin.apps.push(existing);
    await service().verify('signed-id-token');
    expect(admin.initializeApp).not.toHaveBeenCalled();
    expect(admin.getAuth).toHaveBeenCalledExactlyOnceWith(existing);
  });

  it('configures Admin with the paired service account when one is supplied', async () => {
    const clientEmail = 'firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com';
    const firebase = service({
      projectId,
      clientEmail,
      privateKey: '"-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----"',
    });
    await firebase.verify('signed-id-token');

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

  it('does not require service-account credentials for ID-token verification', async () => {
    await service().verify('signed-id-token');
    expect(admin.cert).not.toHaveBeenCalled();
    expect(admin.initializeApp).toHaveBeenCalledWith({ projectId }, `lazyfinance-auth-${projectId}`);
  });

  it('fails closed at startup if production would accept unsigned Auth emulator tokens', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    expect(() => service()).toThrow('cannot be accepted in production');
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });

  it('does not initialize Firebase when the mock provider is selected', async () => {
    const firebase = service({ provider: 'mock' });
    expect(admin.initializeApp).not.toHaveBeenCalled();
    expect(admin.getAuth).not.toHaveBeenCalled();
    await expect(firebase.verify('signed-id-token')).rejects.toThrow('Firebase Auth is not initialized');
  });
});

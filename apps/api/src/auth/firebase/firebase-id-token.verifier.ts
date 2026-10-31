import { FirebaseIdentitySchema, type FirebaseIdentity } from '@lazyfinance/contracts';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { EnvironmentService } from '../../environment/environment.service';

const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
]);

function isInvalidToken(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return typeof error.code === 'string' && invalidTokenCodes.has(error.code);
}

@Injectable()
export class FirebaseIdTokenVerifier {
  constructor(private readonly environment: EnvironmentService) {}

  async verify(idToken: string): Promise<FirebaseIdentity> {
    if (typeof idToken !== 'string' || !idToken.trim()) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const projectId = this.environment.get('FIREBASE_PROJECT_ID');
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required to verify Firebase ID tokens');
    if (process.env['NODE_ENV'] === 'production' && process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
      throw new Error('Firebase Auth emulator tokens cannot be accepted in production');
    }

    const name = `lazyfinance-auth-${projectId}`;
    const app = getApps().find((candidate) => candidate.name === name)
      ?? initializeApp(this.appOptions(projectId), name);

    let decoded;
    try {
      decoded = await getAuth(app).verifyIdToken(idToken);
    } catch (error) {
      if (isInvalidToken(error)) throw new UnauthorizedException('Invalid Firebase ID token');
      throw error;
    }

    // The Admin SDK checks the signature, lifetime, issuer and audience; keep the
    // project boundary explicit even if a different Auth instance is injected later.
    if (!decoded.uid?.trim() || decoded.aud !== projectId ||
      decoded.iss !== `https://securetoken.google.com/${projectId}`) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const identity = FirebaseIdentitySchema.safeParse({
      provider: 'firebase',
      projectId,
      providerSubject: decoded.uid,
      verifiedEmail: decoded.email_verified === true ? (decoded.email ?? null) : null,
      displayName: decoded.name?.trim() || null,
    });
    if (!identity.success) throw new UnauthorizedException('Invalid Firebase identity claims');
    return identity.data;
  }

  private appOptions(projectId: string) {
    const clientEmail = this.environment.get('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.environment.get('FIREBASE_PRIVATE_KEY');
    return clientEmail && privateKey
      ? { projectId, credential: cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) }) }
      : { projectId };
  }
}

/** Handle literal, escaped and double-escaped PEM newlines from environment variables. */
export function normalizePrivateKey(privateKey: string): string {
  return privateKey
    .replace(/^["']+|["']+$/g, '')
    .replace(/\\\\n/g, '\\n')
    .replace(/\\n/g, '\n')
    .trim();
}

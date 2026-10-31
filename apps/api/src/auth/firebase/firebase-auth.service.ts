import { VerifiedExternalIdentitySchema, type VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { Injectable, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { EnvironmentService } from '../../environment/environment.service';
import { firebaseAppOptions, isInvalidToken } from './firebase-auth.utils';

@Injectable()
export class FirebaseAuthService implements OnModuleInit {
  private app: App | null = null;
  private auth: Auth | null = null;
  private projectId: string | null = null;

  constructor(private readonly environment: EnvironmentService) {}

  onModuleInit(): void {
    if (this.environment.get('AUTH_PROVIDER') !== 'firebase' || this.app) return;

    const projectId = this.environment.get('FIREBASE_PROJECT_ID');
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required to verify Firebase ID tokens');
    if (process.env['NODE_ENV'] === 'production' && process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
      throw new Error('Firebase Auth emulator tokens cannot be accepted in production');
    }

    const name = `lazyfinance-auth-${projectId}`;
    const app = getApps().find((candidate) => candidate.name === name)
      ?? initializeApp(firebaseAppOptions(
        projectId,
        this.environment.get('FIREBASE_CLIENT_EMAIL'),
        this.environment.get('FIREBASE_PRIVATE_KEY'),
      ), name);
    this.auth = getAuth(app);
    this.app = app;
    this.projectId = projectId;
  }

  async verify(idToken: string): Promise<VerifiedExternalIdentity> {
    if (typeof idToken !== 'string' || !idToken.trim()) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
    if (!this.auth || !this.projectId) throw new Error('Firebase Auth is not initialized');

    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(idToken);
    } catch (error) {
      if (isInvalidToken(error)) throw new UnauthorizedException('Invalid Firebase ID token');
      throw error;
    }

    // The Admin SDK checks the signature, lifetime, issuer and audience; keep the
    // project boundary explicit even if a different Auth instance is injected later.
    if (!decoded.uid?.trim() || decoded.aud !== this.projectId ||
      decoded.iss !== `https://securetoken.google.com/${this.projectId}`) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const identity = VerifiedExternalIdentitySchema.safeParse({
      provider: 'firebase',
      issuer: decoded.iss,
      providerSubject: decoded.uid,
      verifiedEmail: decoded.email_verified === true ? (decoded.email ?? null) : null,
      displayName: decoded.name?.trim() || null,
    });
    if (!identity.success) throw new UnauthorizedException('Invalid Firebase identity claims');
    return identity.data;
  }
}

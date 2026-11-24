import { randomBytes } from "node:crypto";
import type {
  MockLoginResult,
  VerifiedExternalIdentity,
} from "@lazyfinance/contracts";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { mockIdentity } from "./mock-auth.constants";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 1024;

type MockIdentity = Readonly<
  VerifiedExternalIdentity & Pick<typeof mockIdentity, "provider" | "issuer">
>;

@Injectable()
export class MockAuthService {
  private readonly sessions = new Map<
    string,
    { identity: MockIdentity; expiresAt: number }
  >();

  identify(email: string): MockIdentity {
    if (email === mockIdentity.verifiedEmail) return mockIdentity;

    return {
      provider: mockIdentity.provider,
      issuer: mockIdentity.issuer,
      providerSubject: `email:${email}`,
      // This is a syntactic claim in the mock namespace, not proof of email ownership.
      verifiedEmail: email,
      displayName: null,
    };
  }

  issueSession(identity: MockIdentity): MockLoginResult {
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (!oldest.done) this.sessions.delete(oldest.value);
    }

    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, {
      identity,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return { token };
  }

  verify(token: string): MockIdentity {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException("Invalid or expired mock session");
    }

    return session.identity;
  }
}

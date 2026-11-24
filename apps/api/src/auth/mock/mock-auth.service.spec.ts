import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { mockIdentity } from "./mock-auth.constants";
import { MockAuthService } from "./mock-auth.service";

describe("MockAuthService", () => {
  it("keeps the legacy demo subject", () => {
    const service = new MockAuthService();
    expect(service.identify("demo@lazyfinance.cl")).toMatchObject({
      provider: "mock",
      issuer: "https://mock.lazyfinance.cl",
      providerSubject: "demo",
    });
  });

  it("issues independent tokens bound to their mock identities", () => {
    const service = new MockAuthService();
    const a = service.identify("a@example.test");
    const b = service.identify("b@example.test");
    const first = service.issueSession(a).token;
    const second = service.issueSession(b).token;
    expect(first).not.toBe(second);
    expect(service.issueSession(a).token).not.toBe(first);
    expect(service.verify(first)).toEqual(a);
    expect(service.verify(second)).toEqual(b);
    expect(service.verify(first)).not.toHaveProperty("userId");
    expect(service.verify(first)).not.toHaveProperty("password");
  });

  it("refuses the old shared token and sessions from another process", () => {
    const service = new MockAuthService();
    const { token } = service.issueSession(mockIdentity);
    expect(() => new MockAuthService().verify(token)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verify("lazyfinance-demo-token")).toThrow(
      UnauthorizedException,
    );
  });

  it("expires a mock session after eight hours", () => {
    vi.useFakeTimers();
    try {
      const service = new MockAuthService();
      const { token } = service.issueSession(mockIdentity);
      vi.advanceTimersByTime(8 * 60 * 60 * 1000 - 1);
      expect(service.verify(token)).toEqual(mockIdentity);
      vi.advanceTimersByTime(1);
      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    } finally {
      vi.useRealTimers();
    }
  });
});

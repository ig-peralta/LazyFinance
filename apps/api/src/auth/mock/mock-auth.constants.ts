import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";

/** Keep the original demo subject so that local demo accounts retain ownership. */
export const mockIdentity = {
  provider: "mock",
  issuer: "https://mock.lazyfinance.cl",
  providerSubject: "demo",
  verifiedEmail: "demo@lazyfinance.cl",
  displayName: "Camila Rojas",
} as const satisfies VerifiedExternalIdentity;

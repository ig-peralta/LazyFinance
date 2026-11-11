import type { BankingConnection } from "@lazyfinance/contracts";
import type { ProviderLinkSecret } from "@lazyfinance/contracts/internal";
import type { FintocLink } from "../../../src/banking/fintoc/client/fintoc-client";
import type { FintocRequestAdmission } from "../../../src/banking/fintoc/client/fintoc-request-admission";
import { testEnvironment } from "../environment";

/** Transport tests isolate admission; dedicated admission/RPC tests exercise quotas. */
export function fintocAdmission(): FintocRequestAdmission {
  const stub: Pick<FintocRequestAdmission, "acquire" | "release" | "defer"> = {
    acquire: async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      expiresAt: new Date(Date.now() + 25_000).toISOString(),
    }),
    release: async () => {},
    defer: async () => {},
  };
  return stub as FintocRequestAdmission;
}

export const fintocEnvironment = () =>
  testEnvironment({
    FINTOC_PUBLIC_KEY: "pk_test_fixture",
    FINTOC_SECRET_KEY: "sk_test_fixture",
    FINTOC_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
  });
export const fintocIntent = {
  id: "li_fixture",
  object: "link_intent",
  country: "cl",
  holder_type: "individual",
  product: "movements",
  status: "created",
  mode: "test",
  widget_token: "li_fixture_sec_fixture",
};
export const fintocLink = {
  id: "link_fixture",
  object: "link",
  mode: "test",
  holder_type: "individual",
  active: true,
  status: "active",
  institution: { id: "cl_test", name: "Sandbox bank", country: "cl" },
  link_token: "link_fixture_token_private",
  accounts: [],
} satisfies FintocLink & { accounts: unknown[] };
export const bankingConnection = {
  id: "00000000-0000-4000-8000-000000000081",
  provider: "fintoc",
  mode: "test",
  holderType: "individual",
  institution: { id: "cl_test", name: "Sandbox bank" },
  status: "active",
  disconnectedAt: null,
  disconnectPending: false,
  createdAt: "2026-11-08T15:00:00.000Z",
  updatedAt: "2026-11-08T15:00:00.000Z",
} satisfies BankingConnection;
export const storedLink = {
  connection: bankingConnection,
  version: 0,
  externalId: "link_fixture",
  encryptedCredential: "encrypted-fixture",
} satisfies ProviderLinkSecret;

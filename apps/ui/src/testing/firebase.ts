import type { User, UserInfo } from "firebase/auth";
import { vi } from "vitest";

/** Complete public SDK user contract; unused SDK methods fail loudly. */
export function firebaseUser(
  uid: string,
  token: string,
  providers = ["google.com"],
  emailVerified = true,
) {
  let currentToken = token;
  const providerData = (ids: string[]): UserInfo[] =>
    ids.map((providerId) => ({
      uid,
      providerId,
      email: `${uid}@example.com`,
      displayName: "Test user",
      phoneNumber: null,
      photoURL: null,
    }));
  const user = {
    uid,
    providerId: "firebase",
    email: `${uid}@example.com`,
    emailVerified,
    displayName: "Test user",
    phoneNumber: null,
    photoURL: null,
    isAnonymous: false,
    metadata: {},
    providerData: providerData(providers),
    refreshToken: "fixture-refresh-token",
    tenantId: null,
    getIdToken: vi.fn(async (_forceRefresh?: boolean) => currentToken),
    getIdTokenResult: vi.fn<User["getIdTokenResult"]>(async () => {
      throw new Error("Unexpected getIdTokenResult call");
    }),
    delete: vi.fn<User["delete"]>(async () => {
      throw new Error("Unexpected user deletion");
    }),
    reload: vi.fn<User["reload"]>(async () => {
      throw new Error("Use the mocked reload SDK operation");
    }),
    toJSON: () => ({ uid }),
  } satisfies User;

  return {
    user,
    setToken: (next: string) => {
      currentToken = next;
    },
    setProviders: (ids: string[]) => {
      user.providerData = providerData(ids);
    },
  };
}

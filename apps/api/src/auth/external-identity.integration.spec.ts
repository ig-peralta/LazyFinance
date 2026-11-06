import { randomUUID } from "node:crypto";
import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { identityApi } from "../../test/identity-api";
import { integration } from "../../test/persistence";

describe.skipIf(!integration)(
  "Firebase principal provisioning through both tRPC services",
  () => {
    const issuer = `https://securetoken.google.com/test-${randomUUID()}`;
    const identities = new Map<string, VerifiedExternalIdentity>();
    let api: Awaited<ReturnType<typeof identityApi>>;
    const verified = (
      email: string | null,
      providerSubject = randomUUID(),
    ): VerifiedExternalIdentity => ({
      provider: "firebase",
      issuer,
      providerSubject,
      verifiedEmail: email,
      displayName: "Test User",
    });
    function principalFor(identity: VerifiedExternalIdentity) {
      const token = randomUUID();
      identities.set(token, identity);

      return api.client(token).auth.principal.query();
    }
    beforeAll(async () => {
      api = await identityApi(identities);
    });
    afterAll(async () => api?.close());
    it("creates one stable financial user and ignores subsequent email/name changes", async () => {
      const identity = verified(`${randomUUID()}@example.test`),
        first = await principalFor(identity);
      expect(first).toEqual({
        userId: expect.any(String),
        email: identity.verifiedEmail,
        name: "Test User",
      });
      expect(
        await principalFor({
          ...identity,
          verifiedEmail: null,
          displayName: "Changed",
        }),
      ).toEqual(first);
      expect(
        await api.db.rows("external_identity", {
          providerSubject: identity.providerSubject,
        }),
      ).toHaveLength(1);
    });
    it("serializes simultaneous first sign-ins, including competing verified email claims for one subject", async () => {
      const identity = verified(`${randomUUID()}@example.test`);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => principalFor(identity)),
      );
      expect(new Set(results.map((row) => row.userId)).size).toBe(1);
      const subject = randomUUID();
      const competing = await Promise.all([
        principalFor(verified(`${randomUUID()}@example.test`, subject)),
        principalFor(verified(`${randomUUID()}@example.test`, subject)),
      ]);
      expect(competing[0].userId).toBe(competing[1].userId);
      expect(
        await api.db.rows("external_identity", { providerSubject: subject }),
      ).toHaveLength(1);
    });
    it("never links different subjects by email", async () => {
      const email = `${randomUUID()}@example.test`;
      const results = await Promise.allSettled([
        principalFor(verified(email)),
        principalFor(verified(email)),
      ]);
      expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(results.find((row) => row.status === "rejected")).toMatchObject({
        reason: { data: { code: "CONFLICT" } },
      });
      expect(await api.db.rows("user", { email })).toHaveLength(1);
    });
    it("distinguishes the same subject issued by different projects", async () => {
      const subject = randomUUID();
      const first = await principalFor(
        verified(`${randomUUID()}@example.test`, subject),
      );
      const second = await principalFor({
        ...verified(`${randomUUID()}@example.test`, subject),
        issuer: `https://securetoken.google.com/other-${randomUUID()}`,
      });
      expect(first.userId).not.toBe(second.userId);
    });
    it("rejects unverified first emails, existing-email collisions and demo credentials in Firebase mode", async () => {
      const noEmail = verified(null);
      await expect(principalFor(noEmail)).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
      expect(
        await api.db.rows("external_identity", {
          providerSubject: noEmail.providerSubject,
        }),
      ).toEqual([]);
      const email = `${randomUUID()}@example.test`;
      await api.db.insert("user", { email, name: "Existing owner" });
      await expect(
        principalFor(verified(email.toUpperCase())),
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      await expect(
        api.client("lazyfinance-demo-token").auth.principal.query(),
      ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
      await expect(
        api.client().auth.loginMock.mutate({
          email: "demo@lazyfinance.cl",
          password: "password",
        }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });
  },
);

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OAuthStateCrypto, oauthStateHash } from "./oauth-state-crypto";

describe("OAuth-only encrypted provider state", () => {
  it("round-trips provider state with random nonces and no cleartext credentials", () => {
    const crypto = new OAuthStateCrypto(randomBytes(32).toString("hex"));
    const key = oauthStateHash("opaque-access-token");
    const payload = {
      client_secret: "fixture-secret-not-real",
      accountId: "owner",
      scope: "finance:read",
      nested: { refresh: "fixture-refresh" },
    };
    const a = crypto.seal("AccessToken", key, payload),
      b = crypto.seal("AccessToken", key, payload);
    expect(a).not.toBe(b);
    expect(a).not.toContain(payload.client_secret);
    expect(crypto.open("AccessToken", key, a)).toEqual(payload);
    expect(crypto.cookieKey).not.toBe(key);
  });

  it("rejects another model, lookup key, master key, version and modified ciphertext", () => {
    const master = randomBytes(32).toString("hex"),
      crypto = new OAuthStateCrypto(master);
    const key = oauthStateHash("token"),
      sealed = crypto.seal("RefreshToken", key, { grantId: "g" });
    expect(() => crypto.open("AccessToken", key, sealed)).toThrow();
    expect(() =>
      crypto.open("RefreshToken", oauthStateHash("other"), sealed),
    ).toThrow();
    expect(() =>
      new OAuthStateCrypto(randomBytes(32).toString("hex")).open(
        "RefreshToken",
        key,
        sealed,
      ),
    ).toThrow();
    expect(() =>
      crypto.open("RefreshToken", key, sealed.replace(/^v1/, "v2")),
    ).toThrow();
    const pieces = sealed.split(".");
    pieces[3] = Buffer.from("altered").toString("base64url");
    expect(() => crypto.open("RefreshToken", key, pieces.join("."))).toThrow();
    expect(
      new OAuthStateCrypto(master).open("RefreshToken", key, sealed),
    ).toEqual({ grantId: "g" });
  });

  it("requires a full independent master key and stable exact hashing", () => {
    for (const value of ["", "short", "g".repeat(64)])
      expect(() => new OAuthStateCrypto(value)).toThrow();
    expect(oauthStateHash("a")).toMatch(/^[a-f0-9]{64}$/);
    expect(oauthStateHash("a")).not.toBe(oauthStateHash("A"));
  });
});

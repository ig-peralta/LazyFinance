import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { PersistenceClient } from "./persistence.client";

function client(key: string) {
  return new PersistenceClient(
    testEnvironment({
      PERSISTENCE_RPC_URL: "http://127.0.0.1:3001",
      PERSISTENCE_RPC_PRIVATE_KEY: key,
      PERSISTENCE_RPC_KEY_ID: "primary",
    }),
  );
}

describe("persistence signing-key readiness", () => {
  it("rejects malformed keys through awaited initialization, not an unobserved constructor promise", async () => {
    const service = client("not a PKCS8 key");
    await expect(service.onModuleInit()).rejects.toThrow();
    await expect(service.onModuleInit()).rejects.toThrow();
  });
  it("initializes a valid key before readiness and can reuse it", async () => {
    const key = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    const service = client(key);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

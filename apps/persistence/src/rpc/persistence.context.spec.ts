import "reflect-metadata";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createContextSigner } from "@lazyfinance/rpc-auth";
import type { ContextOptions } from "nestjs-trpc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistenceContext } from "./persistence.context";

afterEach(() => vi.unstubAllEnvs());
describe("persistence verification-key readiness", () => {
  it("rejects malformed keys through awaited initialization", async () => {
    vi.stubEnv("PERSISTENCE_RPC_PUBLIC_KEY", "not an SPKI key");
    const context = new PersistenceContext();
    await expect(context.onModuleInit()).rejects.toThrow();
    await expect(context.onModuleInit()).rejects.toThrow();
  });
  it("initializes a valid key and still verifies each individual request", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    vi.stubEnv(
      "PERSISTENCE_RPC_PUBLIC_KEY",
      publicKey.export({ type: "spki", format: "pem" }).toString(),
    );
    vi.stubEnv("PERSISTENCE_RPC_KEY_ID", "primary");
    const context = new PersistenceContext();
    await context.onModuleInit();
    const sign = await createContextSigner(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    const identity = {
      kind: "user" as const,
      userId: randomUUID(),
      requestId: randomUUID(),
    };
    const request = (authorization?: string) =>
      ({ req: { headers: { authorization } } }) as ContextOptions;
    expect(
      await context.create(request(`Bearer ${await sign(identity)}`)),
    ).toEqual({ identity });
    await expect(context.create(request())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

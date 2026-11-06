import {
  generateKeyPairSync,
  randomUUID,
  sign as signBytes,
} from "node:crypto";
import {
  createContextSigner,
  createContextVerifier,
} from "@lazyfinance/rpc-auth";

describe("signed persistence identity context", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const ctx = {
    kind: "user" as const,
    userId: randomUUID(),
    requestId: randomUUID(),
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = (
    claims: Record<string, unknown>,
    header = { alg: "EdDSA", kid: "primary", typ: "JWT" },
  ) => {
    const input = `${encode(header)}.${encode(claims)}`;
    return `${input}.${signBytes(null, Buffer.from(input), privateKey).toString("base64url")}`;
  };
  const valid = () => ({
    iss: "lazyfinance-api",
    aud: "lazyfinance-persistence",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30,
    ctx,
  });
  const verifier = () =>
    createContextVerifier(
      publicKey.export({ type: "spki", format: "pem" }).toString(),
    );

  it("accepts only a verified, bounded, schema-valid assertion", async () => {
    const sign = await createContextSigner(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    expect(await (await verifier())(`Bearer ${await sign(ctx)}`)).toEqual(ctx);
  });

  it.each([
    ["wrong issuer", () => ({ ...valid(), iss: "browser" })],
    ["wrong audience", () => ({ ...valid(), aud: "another-service" })],
    ["expired assertion", () => ({ ...valid(), iat: 1, exp: 2 })],
    [
      "overlong assertion",
      () => ({ ...valid(), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ],
    ["unknown context", () => ({ ...valid(), ctx: { ...ctx, kind: "admin" } })],
    [
      "invalid user",
      () => ({ ...valid(), ctx: { ...ctx, userId: "firebase-uid" } }),
    ],
    [
      "extra context fields",
      () => ({ ...valid(), ctx: { ...ctx, bypassRls: true } }),
    ],
  ])("rejects %s", async (_label, claims) => {
    await expect(
      (await verifier())(`Bearer ${token(claims())}`),
    ).rejects.toThrow();
  });

  it("rejects a modified user ID, missing token and wrong signing key", async () => {
    const parts = token(valid()).split(".");
    parts[1] = encode({ ...valid(), ctx: { ...ctx, userId: randomUUID() } });
    await expect(
      (await verifier())(`Bearer ${parts.join(".")}`),
    ).rejects.toThrow();
    await expect((await verifier())(undefined)).rejects.toThrow();
    const other = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    await expect(
      (await createContextVerifier(other))(`Bearer ${token(valid())}`),
    ).rejects.toThrow();
  });
});

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

export const oauthStateHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** The OAuth master key is independent of banking and internal RPC keys. */
export class OAuthStateCrypto {
  private readonly encryptionKey: Buffer;
  readonly cookieKey: string;

  constructor(master: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(master))
      throw new Error("Invalid OAuth state key");
    const derive = (purpose: string) =>
      Buffer.from(
        hkdfSync(
          "sha256",
          Buffer.from(master, "hex"),
          "lazyfinance:mcp-oauth:v1",
          purpose,
          32,
        ),
      );
    this.encryptionKey = derive("artifact-encryption");
    this.cookieKey = derive("cookie-signing").toString("base64url");
  }

  seal(model: string, key: string, payload: unknown): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(`v1:${model}:${key}`));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(".");
  }

  open(model: string, key: string, ciphertext: string): unknown {
    const [version, nonce, tag, body, extra] = ciphertext.split(".");
    if (version !== "v1" || !nonce || !tag || !body || extra)
      throw new Error("Invalid OAuth state");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(nonce, "base64url"),
    );
    decipher.setAAD(Buffer.from(`v1:${model}:${key}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
}

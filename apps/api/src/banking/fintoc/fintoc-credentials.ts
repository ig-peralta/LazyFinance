import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { EnvironmentService } from "../../environment/environment.service";

/** Link tokens are encrypted before private RPC/storage, bound to owner/mode/link. */
@Injectable()
export class FintocCredentials {
  constructor(private readonly environment: EnvironmentService) {}

  seal(token: string, owner: string, mode: string, externalId: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(
      Buffer.from(JSON.stringify([owner, "fintoc", mode, externalId])),
    );
    const encrypted = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  open(value: string, owner: string, mode: string, externalId: string): string {
    try {
      const [version, iv, tag, encrypted, extra] = value.split(".");
      if (version !== "v1" || !iv || !tag || !encrypted || extra)
        throw new Error("Invalid envelope");
      const nonce = Buffer.from(iv, "base64url");
      const authTag = Buffer.from(tag, "base64url");
      if (nonce.length !== 12 || authTag.length !== 16)
        throw new Error("Invalid envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.key(), nonce, {
        authTagLength: 16,
      });
      decipher.setAAD(
        Buffer.from(JSON.stringify([owner, "fintoc", mode, externalId])),
      );
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message:
          "Banking credentials cannot be opened; check server configuration",
      });
    }
  }

  private key() {
    const key = this.environment.get("FINTOC_TOKEN_ENCRYPTION_KEY");
    if (!key)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Banking is not configured",
      });
    return Buffer.from(key, "hex");
  }
}

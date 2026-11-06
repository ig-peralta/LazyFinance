import {
  type PersistenceContext,
  PersistenceContextSchema,
} from "@lazyfinance/contracts/context";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";

const issuer = "lazyfinance-api";
const audience = "lazyfinance-persistence";

/** The private key belongs only to the API. Never accept a caller-proposed context. */
export async function createContextSigner(pem: string, keyId = "primary") {
  const key = await importPKCS8(pem.replace(/\\n/g, "\n"), "EdDSA");
  return async (context: PersistenceContext) =>
    new SignJWT({ ctx: PersistenceContextSchema.parse(context) })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: keyId })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(key);
}

/** Verifies cryptographic identity before validating the shape of the claims. */
export async function createContextVerifier(pem: string, keyId = "primary") {
  const key = await importSPKI(pem.replace(/\\n/g, "\n"), "EdDSA");
  return async (
    authorization: string | undefined,
  ): Promise<PersistenceContext> => {
    const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(authorization ?? "");
    if (!match) throw new Error("A service assertion is required");
    const { payload, protectedHeader } = await jwtVerify(match[1], key, {
      issuer,
      audience,
      algorithms: ["EdDSA"],
      maxTokenAge: "30s",
      requiredClaims: ["iat", "exp", "iss", "aud", "ctx"],
    });
    if (
      protectedHeader.typ !== "JWT" ||
      protectedHeader.kid !== keyId ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      payload.exp - payload.iat > 30
    ) {
      throw new Error("Invalid service assertion");
    }
    return PersistenceContextSchema.parse(payload.ctx);
  };
}

import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = {
  keys: [
    {
      ...privateKey.export({ format: "jwk" }),
      kid: randomUUID(),
      alg: "RS256",
      use: "sig",
    },
  ],
};

console.log(
  "# OAuth API-only secrets. Store privately; never commit or log this output.",
);
console.log(
  "# These are independent of banking, Firebase and private RPC keys.",
);
console.log(`MCP_OAUTH_STATE_KEY=${randomBytes(32).toString("hex")}`);
console.log(`MCP_OAUTH_JWKS='${JSON.stringify(jwks)}'`);

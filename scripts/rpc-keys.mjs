import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

console.log("# API only; keep private and out of Git");

console.log(
  `PERSISTENCE_RPC_PRIVATE_KEY=${JSON.stringify(privateKey.export({ type: "pkcs8", format: "pem" }))}`,
);

console.log("# Persistence only");

console.log(
  `PERSISTENCE_RPC_PUBLIC_KEY=${JSON.stringify(publicKey.export({ type: "spki", format: "pem" }))}`,
);

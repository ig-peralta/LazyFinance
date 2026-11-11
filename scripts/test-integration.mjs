import { execFileSync, fork, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";

const owner = process.env.TEST_POSTGRES_OWNER_URL;

if (!owner || !new URL(owner).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_POSTGRES_OWNER_URL to a disposable database ending in _test",
  );

execFileSync(
  "pnpm",
  ["exec", "turbo", "build", "--filter=persistence...", "--filter=api..."],
  { stdio: "inherit" },
);

const login = "lazyfinance_test_runtime",
  password = "runtime-test-password-only";

const env = {
  ...process.env,
  POSTGRES_MIGRATION_URL: owner,
  PERSISTENCE_DATABASE_USER: login,
  PERSISTENCE_DATABASE_PASSWORD: password,
};

for (const command of ["migrate", "provision"])
  execFileSync("node", ["apps/persistence/dist/database/cli.js", command], {
    env,
    stdio: "inherit",
  });

const runtime = new URL(owner);

runtime.username = login;

runtime.password = password;

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const childEnv = {
  ...process.env,
  PORT: "0",
  HOST: "127.0.0.1",
  POSTGRES_RUNTIME_URL: runtime.toString(),
  PERSISTENCE_RPC_PUBLIC_KEY: publicKey
    .export({ type: "spki", format: "pem" })
    .toString(),
};

delete childEnv.POSTGRES_MIGRATION_URL;

delete childEnv.TEST_POSTGRES_OWNER_URL;

const child = fork("apps/persistence/dist/main.js", [], {
  env: childEnv,
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});

try {
  const [message] = await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error("Persistence exited before readiness");
    }),
  ]);
  const tests = spawn(
    "pnpm",
    ["--filter", "api", "run", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_PERSISTENCE_RPC_URL: message.url,
        TEST_PERSISTENCE_RPC_PRIVATE_KEY: privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
    },
  );
  const [code] = await once(tests, "exit");
  process.exitCode = code ?? 1;
} finally {
  child.kill("SIGTERM");
  await once(child, "exit");
}

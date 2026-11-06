import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const targets = [
  { app: "persistence", library: "rpc-persistence", pattern: "**/*.rpc.ts" },
  { app: "api", library: "rpc-api", pattern: "**/*.rpc.ts" },
];

for (const target of targets) {
  const committed = path.join(root, "libs", target.library, "src/generated");
  const temporary = check
    ? mkdtempSync(path.join(tmpdir(), "lazyfinance-rpc-"))
    : undefined;
  const output = temporary ?? committed;

  try {
    mkdirSync(output, { recursive: true });
    execFileSync(
      "pnpm",
      [
        "exec",
        "nestjs-trpc",
        "generate",
        "--entrypoint",
        "src/app.module.ts",
        "--router-pattern",
        target.pattern,
        "--output",
        output,
        "--import-extension",
        "js",
      ],
      {
        cwd: path.join(root, "apps", target.app),
        stdio: "inherit",
      },
    );
    const generated = readFileSync(path.join(output, "server.ts"), "utf8");
    const imports = [...generated.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    const allowed = [
      "@trpc/server",
      "zod",
      "@lazyfinance/contracts",
      ...(target.app === "persistence"
        ? ["@lazyfinance/contracts/internal"]
        : []),
    ];
    if (
      imports.some((name) => !allowed.includes(name)) ||
      /ReturnType\s*</.test(generated)
    ) {
      throw new Error(
        `${target.library}: generated types must not import application implementations`,
      );
    }
    if (
      check &&
      generated !== readFileSync(path.join(committed, "server.ts"), "utf8")
    ) {
      throw new Error(`${target.library} is stale; run pnpm rpc:generate`);
    }
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

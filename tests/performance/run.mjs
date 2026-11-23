import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const location = dirname(fileURLToPath(import.meta.url));
const results = join(location, "results");
mkdirSync(results, { recursive: true });

const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceTreeClean =
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length === 0;
const report = `${new Date().toISOString().replace(/[:.]/g, "-")}-${sha.slice(0, 8)}`;
const project = `lazyfinance-perf-${process.pid}`;
const args = [
  "compose",
  "-p",
  project,
  "-f",
  join(root, "docker/test/compose.yml"),
];
const env = { ...process.env, PERF_GIT_SHA: sha, PERF_REPORT_FILE: report };
let running;
let interrupted = null;

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = signal;
    running?.kill(signal);
  });

function compose(extra) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...args, ...extra], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    running = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      running = undefined;
      resolve(code ?? (signal === "SIGINT" ? 130 : 143));
    });
  });
}

let status = 1;
try {
  status = await compose([
    "up",
    "--build",
    "--abort-on-container-exit",
    "--exit-code-from",
    "performance",
  ]);
  const container = execFileSync(
    "docker",
    [...args, "ps", "-a", "-q", "performance"],
    {
      cwd: root,
      env,
      encoding: "utf8",
    },
  ).trim();
  if (!container) throw new Error("Performance container was not created");
  const destination = join(results, report);
  mkdirSync(destination);
  execFileSync(
    "docker",
    ["cp", `${container}:/results/${report}/.`, destination],
    {
      stdio: "inherit",
    },
  );
  const imageId = execFileSync(
    "docker",
    ["inspect", "--format", "{{.Image}}", container],
    { encoding: "utf8" },
  ).trim();
  const postgres = execFileSync(
    "docker",
    [...args, "ps", "-a", "-q", "postgres"],
    { cwd: root, env, encoding: "utf8" },
  ).trim();
  const postgresImageId = postgres
    ? execFileSync("docker", ["inspect", "--format", "{{.Image}}", postgres], {
        encoding: "utf8",
      }).trim()
    : null;
  for (const name of readdirSync(destination)) {
    if (!name.endsWith(".json")) continue;
    const path = join(destination, name);
    const record = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(
      path,
      `${JSON.stringify({ ...record, build: { runnerImageId: imageId, postgresImageId, sourceTreeClean } }, null, 2)}\n`,
    );
  }
  console.log(`Performance reports: ${destination}`);
} catch (error) {
  console.error("No complete performance report was collected:", error);
  status = status || 1;
} finally {
  const cleanup = await compose(["down", "--remove-orphans"]);
  if (cleanup !== 0) {
    console.error(`Test containers could not be stopped (project ${project}).`);
    status = status || cleanup;
  }
}
process.exitCode = status;
if (interrupted && !process.exitCode)
  process.exitCode = interrupted === "SIGINT" ? 130 : 143;

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachDiagnostics, captureResources } from "./collect-diagnostics.mjs";
import { writeCatalog } from "./dashboard.mjs";

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
const destination = join(results, report);
mkdirSync(destination);
const logFile = join(destination, "compose.log");
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

function compose(extra, captureLog = false) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...args, ...extra], {
      cwd: root,
      env,
      stdio: captureLog ? ["inherit", "pipe", "pipe"] : "inherit",
    });
    if (captureLog)
      for (const [stream, output] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ])
        stream?.on("data", (chunk) => {
          output.write(chunk);
          appendFileSync(logFile, chunk);
        });
    running = child;
    child.once("error", reject);
    child.once("close", (code, signal) => {
      running = undefined;
      resolve(code ?? (signal === "SIGINT" ? 130 : 143));
    });
  });
}

let status = 1;
let resources;
try {
  if ((await compose(["create", "--build"])) !== 0)
    throw new Error("Performance containers could not be built");
  const ids = execFileSync("docker", [...args, "ps", "-a", "-q"], {
    cwd: root,
    env,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  resources = captureResources(ids, destination);
  status = await compose(
    ["up", "--abort-on-container-exit", "--exit-code-from", "performance"],
    true,
  );
  await resources.stop();
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
    const record = attachDiagnostics(
      JSON.parse(readFileSync(path, "utf8")),
      destination,
      resources,
    );
    writeFileSync(
      path,
      `${JSON.stringify({ ...record, series: { id: process.env.PERF_SERIES_ID, repetition: Number(process.env.PERF_REPETITION), planned: Number(process.env.PERF_REPETITIONS) }, build: { runnerImageId: imageId, postgresImageId, sourceTreeClean } }, null, 2)}\n`,
    );
  }
  console.log(`Performance results catalog: ${writeCatalog()}`);
  console.log(`Performance reports and Compose log: ${destination}`);
} catch (error) {
  console.error("No complete performance report was collected:", error);
  status = status || 1;
} finally {
  if (resources) await resources.stop();
  console.log(`Performance dashboard: ${join(location, "dashboard.html")}`);
  const cleanup = await compose(["down", "--remove-orphans"]);
  if (cleanup !== 0) {
    console.error(`Test containers could not be stopped (project ${project}).`);
    status = status || cleanup;
  }
}
process.exitCode = status;
if (interrupted && !process.exitCode)
  process.exitCode = interrupted === "SIGINT" ? 130 : 143;

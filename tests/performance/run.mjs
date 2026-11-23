import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const repetitions = Number(process.env.PERF_REPETITIONS ?? 1);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5)
  throw new Error("PERF_REPETITIONS must be an integer from 1 to 5");
const seriesId = new Date().toISOString();
let current;
let interrupted;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = signal;
    current?.kill(signal);
  });
let status = 0;
for (
  let repetition = 1;
  repetition <= repetitions && !interrupted;
  repetition++
) {
  console.log(
    `Performance repetition ${repetition}/${repetitions}; fresh isolated database`,
  );
  current = spawn(
    process.execPath,
    [fileURLToPath(new URL("./run-once.mjs", import.meta.url))],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PERF_SERIES_ID: seriesId,
        PERF_REPETITION: String(repetition),
        PERF_REPETITIONS: String(repetitions),
      },
    },
  );
  const [code, signal] = await once(current, "close");
  if (code !== 0 || signal) status = code || 1;
}
process.exitCode = interrupted
  ? interrupted === "SIGINT"
    ? 130
    : 143
  : status;

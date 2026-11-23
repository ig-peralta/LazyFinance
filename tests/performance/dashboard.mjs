import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const template = new URL("./dashboard.template.html", import.meta.url);
const results = fileURLToPath(new URL("./results/", import.meta.url));
const placeholder =
  '<script id="embedded-reports" type="application/json">{}</script>';

/** Embed JSON safely in a script element, including arbitrary error messages. */
export function renderDashboard(reports) {
  const html = readFileSync(template, "utf8");
  if (html.split(placeholder).length !== 2)
    throw new Error("Performance dashboard data placeholder is missing");
  const json = JSON.stringify(reports)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return html.replace(
    placeholder,
    `<script id="embedded-reports" type="application/json">${json}</script>`,
  );
}

/** One offline dashboard for all available local runs, including partial failures. */
export function writeDashboard() {
  mkdirSync(results, { recursive: true });
  const runs = [];
  const directories = readdirSync(results, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[\w-]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const directory of directories) {
    const run = {
      directory,
      composeLog: existsSync(join(results, directory, "compose.log")),
    };
    for (const [name, file] of [
      ["reads", "financial-reads.json"],
      ["import", "banking-import.json"],
    ]) {
      try {
        run[name] = JSON.parse(
          readFileSync(join(results, directory, file), "utf8"),
        );
      } catch (error) {
        if (error.code === "ENOENT") continue;
        if (!run.errors) run.errors = [];
        run.errors.push(`${file}: ${error.message}`);
      }
    }
    if (run.reads || run.import || run.composeLog || run.errors) runs.push(run);
  }
  const output = join(results, "dashboard.html");
  writeFileSync(output, renderDashboard({ runs }));
  return output;
}

// Refresh the index after adding results without running Docker.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length !== 2)
    throw new Error("Usage: node tests/performance/dashboard.mjs");
  console.log(writeDashboard());
}

// Shared helpers for the Stage C real-stack validation suites (LAZ-98/LAZ-100).
// Dependency-free on purpose: browser tooling is external (BROWSER_TOOLING_ROOT) and
// Firebase Admin is borrowed from apps/api, so the repository gains no dependency.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const OUT =
  process.env.VALIDATION_OUT ?? resolve(ROOT, "tests/validation/results");
export const API = process.env.VALIDATION_API_URL ?? "http://localhost:3000";
export const UI = process.env.VALIDATION_UI_URL ?? "http://localhost:4200";
export const PERSISTENCE =
  process.env.VALIDATION_PERSISTENCE_URL ?? "http://127.0.0.1:3001";
const PG =
  process.env.VALIDATION_PG_CONTAINER ?? "lazyfinance-resources-postgres-1";
const CHROME =
  process.env.VALIDATION_CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(OUT, { recursive: true });

/** Parses a dotenv file without exporting it, so secrets are never printed or inherited. */
export function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...opts,
    }).trim();
  } catch {
    return "unavailable";
  }
};

/** SQL oracle, independent of the API. Only ever point this at the disposable local container. */
export function sql(query, { user = "user", db = "lazyfinance" } = {}) {
  return execFileSync(
    "docker",
    ["exec", PG, "psql", "-U", user, "-d", db, "-At", "-F", "\t", "-c", query],
    {
      encoding: "utf8",
    },
  ).trim();
}
export const rows = (query, opts) => {
  const out = sql(query, opts);
  return out ? out.split("\n").map((line) => line.split("\t")) : [];
};

export const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const eq = (actual, expected, message) =>
  ok(
    String(actual) === String(expected),
    `${message}: expected ${expected}, got ${actual}`,
  );

/** Thrown for cases that cannot run here; they are reported as blocked, never as passed. */
export class Blocked extends Error {
  constructor(message) {
    super(message);
    this.blocked = true;
  }
}

/** tRPC over HTTP as a given bearer token. `raw` returns the status instead of throwing. */
export async function rpc(
  proc,
  input,
  { token, mutate = false, raw = false } = {},
) {
  const headers = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const res = mutate
    ? await fetch(`${API}/trpc/${proc}`, {
        method: "POST",
        headers,
        body: JSON.stringify(input ?? {}),
      })
    : await fetch(
        `${API}/trpc/${proc}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`,
        { headers },
      );
  const body = await res.json().catch(() => null);
  if (raw) return { status: res.status, body };
  if (!res.ok)
    throw new Error(
      `${proc} -> ${res.status} ${JSON.stringify(body?.error?.message ?? body).slice(0, 300)}`,
    );
  return body.result.data;
}

export async function mockToken() {
  const res = await fetch(`${API}/trpc/auth.loginMock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "demo@lazyfinance.cl",
      password: "password",
    }),
  });
  return (await res.json()).result.data.token;
}

/** Firebase Admin from apps/api, loaded without adding it to this suite's dependencies. */
export function firebaseAdmin() {
  const api = createRequire(resolve(ROOT, "apps/api/package.json"));
  const { initializeApp, cert, getApps } = api("firebase-admin/app");
  const { getAuth } = api("firebase-admin/auth");
  const env = readEnvFile(resolve(ROOT, "apps/api/.env"));
  const name = "lazyfinance-validation";
  const app =
    getApps().find((a) => a.name === name) ??
    initializeApp(
      {
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      },
      name,
    );
  const ui = readFileSync(
    resolve(ROOT, "apps/ui/src/environments/environment.development.ts"),
    "utf8",
  );
  return {
    auth: getAuth(app),
    projectId: env.FIREBASE_PROJECT_ID,
    webApiKey: ui.match(/apiKey:\s*["']([^"']+)["']/)?.[1],
  };
}

let browser;
export async function getBrowser() {
  const tooling = process.env.BROWSER_TOOLING_ROOT;
  if (!tooling)
    throw new Blocked("Set BROWSER_TOOLING_ROOT to a Playwright installation.");
  const { chromium } = createRequire(resolve(tooling, "package.json"))(
    "playwright",
  );
  browser ??= await chromium.launch({ headless: true, executablePath: CHROME });
  return browser;
}
export const closeBrowser = async () => browser?.close();
export async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await (await getBrowser()).newContext({ viewport });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on(
    "response",
    (r) =>
      r.status() >= 500 &&
      page.errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`),
  );
  return page;
}

export function sessionRecord(extra = {}) {
  return {
    recordedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    commit: run("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }),
    dirtyTrackedFiles: run(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { cwd: ROOT },
    )
      .split("\n")
      .filter(Boolean).length,
    node: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    postgres: run("docker", ["exec", PG, "postgres", "--version"]),
    chrome: run("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-Item '${CHROME}').VersionInfo.ProductVersion`,
    ]),
    authProvider: process.env.VALIDATION_AUTH_PROVIDER ?? "unknown",
    ...extra,
  };
}

/**
 * Evidence levels follow validation-plan.md: controlled (synthetic fixtures, local stack),
 * sandbox (provider test environment), live (real provider session) and manual (human-run).
 * Results are passed | failed | blocked; blocked is never counted as passed.
 */
export class Suite {
  constructor(name, record = {}) {
    this.name = name;
    this.record = sessionRecord(record);
    this.results = [];
  }

  async case(id, title, { level, criterion, basis = "" }, fn, { page } = {}) {
    const only = process.env.VALIDATION_ONLY?.split(",");
    if (only && !only.includes(id)) return;
    let status = "passed";
    let detail = "";
    try {
      detail = (await fn()) ?? "";
    } catch (error) {
      status = error.blocked ? "blocked" : "failed";
      detail = String(error.message).replace(/\s+/g, " ").slice(0, 900);
      if (page)
        await page
          .screenshot({ path: `${OUT}/${this.name}-${id}.png`, fullPage: true })
          .catch(() => {});
    }
    if (page?.errors?.length)
      detail += ` | page errors: ${page.errors.slice(0, 2).join(" ; ")}`;
    this.results.push({ id, title, level, criterion, basis, status, detail });
    console.log(
      `${status.toUpperCase().padEnd(8)} ${id} [${level}] ${title}${detail ? `\n         -> ${detail.slice(0, 420)}` : ""}`,
    );
  }

  finish() {
    const count = (s) => this.results.filter((r) => r.status === s).length;
    const summary = {
      passed: count("passed"),
      failed: count("failed"),
      blocked: count("blocked"),
    };
    writeFileSync(
      `${OUT}/${this.name}.json`,
      JSON.stringify(
        { session: this.record, summary, results: this.results },
        null,
        2,
      ),
    );
    console.log(
      `\n${this.name}: ${summary.passed} passed, ${summary.failed} failed, ${summary.blocked} blocked`,
    );
    return summary;
  }
}

/** Signs the mock demo user in through the real login form. */
export async function mockLogin(page) {
  await page.goto(`${UI}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("demo@lazyfinance.cl");
  await page.locator('input[type="password"]').fill("password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20000,
  });
  await page.waitForTimeout(1500);
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Uses external browser tooling, deliberately adding no repository dependencies.
const tooling = process.env.BROWSER_TOOLING_ROOT;
if (!tooling)
  throw new Error("Set BROWSER_TOOLING_ROOT to a Playwright installation.");
const { chromium } = createRequire(resolve(tooling, "package.json"))(
  "playwright",
);
const dist = fileURLToPath(new URL("../../dist/ui/browser/", import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const asset = extname(path) ? path : "/index.csr.html";
    const file = resolve(dist, `.${asset}`);
    if (!file.startsWith(dist)) return response.writeHead(403).end();
    response.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(file)
      ] || "application/octet-stream",
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.addInitScript(() =>
    sessionStorage.setItem("lazyfinance-mock-token", "synthetic-browser"),
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    const data = {
      "auth.config": { provider: "mock" },
      "auth.principal": {
        userId: "browser-owner",
        name: "Synthetic",
        email: "synthetic@example.test",
      },
      "onboarding.state": {
        status: "completed",
        completedAt: "2026-11-11T00:00:00.000Z",
      },
      "tags.list": [],
    }[url.pathname.replace("/trpc/", "")];
    assert.notEqual(data, undefined, `Unexpected external request: ${url}`);
    await route.fulfill({ json: { result: { data } } });
  });
  await page.goto(`${origin}/etiquetas`);
  await page
    .getByRole("button", { name: "Nueva etiqueta", exact: true })
    .waitFor();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator("workspace-appearance summary").click();
    for (const theme of ["Claro", "Oscuro"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const ratio = await page
        .locator(".button.primary")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const luminance = (color) => {
            const channels = color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number);
            const [r, g, b] = channels.map((channel) => {
              const value = channel / 255;
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          return (
            (Math.max(foreground, background) + 0.05) /
            (Math.min(foreground, background) + 0.05)
          );
        });
      assert(ratio >= 4.5, `${theme} primary contrast at ${width}px: ${ratio}`);
    }
    await page.locator("workspace-appearance summary").click();
  }
  console.log(
    "PASS: actual primary-button computed contrast >= 4.5:1 in both themes at 360/390/768/1280px.",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}

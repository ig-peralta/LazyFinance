import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, get } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const remoteHost = "dev-ui.example";
const remoteOrigin = `https://${remoteHost}`;
const firstLine = '{"type":"delta","text":"primero"}\n';
const lastLine = '{"type":"delta","text":"después"}\n';
const ndjson = "application/x-ndjson; charset=utf-8";

async function startUi(t, target) {
  const workspace = new URL("../", import.meta.url);
  const cli = new URL("node_modules/@angular/cli/bin/ng.js", workspace);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(cli),
      "serve",
      "--host=127.0.0.1",
      "--port=0",
      "--watch=false",
    ],
    {
      cwd: workspace,
      env: {
        ...process.env,
        API_PROXY_TARGET: target,
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: remoteHost,
        NG_CLI_ANALYTICS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  });

  return new Promise((resolve, reject) => {
    let output = "";
    const collect = (chunk) => {
      output += chunk;
      const origin = /Local:\s+(http:\/\/127\.0\.0\.1:\d+)\//.exec(output)?.[1];
      if (origin) resolve(origin);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("exit", () => reject(new Error(output)));
    t.signal.addEventListener("abort", () => reject(new Error(output)), {
      once: true,
    });
  });
}

function statusForHost(ui, path, host) {
  return new Promise((resolve, reject) => {
    get(
      ui + path,
      { headers: { host }, signal: AbortSignal.timeout(10_000) },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    ).on("error", reject);
  });
}

test("Angular development proxy", { timeout: 90_000 }, async (t) => {
  const streams = [];
  const api = createServer((req, res) => {
    res.setHeader("X-Test-Upstream", "api");
    if (req.url === "/oauth/interaction/fixture") {
      res.writeHead(302, {
        Location: "/autorizar-mcp?interaction=fixture",
        "Set-Cookie":
          "interaction=fixture; Path=/oauth/interaction/fixture; HttpOnly; SameSite=Lax",
      });
      res.end();
      return;
    }
    if (req.url.startsWith("/assistant/turns?")) {
      let body = "";
      req.setEncoding("utf8").on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        streams.push({ res, body, headers: req.headers });
        res.writeHead(200, { "Content-Type": ndjson });
        res.write(firstLine);
      });
      return;
    }
    if (req.url === "/trpc/backendError") {
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Retry-After": "15",
      });
      res.end(JSON.stringify({ error: "unavailable" }));
      return;
    }
    res.end(req.url);
  });
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  await once(api.listen(0, "127.0.0.1"), "listening");
  const ui = await startUi(t, `http://127.0.0.1:${api.address().port}`);
  const request = (path, options) =>
    fetch(ui + path, { signal: AbortSignal.timeout(10_000), ...options });

  await t.test("routes API calls without swallowing deep links", async () => {
    for (const path of [
      "/trpc?check=1",
      "/trpc/summaries.monthly?input=%7B%22month%22%3A%222026-11%22%7D",
      "/assistant",
      "/assistant/voice/configuration",
      "/oauth/interaction/fixture/details",
      "/oauth/interaction/fixture/decision",
      "/oauth/authorize/resume-fixture",
      "/oauth/token",
      "/.well-known/oauth-protected-resource/mcp",
      "/mcp",
    ]) {
      const res = await request(path);
      assert.equal(res.headers.get("X-Test-Upstream"), "api", path);
      assert.equal(await res.text(), path);
    }
    for (const path of [
      "/",
      "/asistente",
      "/movimientos/fixture?month=2026-11",
      "/autorizar-mcp?interaction=fixture",
      "/assistant-not-api",
      "/trpc-not-api",
    ]) {
      const res = await request(path, { headers: { accept: "text/html" } });
      assert.equal(res.headers.get("X-Test-Upstream"), null, path);
      const html = await res.text();
      if (!path.endsWith("-not-api")) assert.match(html, /<app-root/);
    }
    const interaction = await request("/oauth/interaction/fixture", {
      redirect: "manual",
    });
    assert.equal(interaction.status, 302);
    assert.equal(
      interaction.headers.get("Location"),
      "/autorizar-mcp?interaction=fixture",
    );
    assert.deepEqual(interaction.headers.getSetCookie(), [
      "interaction=fixture; Path=/oauth/interaction/fixture; HttpOnly; SameSite=Lax",
    ]);
  });

  await t.test("allows only the listed remote host", async () => {
    for (const path of ["/", "/trpc"]) {
      assert.equal(await statusForHost(ui, path, remoteHost), 200);
      assert.equal(await statusForHost(ui, path, "unlisted.example"), 403);
    }
  });

  await t.test("streams NDJSON and closes the upstream on abort", async () => {
    async function readLine(reader) {
      let line = "";
      while (!line.endsWith("\n")) {
        const { done, value } = await reader.read();
        assert.equal(done, false, "stream ended before a complete line");
        line += value;
      }
      return line;
    }

    async function open(signal) {
      const res = await request("/assistant/turns?source=dev", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          origin: remoteOrigin,
        },
        body: '{"text":"hello"}',
        signal: AbortSignal.any([
          AbortSignal.timeout(10_000),
          ...(signal ? [signal] : []),
        ]),
      });
      assert.equal(res.headers.get("Content-Type"), ndjson);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      // Upstream will not finish until the first complete line arrives.
      assert.equal(await readLine(reader), firstLine);
      return reader;
    }

    const reader = await open();
    assert.equal(streams[0].headers.origin, remoteOrigin);
    assert.equal(streams[0].headers.host, new URL(ui).host);
    assert.equal(streams[0].headers.authorization, "Bearer test-token");
    assert.equal(streams[0].body, '{"text":"hello"}');
    streams[0].res.end(lastLine);
    assert.equal(await readLine(reader), lastLine);
    assert.equal((await reader.read()).done, true);

    const controller = new AbortController();
    const cancelled = await open(controller.signal);
    const closed = once(streams[1].res, "close", {
      signal: AbortSignal.timeout(10_000),
    });
    controller.abort();
    await assert.rejects(cancelled.read(), { name: "AbortError" });
    await closed;
    assert.equal(streams[1].res.writableFinished, false);
  });

  await t.test("preserves API errors and reports unavailability", async () => {
    const failure = await request("/trpc/backendError");
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get("Retry-After"), "15");
    assert.deepEqual(await failure.json(), { error: "unavailable" });
    await new Promise((resolve) => {
      api.close(resolve);
      api.closeAllConnections();
    });
    const unavailable = await request("/trpc/config.get");
    assert.equal(unavailable.status, 502);
    await unavailable.text();
  });
});

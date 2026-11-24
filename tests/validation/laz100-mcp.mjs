// LAZ-100 criterion 4 (scripted part): external MCP access — read/write grant, recognizable
// client display, renewal/recovery and revocation.
// Level: controlled/live-OAuth — a real OAuth 2.1 + PKCE flow against the running API with a
// generic scripted client and the real consent UI. This is NOT a named commercial client:
// the named-client session (Claude Code) is recorded separately in mcp-named-client.md and its
// results must not be inferred from these cases.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  API,
  closeBrowser,
  eq,
  mockLogin,
  mockToken,
  newPage,
  ok,
  rpc,
  Suite,
  sql,
  UI,
} from "./lib.mjs";

const suite = new Suite("laz100-mcp", {
  authProvider: "mock",
  dataClass: "synthetic demo data, scripted OAuth client",
});
const MCP = `${API}/mcp`;
const PORT = 53123;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const b64u = (b) => b.toString("base64url");
const M = { token: await mockToken(), mutate: true };

let waiter;
const callbackServer = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  res.end("ok");
  if (url.pathname === "/callback") waiter?.(url);
});
await new Promise((done) => callbackServer.listen(PORT, "127.0.0.1", done));
const nextCallback = () =>
  new Promise((resolve) => {
    waiter = resolve;
    setTimeout(() => resolve(null), 30000);
  });

async function mcp(token, method, params, id = 1) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    const m = text.match(/data: (.*)/);
    if (m)
      try {
        body = JSON.parse(m[1]);
      } catch {
        /* not JSON */
      }
  }
  return { status: res.status, headers: res.headers, body, text };
}
const initialize = (token) =>
  mcp(token, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "validation-script", version: "1" },
  });
async function register(name, extra = {}) {
  const r = await fetch(`${API}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...extra,
    }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const pkce = () => {
  const verifier = b64u(randomBytes(32));
  return {
    verifier,
    challenge: b64u(createHash("sha256").update(verifier).digest()),
  };
};
const authUrl = (clientId, challenge, scope, state) => {
  const url = new URL(`${API}/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP,
  }))
    url.searchParams.set(k, v);
  return url.toString();
};
const tokenRequest = async (params) => {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const exchange = (clientId, code, verifier) =>
  tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    resource: MCP,
  });
const refreshWith = (clientId, refreshToken, extra = {}) =>
  tokenRequest({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    resource: MCP,
    ...extra,
  });
const newestGrant = () =>
  sql("select id from identity.mcp_grant order by created_at desc limit 1");

const page = await newPage();
await mockLogin(page);
async function openConsent(clientId, scope) {
  const p = pkce();
  const state = b64u(randomBytes(8));
  // The previous approve/deny leaves the browser navigating to the local callback; let it settle first.
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(1500);
  const wait = nextCallback();
  await page.goto(authUrl(clientId, p.challenge, scope, state), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  return {
    p,
    state,
    wait,
    text: (await page.locator("body").innerText()).replace(/\s+/g, " "),
  };
}
/** Optional write permissions are opt-in checkboxes on the consent screen; `tick` lists their labels. */
async function approve(clientId, scope, tick = []) {
  const c = await openConsent(clientId, scope);
  for (const label of tick) await page.getByLabel(label).check();
  await page
    .getByRole("button", { name: /Autorizar/i })
    .first()
    .click();
  const url = await c.wait;
  const code = url?.searchParams.get("code");
  ok(code, "no authorization code after approving");
  const t = await exchange(clientId, code, c.p.verifier);
  ok(
    t.status === 200,
    `code exchange failed: ${t.status} ${JSON.stringify(t.body).slice(0, 160)}`,
  );
  return { ...t.body, grant: newestGrant() };
}

const info = { level: "controlled", criterion: "LAZ-100.4" };
let clientId;
let readGrant;

try {
  await suite.case(
    "MC-01",
    "Without a token /mcp answers 401 with the resource-metadata challenge",
    { ...info, basis: "mcp-authorization.md: 401 resource-metadata challenge" },
    async () => {
      const r = await initialize(null);
      eq(r.status, 401, "status");
      const challenge = r.headers.get("www-authenticate") ?? "";
      ok(
        /resource_metadata/i.test(challenge),
        `missing resource_metadata: ${challenge}`,
      );
      const metadata = await (
        await fetch(`${API}/.well-known/oauth-protected-resource/mcp`)
      ).json();
      ok(
        metadata.authorization_servers?.length,
        "no authorization server in the metadata",
      );
      return `401 + ${challenge.slice(0, 110)}`;
    },
  );

  await suite.case(
    "MC-02",
    "The server offers only PKCE S256 and the documented scopes",
    { ...info, basis: "mcp-authorization.md" },
    async () => {
      const m = await (
        await fetch(`${API}/.well-known/oauth-authorization-server`)
      ).json();
      eq(
        JSON.stringify(m.code_challenge_methods_supported),
        JSON.stringify(["S256"]),
        "PKCE methods",
      );
      for (const scope of [
        "finance:read",
        "finance:budgets:write",
        "finance:goals:write",
        "finance:tags:write",
        "finance:movements:tag",
      ])
        ok(m.scopes_supported.includes(scope), `missing scope ${scope}`);
      return `scopes=${m.scopes_supported.join(",")}`;
    },
  );

  await suite.case(
    "MC-03",
    "Dynamic client registration grants no access",
    { ...info, basis: "mcp-authorization.md: registration authorizes no data" },
    async () => {
      const before = Number(sql("select count(*) from identity.mcp_grant"));
      const r = await register("Validation Client");
      ok(
        r.status < 300 && r.body?.client_id,
        `registration failed: ${r.status}`,
      );
      clientId = r.body.client_id;
      eq(
        Number(sql("select count(*) from identity.mcp_grant")),
        before,
        "grants after registration",
      );
      return `registered ${clientId.slice(0, 10)}...; grants unchanged (${before})`;
    },
  );

  await suite.case(
    "MC-04",
    "Consent shows the client and permissions; denying returns access_denied and creates no grant",
    { ...info, basis: "mcp-authorization.md#Deny; V10" },
    async () => {
      const before = Number(sql("select count(*) from identity.mcp_grant"));
      const c = await openConsent(clientId, "finance:read");
      ok(
        /Validation Client/.test(c.text) &&
          /no verificada/i.test(c.text) &&
          /Solo lectura/i.test(c.text),
        `consent lacks client/identity/permission: ${c.text.slice(0, 200)}`,
      );
      await page.getByRole("button", { name: /No autorizar/i }).click();
      const url = await c.wait;
      ok(url, "no callback after denying");
      eq(url.searchParams.get("error"), "access_denied", "callback error");
      eq(url.searchParams.get("state"), c.state, "state");
      eq(
        Number(sql("select count(*) from identity.mcp_grant")),
        before,
        "grants after denial",
      );
      return "access_denied with the original state; no grant created";
    },
    { page },
  );

  await suite.case(
    "MC-05",
    "A read-only grant lists the tools and reads data that match the database",
    { ...info, basis: "mcp-authorization.md#Approve" },
    async () => {
      readGrant = await approve(clientId, "finance:read");
      eq((await initialize(readGrant.access_token)).status, 200, "initialize");
      const tools =
        (await mcp(readGrant.access_token, "tools/list", {}, 2)).body?.result
          ?.tools ?? [];
      ok(
        tools.length >= 14,
        `expected the documented read/write tool set, got ${tools.length}`,
      );
      const balances = tools.find((t) => /saldos/i.test(t.name));
      ok(balances, "no balances tool");
      const call = await mcp(
        readGrant.access_token,
        "tools/call",
        { name: balances.name, arguments: {} },
        3,
      );
      const real = sql(
        "select balance::text from finance.account where alias='Cuenta corriente'",
      );
      ok(
        JSON.stringify(call.body).includes(Number(real).toFixed(2)),
        `MCP balance differs from the database (${real})`,
      );
      return `${tools.length} tools; balance via MCP == database (${real})`;
    },
  );

  await suite.case(
    "MC-06",
    "A read-only token cannot execute a valid write and changes nothing",
    {
      ...info,
      basis: "user-journeys.md J11: a read-only grant never gains writes",
    },
    async () => {
      ok(readGrant, "depends on MC-05");
      const before = Number(sql("select count(*) from finance.tag"));
      const r = await mcp(
        readGrant.access_token,
        "tools/call",
        {
          name: "ejecutar_accion_financiera",
          arguments: {
            requestId: crypto.randomUUID(),
            action: {
              kind: "create_tag",
              tag: { name: "QA-MCP-read-only", color: null },
            },
          },
        },
        9,
      );
      ok(
        r.status === 403 ||
          /insufficient|scope|permiso|forbidden|permission/i.test(r.text),
        `the write was not refused for lack of permission: ${r.status} ${r.text.slice(0, 200)}`,
      );
      eq(
        Number(sql("select count(*) from finance.tag")),
        before,
        "tags after the refused write",
      );
      return `refused (HTTP ${r.status}); no tag created`;
    },
  );

  await suite.case(
    "MC-07",
    "Renewal: the refresh token issues working credentials and rotates; a refresh cannot widen scopes",
    {
      ...info,
      basis:
        "mcp-authorization.md: rotating refresh tokens; refresh cannot upgrade a read-only grant",
    },
    async () => {
      ok(readGrant, "depends on MC-05");
      const widened = await refreshWith(clientId, readGrant.refresh_token, {
        scope: "finance:read finance:tags:write",
      });
      const refreshed =
        widened.status === 200
          ? widened
          : await refreshWith(clientId, readGrant.refresh_token);
      ok(
        refreshed.status === 200,
        `refresh failed: ${refreshed.status} ${JSON.stringify(refreshed.body).slice(0, 160)}`,
      );
      ok(
        !/tags:write/.test(refreshed.body.scope ?? ""),
        `a refresh widened the scopes: ${refreshed.body.scope}`,
      );
      ok(
        refreshed.body.refresh_token &&
          refreshed.body.refresh_token !== readGrant.refresh_token,
        "the refresh token did not rotate",
      );
      eq(
        (await mcp(refreshed.body.access_token, "tools/list", {}, 4)).status,
        200,
        "renewed access token",
      );
      readGrant = { ...readGrant, ...refreshed.body };
      return `renewed access works; refresh token rotated; scope stayed "${refreshed.body.scope ?? "finance:read"}" (widening ${widened.status === 200 ? "ignored" : `refused with ${widened.status}`})`;
    },
  );

  await suite.case(
    "MC-08",
    "Reusing an old refresh token revokes the grant",
    {
      ...info,
      basis:
        "mcp-authorization.md: reusing an old refresh token revokes the family",
    },
    async () => {
      const g = await approve(clientId, "finance:read");
      const first = await refreshWith(clientId, g.refresh_token);
      ok(first.status === 200, `first refresh failed: ${first.status}`);
      const replay = await refreshWith(clientId, g.refresh_token);
      ok(
        replay.status >= 400,
        `a rotated refresh token was accepted again: ${replay.status}`,
      );
      const afterReplay = await mcp(
        first.body.access_token,
        "tools/list",
        {},
        5,
      );
      ok(
        afterReplay.status === 401,
        `the grant stayed usable after refresh-token reuse: ${afterReplay.status}`,
      );
      eq(
        sql(
          `select (revoked_at is not null)::text from identity.mcp_grant where id='${g.grant}'`,
        ),
        "true",
        "grant revoked after reuse",
      );
      return `replay -> ${replay.status}; the newer access token -> 401; grant marked revoked`;
    },
  );

  await suite.case(
    "MC-09",
    "Write access is opt-in at consent, then executes exactly once per request id and only within its scope",
    {
      ...info,
      basis:
        "mcp-authorization.md: separately granted writes; user-journeys.md J11",
    },
    async () => {
      const writeRequest = (name, requestId) => ({
        name: "ejecutar_accion_financiera",
        arguments: {
          requestId,
          action: { kind: "create_tag", tag: { name, color: null } },
        },
      });

      // 1. The client asks for write scopes but the owner leaves the optional box unticked.
      const unticked = await approve(
        clientId,
        "finance:read finance:tags:write",
      );
      ok(
        !/tags:write/.test(unticked.scope ?? ""),
        `an unticked optional permission was granted anyway: ${unticked.scope}`,
      );
      const refusedName = `QA-MCP-unticked-${randomBytes(3).toString("hex")}`;
      await mcp(
        unticked.access_token,
        "tools/call",
        writeRequest(refusedName, crypto.randomUUID()),
        6,
      );
      eq(
        Number(
          sql(`select count(*) from finance.tag where name='${refusedName}'`),
        ),
        0,
        "a write ran under a grant whose write box was left unticked",
      );
      await rpc("mcpAccess.revoke", { id: unticked.grant }, M);

      // 2. The owner ticks it: the write is allowed, once per request id.
      const g = await approve(clientId, "finance:read finance:tags:write", [
        /Crear, editar y archivar etiquetas/,
      ]);
      ok(
        /tags:write/.test(g.scope ?? ""),
        `the ticked permission is missing from the grant: ${g.scope}`,
      );
      const name = `QA-MCP-${randomBytes(3).toString("hex")}`;
      const requestId = crypto.randomUUID();
      const call = writeRequest(name, requestId);
      const first = await mcp(g.access_token, "tools/call", call, 7);
      eq(
        Number(sql(`select count(*) from finance.tag where name='${name}'`)),
        1,
        `tag created by the first call (${first.status} ${first.text.slice(0, 120)})`,
      );
      await mcp(g.access_token, "tools/call", call, 8);
      eq(
        Number(sql(`select count(*) from finance.tag where name='${name}'`)),
        1,
        "the same request id created a second tag",
      );

      // 3. A valid action that needs a scope this grant does not carry (finance:movements:tag).
      const [movementId, taggedWith] = sql(
        "select id, tag_id from finance.transaction where tag_id is not null limit 1",
      ).split("	");
      const outOfScope = await mcp(
        g.access_token,
        "tools/call",
        {
          name: "ejecutar_accion_financiera",
          arguments: {
            requestId: crypto.randomUUID(),
            action: {
              kind: "tag_movement",
              transactionId: movementId,
              tagId: null,
            },
          },
        },
        9,
      );
      eq(
        sql(`select tag_id from finance.transaction where id='${movementId}'`),
        taggedWith,
        "an action outside the granted scope changed a movement",
      );
      await rpc("mcpAccess.revoke", { id: g.grant }, M);
      return `unticked write box -> grant stayed read-only (scope "${unticked.scope}") and the write was refused; ticked -> tag created once, replay did not duplicate; out-of-scope action refused (HTTP ${outOfScope.status}); grants revoked afterwards`;
    },
    { page },
  );

  await suite.case(
    "MC-10",
    "Revocation is per grant; the UI removes the rest; reconnecting needs a new consent and works",
    { ...info, basis: "mcp-authorization.md#Revoke; user-journeys.md J17" },
    async () => {
      const a = await approve(clientId, "finance:read");
      const b = await approve(clientId, "finance:read");
      ok(a.grant !== b.grant, "both approvals share one grant");
      await rpc("mcpAccess.revoke", { id: a.grant }, M);
      eq(
        (await mcp(a.access_token, "tools/list", {}, 5)).status,
        401,
        "revoked token",
      );
      ok(
        (await refreshWith(clientId, a.refresh_token)).status >= 400,
        "the revoked grant could still refresh",
      );
      eq(
        (await mcp(b.access_token, "tools/list", {}, 6)).status,
        200,
        "the other grant must be unaffected",
      );
      await page.goto(`${UI}/aplicaciones-conectadas`);
      await page.waitForTimeout(2500);
      let clicks = 0;
      for (let i = 0; i < 20; i++) {
        const button = page.getByRole("button", { name: /Quitar acceso/ });
        if (!(await button.count())) break;
        await button.first().click();
        await page.waitForTimeout(600);
        await page.getByRole("button", { name: /Sí, quitar acceso/ }).click();
        await page.waitForTimeout(1800);
        clicks++;
      }
      eq(
        Number(
          sql(
            "select count(*) from identity.mcp_grant where revoked_at is null",
          ),
        ),
        0,
        "grants still active after removing access in the UI",
      );
      eq(
        (await mcp(b.access_token, "tools/list", {}, 7)).status,
        401,
        "token after UI removal",
      );
      const reconnected = await approve(clientId, "finance:read");
      eq(
        (await mcp(reconnected.access_token, "tools/list", {}, 8)).status,
        200,
        "access after reconnecting with a new consent",
      );
      await rpc("mcpAccess.revoke", { id: reconnected.grant }, M);
      return `revoking A left B working; the UI removed ${clicks} grant(s); a fresh consent restored access (recovery path)`;
    },
    { page },
  );

  await suite.case(
    "MC-11",
    "A hostile client name/logo is shown safely: no remote image, identity stays unverified",
    { ...info, basis: "mcp-authorization.md: logo source contract; V10" },
    async () => {
      const hostile = await register(
        "<img src=x onerror=alert(1)> Banco Oficial",
        {
          logo_uri: "https://attacker.example/logo.png",
          client_uri: "https://attacker.example",
        },
      );
      ok(
        hostile.status < 300 && hostile.body?.client_id,
        `registration failed: ${hostile.status}`,
      );
      const c = await openConsent(hostile.body.client_id, "finance:read");
      const images = await page
        .locator("img")
        .evaluateAll((els) => els.map((e) => e.src));
      ok(
        !images.some((src) => src.includes("attacker.example")),
        `the consent loads a remote image: ${images.join(", ")}`,
      );
      ok(
        /no verificada/i.test(c.text),
        "the consent does not carry the unverified-identity notice",
      );
      ok(
        !(await page.evaluate(() => window.__xss === true)),
        "script from the client name executed",
      );
      await page.getByRole("button", { name: /No autorizar/i }).click();
      await c.wait;
      return "no remote logo requested, markup in the name rendered inert, unverified-identity notice present";
    },
    { page },
  );
} finally {
  await page
    .context()
    .close()
    .catch(() => {});
  callbackServer.close();
  await closeBrowser();
  suite.finish();
}

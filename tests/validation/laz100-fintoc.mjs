// LAZ-100 criterion 3 (part): selected Fintoc accounts, first-link-day cutoff, automatic
// synchronization, relink/deselection and failure recovery.
// Level: sandbox (real hosted Fintoc widget, Fintoc TEST keys and the public sandbox
// credentials from Fintoc's documentation) under a disposable Firebase user. The
// failure case adds controlled fault injection on the sandbox connection; it is labelled
// as such. Sandbox results are not evidence of live bank behaviour, entitlement or cost.
// Automatic sync needs the API started with BANKING_AUTOMATIC_SYNC_ENABLED=true.
import { createCipheriv, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import {
  Blocked,
  closeBrowser,
  eq,
  firebaseAdmin,
  newPage,
  ok,
  ROOT,
  readEnvFile,
  rows,
  rpc,
  Suite,
  sql,
  UI,
} from "./lib.mjs";

const SANDBOX_USER = "41614850-3"; // public sandbox credentials, Fintoc documentation
const SANDBOX_PASSWORD = "jonsnow";
const suite = new Suite("laz100-fintoc", {
  authProvider: "firebase",
  dataClass: "Fintoc sandbox (test keys), disposable Firebase user",
});
const { auth, webApiKey } = firebaseAdmin();
const run = randomBytes(3).toString("hex");
const user = {
  email: `qa-laz100-${run}-f@example.test`,
  password: `Pw-${randomBytes(9).toString("hex")}`,
  uid: "",
  token: "",
};
const T = () => ({ token: user.token });
const M = () => ({ token: user.token, mutate: true });
const santiagoDay = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    date,
  );

async function signIn() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        returnSecureToken: true,
      }),
    },
  );
  const body = await res.json();
  ok(res.ok, `Firebase sign-in failed: ${body?.error?.message}`);
  user.token = body.idToken;
}

/** Mirrors FintocCredentials.seal so a fake link token can be stored as the API itself would. */
function sealToken(token, owner, mode, externalId) {
  const key = readEnvFile(
    resolve(ROOT, "apps/api/.env"),
  ).FINTOC_TOKEN_ENCRYPTION_KEY;
  ok(
    /^[0-9a-f]{64}$/i.test(key ?? ""),
    "FINTOC_TOKEN_ENCRYPTION_KEY is missing or not 32 bytes of hex",
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(
    Buffer.from(JSON.stringify([owner, "fintoc", mode, externalId])),
  );
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

const movementFacts = () =>
  new Map(
    rows(
      `select t.account_id::text||'/'||t.external_id, t.amount::text||'@'||t.booked_at::text from finance.transaction t join finance.account a on a.id=t.account_id where a.provider_connection_id='${connId}'`,
    ).map((r) => [r[0], r[1]]),
  );
/** Previously imported movements must be byte-identical and unique; returns how many are new. */
function assertPreserved(before, what) {
  const duplicates = Number(
    sql(
      `select count(*) - count(distinct (t.account_id, t.external_id)) from finance.transaction t join finance.account a on a.id=t.account_id where a.provider_connection_id='${connId}'`,
    ),
  );
  eq(duplicates, 0, `${what}: duplicate (account, external id) rows`);
  const after = movementFacts();
  const changed = [...before].filter(
    ([key, facts]) => after.get(key) !== facts,
  );
  eq(
    changed.length,
    0,
    `${what}: previously imported movements were changed or lost (${changed
      .slice(0, 2)
      .map((c) => c[0])
      .join(", ")})`,
  );
  return after.size - before.size;
}

const need = (condition, message) => {
  if (!condition) throw new Blocked(message);
};

let page;
let connId;
let linkDay;
let discovered = [];
let selected = [];
const counts = () => {
  const own = connId ? `provider_connection_id='${connId}'` : "false";
  return {
    accounts: Number(sql(`select count(*) from finance.account where ${own}`)),
    movements: Number(
      sql(
        `select count(*) from finance.transaction t join finance.account a on a.id=t.account_id where a.${own}`,
      ),
    ),
  };
};

async function runWidget(buttonName) {
  await page.goto(`${UI}/conexiones-bancarias`);
  await page.waitForTimeout(2500);
  await buttonName();
  const frame = page.frameLocator('iframe[src*="fintoc"]');
  await frame
    .getByRole("button", { name: "Continuar" })
    .click({ timeout: 30000 });
  await frame
    .getByRole("button", { name: "Banco Itaú" })
    .click({ timeout: 30000 });
  await frame.locator("input[name=username]").fill(SANDBOX_USER);
  await frame.locator("input[name=password]").fill(SANDBOX_PASSWORD);
  await frame.getByRole("button", { name: "Continuar" }).click();
  await frame.getByRole("button", { name: "Listo" }).click({ timeout: 90000 });
  await page
    .getByText(/Autorización de .* guardada/)
    .waitFor({ timeout: 30000 });
}

try {
  const config = await rpc("config.get");
  eq(
    config.auth.provider,
    "firebase",
    "the API must run with AUTH_PROVIDER=firebase",
  );
  const record = await auth.createUser({
    email: user.email,
    password: user.password,
    emailVerified: true,
  });
  user.uid = record.uid;
  await signIn();
  const banking = await rpc("banking.configuration", undefined, T());
  ok(banking.enabled, "banking is not enabled: Fintoc test keys are missing");
  eq(banking.mode, "test", "Fintoc mode must be the sandbox (test) mode");
  const automaticOn = banking.automaticSyncEnabled === true;
  suite.record.automaticSyncEnabled = automaticOn;

  page = await newPage();
  await page.goto(`${UI}/login`, { waitUntil: "networkidle" });
  await page.locator("#firebase-email").fill(user.email);
  await page
    .locator('[data-testid="firebase-password-form"] input[name=password]')
    .fill(user.password);
  await page.locator('[data-testid="password-login"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30000,
  });

  await suite.case(
    "FT-01",
    "Authorizing a sandbox bank stores an encrypted credential and imports nothing",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis: "technical-manual: authorization without implicit import",
    },
    async () => {
      const before = Number(
        sql("select count(*) from finance.provider_connection"),
      );
      await runWidget(async () => {
        await page
          .getByRole("button", { name: "Conectar banco", exact: true })
          .click();
        await page.waitForTimeout(800);
        await page.getByRole("button", { name: "Abrir Fintoc" }).click();
      });
      const [id, institution, cred, created] = rows(
        "select id, institution_name, length(encrypted_credential::text)::text, (created_at at time zone 'America/Santiago')::date::text from finance.provider_connection order by created_at desc limit 1",
      )[0];
      eq(
        Number(sql("select count(*) from finance.provider_connection")),
        before + 1,
        "exactly one new connection",
      );
      connId = id;
      linkDay = created;
      ok(Number(cred) > 40, "credential not stored");
      ok(
        !sql(
          `select encrypted_credential::text from finance.provider_connection where id='${id}'`,
        ).includes("link_"),
        "a plaintext link token is stored",
      );
      eq(
        sql(
          `select state from finance.provider_link_intent where completed_connection_id='${id}'`,
        ),
        "completed",
        "link intent state",
      );
      const c = counts();
      eq(c.accounts + c.movements, 0, "authorization must not import");
      return `${institution}; link day (Santiago) ${linkDay}; credential encrypted (${cred} chars); no accounts or movements`;
    },
    { page },
  );

  await suite.case(
    "FT-02",
    "Discovery keeps only bounded account choices and imports nothing",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis: "technical-manual: discovery discards balances and raw numbers",
    },
    async () => {
      need(connId, "blocked: FT-01 did not create a connection");
      await rpc("banking.discoverAccounts", { id: connId }, M());
      const sel = rows(
        `select accounts::text, coalesce(confirmed_at::text,'NULL') from finance.provider_account_selection where connection_id='${connId}'`,
      )[0];
      discovered = JSON.parse(sel[0]);
      need(
        discovered.length >= 2,
        `blocked: the Fintoc sandbox returned ${discovered.length} account(s) this time; a subset needs at least 2. Rerun the suite (the sandbox returns 1 or 2 accounts)`,
      );
      const keys = [
        ...new Set(discovered.flatMap((a) => Object.keys(a))),
      ].sort();
      ok(
        !keys.some((k) => /balance|amount|rut|holder/i.test(k)),
        `sensitive fields stored: ${keys.join(",")}`,
      );
      ok(
        discovered.every((a) => !a.numberSuffix || a.numberSuffix.length <= 4),
        "more than four digits of an account number stored",
      );
      eq(sel[1], "NULL", "selection must not be confirmed by discovery");
      const c = counts();
      eq(c.accounts + c.movements, 0, "discovery must not import");
      return `${discovered.length} accounts discovered; stored fields: ${keys.join(",")}; unconfirmed; nothing imported`;
    },
  );

  let importReport;
  await suite.case(
    "FT-03",
    "Confirming one of two accounts imports only that account, from the first-link Santiago day",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis: "banking-sync-policy.md; fintoc-tracking-window.ts",
    },
    async () => {
      need(
        discovered.length >= 2,
        "blocked: FT-02 found fewer than 2 accounts",
      );
      selected = [discovered[0].externalId]; // a strict subset, so "unselected stays out" is a real check
      const sel = await rpc("banking.accountSelection", { id: connId }, T());
      await rpc(
        "banking.selectAccounts",
        {
          id: connId,
          expectedVersion: sel.version,
          discoveryVersion: sel.discoveryVersion,
          accountIds: selected,
          automaticEnrolled: false,
        },
        M(),
      );
      importReport = await rpc("banking.importInitial", { id: connId }, M());
      const imported = rows(
        `select external_id from finance.account where provider_connection_id='${connId}' order by 1`,
      ).map((r) => r[0]);
      eq(
        imported.join(","),
        [...selected].sort().join(","),
        "imported accounts vs selected",
      );
      const unselected = discovered.filter(
        (d) => !selected.includes(d.externalId),
      );
      ok(
        unselected.length >= 1,
        "the check needs at least one unselected account",
      );
      for (const a of unselected)
        eq(
          Number(
            sql(
              `select count(*) from finance.account where provider_connection_id='${connId}' and external_id='${a.externalId}'`,
            ),
          ),
          0,
          `unselected account ${a.name} was imported into this connection`,
        );
      eq(
        importReport.report.requestedHistory.from,
        linkDay,
        "the requested history must start on the first-link Santiago day",
      );
      eq(
        importReport.report.requestedHistory.through,
        santiagoDay(new Date()),
        "the requested history must end today (Santiago)",
      );
      const early = Number(
        sql(
          `select count(*) from finance.transaction t join finance.account a on a.id=t.account_id where a.provider_connection_id='${connId}' and (t.booked_at at time zone 'America/Santiago')::date < date '${linkDay}'`,
        ),
      );
      eq(early, 0, "movements before the link day");
      return `imported ${imported.length} of ${discovered.length} discovered (${unselected.length} left out, 0 rows); ${counts().movements} movements; requested window ${importReport.report.requestedHistory.from}..${importReport.report.requestedHistory.through}; before link day: 0. Sandbox history starts on the link day, so exclusion of earlier provider history is shown by the request window only.`;
    },
  );

  await suite.case(
    "FT-04",
    "A second import is idempotent and keeps the personal alias",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "user-journeys.md J8: stable identifiers; manual decisions survive refresh",
    },
    async () => {
      need(
        selected.length && importReport,
        "blocked: FT-03 did not import a selection",
      );
      const before = movementFacts();
      const account = rows(
        `select id from finance.account where provider_connection_id='${connId}' order by id limit 1`,
      )[0][0];
      await rpc(
        "accounts.setAlias",
        { id: account, alias: `QA alias ${run}` },
        M(),
      );
      await rpc("banking.refresh", { id: connId }, M());
      const fresh = assertPreserved(before, "re-import");
      eq(
        sql(`select alias from finance.account where id='${account}'`),
        `QA alias ${run}`,
        "alias after re-import",
      );
      need(
        before.size > 0,
        "blocked: the selected account has no movements, so idempotency was not stressed",
      );
      return `${before.size} existing movements unchanged and unique after a second import (${fresh} new movements emitted by the sandbox in between); alias intact`;
    },
  );

  await suite.case(
    "FT-05",
    "Opening the sync status triggers no provider work",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis: "user-journeys.md J8: status reads do not force a refresh",
    },
    async () => {
      need(
        importReport,
        "blocked: no import happened, so there is no sync state to observe",
      );
      const q = `select coalesce(last_attempt_at::text,'NULL'), revision::text from finance.provider_sync_state where provider_connection_id='${connId}'`;
      const before = rows(q)[0];
      await rpc("banking.syncStatus", { id: connId }, T());
      await rpc("banking.checkConnection", { id: connId }, M());
      await page.goto(`${UI}/conexiones-bancarias`);
      await page.waitForTimeout(3000);
      eq(
        rows(q)[0].join("|"),
        before.join("|"),
        "last attempt/revision changed by looking at status",
      );
      return `last attempt and revision unchanged (${before.join(" / ")})`;
    },
  );

  await suite.case(
    "FT-06",
    "Automatic synchronization updates only the selected accounts with the browser closed",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "banking-sync-policy.md: periodic snapshot reads; timer ticks every 60 s",
    },
    async () => {
      need(
        importReport,
        "blocked: no import happened, so there is nothing to synchronize",
      );
      if (!automaticOn)
        throw new Blocked(
          "BANKING_AUTOMATIC_SYNC_ENABLED is not true on the API; automatic sync was not exercised.",
        );
      const sel = await rpc("banking.accountSelection", { id: connId }, T());
      await rpc(
        "banking.selectAccounts",
        {
          id: connId,
          expectedVersion: sel.version,
          discoveryVersion: sel.discoveryVersion,
          accountIds: selected,
          automaticEnrolled: true,
        },
        M(),
      );
      await page.context().close(); // no browser is open from here on
      page = null;
      const t0 = sql("select now()::text"); // every observed success must be later than this instant
      const factsBefore = movementFacts();
      const attemptsBefore = Number(
        sql(
          `select coalesce(cardinality(attempts),0) from finance.provider_sync_schedule where connection_id='${connId}'`,
        ),
      );
      sql(
        `update finance.provider_sync_schedule set next_attempt_at = now() - interval '1 minute' where connection_id='${connId}'`,
      );
      let seen = null;
      const deadline = Date.now() + 200_000;
      while (Date.now() < deadline && !seen) {
        await new Promise((r) => setTimeout(r, 10_000));
        seen =
          rows(
            `select last_success_at::text, last_result, revision::text from finance.provider_sync_state where provider_connection_id='${connId}' and last_success_at > '${t0}'::timestamptz`,
          )[0] ?? null;
      }
      ok(seen, `no successful background run after ${t0} within 200 s`);
      eq(seen[1], "complete", "background run result");
      const attemptsAfter = Number(
        sql(
          `select coalesce(cardinality(attempts),0) from finance.provider_sync_schedule where connection_id='${connId}'`,
        ),
      );
      ok(
        attemptsAfter > attemptsBefore,
        `the scheduler recorded no new attempt (${attemptsBefore} -> ${attemptsAfter})`,
      );
      const imported = rows(
        `select external_id from finance.account where provider_connection_id='${connId}' order by 1`,
      ).map((r) => r[0]);
      eq(
        imported.join(","),
        [...selected].sort().join(","),
        "background run must not add unselected accounts",
      );
      const fresh = assertPreserved(factsBefore, "background run");
      return `no browser open and no RPC from this script; forced due at ${t0}; successful run at ${seen[0]} (result ${seen[1]}, revision ${seen[2]}); scheduler attempts ${attemptsBefore} -> ${attemptsAfter}; ${factsBefore.size} existing movements unchanged (${fresh} new from the provider); still ${imported.length} selected account(s)`;
    },
  );

  await suite.case(
    "FT-07",
    "Adding then deselecting accounts: catch-up, manual tag survival, and deselected history/alias kept",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "banking-sync-policy.md: add/reselect catches up; deselect preserves history",
    },
    async () => {
      need(importReport, "blocked: FT-03 did not import a selection");
      const all = discovered.map((a) => a.externalId);
      const select = async (ids) => {
        const sel = await rpc("banking.accountSelection", { id: connId }, T());
        return rpc(
          "banking.selectAccounts",
          {
            id: connId,
            expectedVersion: sel.version,
            discoveryVersion: sel.discoveryVersion,
            accountIds: ids,
            automaticEnrolled: false,
          },
          M(),
        );
      };
      const beforeAdd = counts();
      await select(all);
      await rpc("banking.refresh", { id: connId }, M());
      const afterAdd = counts();
      eq(afterAdd.accounts, all.length, "accounts after adding the second one");
      ok(
        afterAdd.movements >= beforeAdd.movements,
        "movements decreased after adding an account",
      );
      need(
        afterAdd.movements > 0,
        "blocked: the sandbox returned no movements for any selected account, so tag survival cannot be exercised",
      );

      const movement = rows(
        `select t.id from finance.transaction t join finance.account a on a.id=t.account_id where a.provider_connection_id='${connId}' limit 1`,
      )[0][0];
      const tag = await rpc(
        "tags.create",
        { name: `QA-FT-${run}`, color: "#3355aa" },
        M(),
      );
      await rpc("tags.decide", { transactionId: movement, tagId: tag.id }, M());
      await rpc("banking.refresh", { id: connId }, M());
      eq(
        sql(`select tag_id from finance.transaction where id='${movement}'`),
        tag.id,
        "manual tag after re-import",
      );
      eq(
        sql(
          `select tag_decision_origin from finance.transaction where id='${movement}'`,
        ),
        "manual",
        "tag origin",
      );

      const [busyId, busyExternal, busyCount] = rows(
        `select a.id, a.external_id, count(t.id)::text from finance.account a join finance.transaction t on t.account_id=a.id where a.provider_connection_id='${connId}' group by 1,2 order by 3 desc limit 1`,
      )[0];
      await rpc(
        "accounts.setAlias",
        { id: busyId, alias: `QA busy ${run}` },
        M(),
      );
      const keep = all.filter((id) => id !== busyExternal);
      const out = await select(keep);
      eq(
        JSON.stringify(out.accountIds),
        JSON.stringify(keep),
        "selection after deselecting the account with history",
      );
      selected = keep;
      await rpc("banking.refresh", { id: connId }, M());
      eq(
        sql(
          `select count(*) from finance.transaction where account_id='${busyId}'`,
        ),
        busyCount,
        "history of the deselected account",
      );
      eq(
        sql(`select alias from finance.account where id='${busyId}'`),
        `QA busy ${run}`,
        "alias of the deselected account",
      );
      await rpc("banking.discoverAccounts", { id: connId }, M());
      ok(
        !rows(
          `select account_ids::text from finance.provider_account_selection where connection_id='${connId}'`,
        )[0][0].includes(busyExternal),
        "rediscovery re-selected the deselected account",
      );
      const catchUp =
        afterAdd.movements > beforeAdd.movements
          ? "catch-up imported the added account's movements"
          : "the added account has no provider movements, so catch-up volume was NOT exercised";
      return `added 2nd account: movements ${beforeAdd.movements} -> ${afterAdd.movements} (${catchUp}); manual tag survived re-import; deselected the account holding ${busyCount} movements: history and alias kept, and rediscovery did not re-select it`;
    },
  );

  const swapCredential = (value) =>
    sql(
      `update finance.provider_connection set encrypted_credential = '${value.replace(/'/g, "''")}' where id='${connId}'`,
    );
  const lastGoodBalances = () =>
    sql(
      `select coalesce(sum(balance),0)::text from finance.account where provider_connection_id='${connId}'`,
    );
  const syncMarkers = () =>
    rows(
      `select coalesce(last_failure_at::text,'NULL'), coalesce(last_failure_reason::text,'NULL'), revision::text from finance.provider_sync_state where provider_connection_id='${connId}'`,
    )[0];

  // Runs first, while the connection is still active, so the response can only come from the credential read.
  await suite.case(
    "FT-08a",
    "An unreadable stored credential is a service error, never a bank failure, and changes nothing",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "fintoc-credentials.ts: 'Banking credentials cannot be opened; check server configuration'",
    },
    async () => {
      need(importReport, "blocked: no imported selection");
      eq(
        sql(
          `select status from finance.provider_connection where id='${connId}'`,
        ),
        "active",
        "the connection must be active for this check",
      );
      const good = sql(
        `select encrypted_credential from finance.provider_connection where id='${connId}'`,
      );
      const before = counts();
      const markersBefore = syncMarkers().join("|");
      swapCredential(`${good.slice(0, -6)}XXXXXX`);
      let http;
      try {
        const r = await rpc(
          "banking.refresh",
          { id: connId },
          { ...M(), raw: true },
        );
        const message = String(r.body?.error?.message ?? "");
        http = `${r.status} ${message.slice(0, 80)}`;
        ok(
          r.status === 503 && /cannot be opened/i.test(message),
          `expected 503 "cannot be opened", got ${http}`,
        );
        eq(counts().movements, before.movements, "history changed");
      } finally {
        swapCredential(good);
      }
      eq(
        sql(
          `select status from finance.provider_connection where id='${connId}'`,
        ),
        "active",
        "the connection must stay active",
      );
      eq(
        syncMarkers().join("|"),
        markersBefore,
        "sync state after an unreadable credential",
      );
      return `refresh -> ${http}; no failure recorded against the bank, connection still active, sync state unchanged (a server configuration problem, not a provider outcome)`;
    },
  );

  await suite.case(
    "FT-08b",
    "Provider rejection: the failure is recorded and shown, last-good data is kept and the bank must be relinked",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "validation-plan V04; fault = unknown link token sealed with the real key, which Fintoc rejects. Recovery is FT-09 (relink)",
    },
    async () => {
      need(
        importReport,
        "blocked: no imported selection, so a refresh would stop at selection validation before reaching the provider",
      );
      const [owner, externalId, mode] = rows(
        `select user_id::text, external_id, mode from finance.provider_connection where id='${connId}'`,
      )[0];
      const before = counts();
      const balances = lastGoodBalances();
      swapCredential(
        sealToken(
          `link_${mode}_${randomBytes(12).toString("hex")}`,
          owner,
          mode,
          externalId,
        ),
      );
      const failed = await rpc(
        "banking.refresh",
        { id: connId },
        { ...M(), raw: true },
      );
      const result = failed.body?.result?.data;
      ok(
        failed.status >= 400 || (result && result.status !== "complete"),
        `a refresh with a provider-rejected token did not fail: ${failed.status} ${JSON.stringify(failed.body).slice(0, 160)}`,
      );
      eq(
        counts().movements,
        before.movements,
        "history changed by a failed refresh",
      );
      eq(
        lastGoodBalances(),
        balances,
        "last-good balances changed by a failed refresh",
      );
      const [failureAt, reason] = syncMarkers();
      ok(
        failureAt !== "NULL" && reason !== "NULL",
        `the provider failure was not recorded durably (http ${failed.status}; last_failure_at=${failureAt}, reason=${reason})`,
      );
      const status = await rpc("banking.syncStatus", { id: connId }, T());
      ok(
        status.failure,
        `the sync status does not report the failure: ${JSON.stringify({ failure: status.failure, lastResult: status.lastResult }).slice(0, 200)}`,
      );
      const connection = sql(
        `select status from finance.provider_connection where id='${connId}'`,
      );
      ok(
        connection !== "active",
        `the connection still looks active after the provider rejected its credential (${connection})`,
      );
      const again = await rpc(
        "banking.refresh",
        { id: connId },
        { ...M(), raw: true },
      );
      ok(
        again.status === 409,
        `a second refresh must be refused until the bank is relinked, got ${again.status}`,
      );
      return `http ${failed.status}; recorded reason=${reason}; connection ${connection}; status.failure=${JSON.stringify(status.failure).slice(0, 80)}; further refreshes refused (409) until relink; history and balances intact. Fault = a link token Fintoc does not know (controlled), not a naturally expired bank link.`;
    },
  );

  await suite.case(
    "FT-09",
    "Relinking recovers a rejected connection and keeps accounts, alias, selection and history",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "banking-sync-policy.md: same-identity relink retains selection and boundary",
    },
    async () => {
      page = await newPage();
      await page.goto(`${UI}/login`, { waitUntil: "networkidle" });
      await page.locator("#firebase-email").fill(user.email);
      await page
        .locator('[data-testid="firebase-password-form"] input[name=password]')
        .fill(user.password);
      await page.locator('[data-testid="password-login"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30000,
      });
      need(importReport, "blocked: no imported connection to relink");
      const before = counts();
      const conns = Number(
        sql("select count(*) from finance.provider_connection"),
      );
      const versionBefore = sql(
        `select credential_version::text from finance.provider_connection where id='${connId}'`,
      );
      const aliases = () =>
        rows(
          `select id::text, coalesce(alias,'NULL') from finance.account where provider_connection_id='${connId}' order by id`,
        )
          .map((r) => r.join("="))
          .join(",");
      const aliasesBefore = aliases();
      ok(
        aliasesBefore.includes(`QA alias ${run}`) ||
          aliasesBefore.includes(`QA busy ${run}`),
        "no alias to carry across the relink",
      );
      const selBefore = rows(
        `select account_ids::text, automatic_enrolled::text from finance.provider_account_selection where connection_id='${connId}'`,
      )[0];
      const linkDayBefore = sql(
        `select (created_at at time zone 'America/Santiago')::date::text from finance.provider_connection where id='${connId}'`,
      );
      await runWidget(async () => {
        await page
          .getByRole("button", { name: /Revincular/ })
          .first()
          .click();
        await page.waitForTimeout(800);
        const open = page.getByRole("button", { name: "Abrir Fintoc" });
        if (await open.count()) await open.click();
      });
      eq(
        Number(sql("select count(*) from finance.provider_connection")),
        conns,
        "relink created a second connection",
      );
      eq(counts().accounts, before.accounts, "accounts after relink");
      eq(counts().movements, before.movements, "movements after relink");
      const versionAfter = sql(
        `select credential_version::text from finance.provider_connection where id='${connId}'`,
      );
      ok(
        Number(versionAfter) > Number(versionBefore),
        `credential version did not advance (${versionBefore} -> ${versionAfter})`,
      );
      eq(
        sql(
          `select status from finance.provider_connection where id='${connId}'`,
        ),
        "active",
        "the connection must be active again after relinking",
      );
      const recovered = await rpc(
        "banking.refresh",
        { id: connId },
        { ...M(), raw: true },
      );
      ok(
        recovered.status < 400,
        `refresh after relinking failed: ${recovered.status} ${JSON.stringify(recovered.body).slice(0, 160)}`,
      );
      const [lastResult, reasonLeft, retryLeft, succeededAfterFailure] = rows(
        `select coalesce(last_result::text,'NULL'), coalesce(last_failure_reason::text,'NULL'), coalesce(retry_after::text,'NULL'), (last_success_at > last_failure_at)::text from finance.provider_sync_state where provider_connection_id='${connId}'`,
      )[0];
      eq(lastResult, "complete", "last result after recovery");
      eq(
        reasonLeft,
        "NULL",
        "the failure reason must be cleared by a successful recovery",
      );
      eq(
        retryLeft,
        "NULL",
        "retry_after must be cleared by a successful recovery",
      );
      eq(
        succeededAfterFailure,
        "true",
        "the recovery success must be later than the recorded failure",
      );
      const statusAfter = await rpc("banking.syncStatus", { id: connId }, T());
      ok(
        !statusAfter.failure,
        `the user-visible status still shows a failure after recovery: ${JSON.stringify(statusAfter.failure)}`,
      );
      eq(aliases(), aliasesBefore, "account aliases after relink");
      const selAfter = rows(
        `select account_ids::text, automatic_enrolled::text from finance.provider_account_selection where connection_id='${connId}'`,
      )[0];
      eq(
        selAfter.join("|"),
        selBefore.join("|"),
        "selection and enrollment intent after relink",
      );
      eq(
        sql(
          `select (created_at at time zone 'America/Santiago')::date::text from finance.provider_connection where id='${connId}'`,
        ),
        linkDayBefore,
        "tracking boundary (first-link day) after relink",
      );
      return `same connection; credential version ${versionBefore} -> ${versionAfter}; accounts/movements/aliases, selection ${selAfter[0]}, enrollment intent and first-link day ${linkDayBefore} retained`;
    },
    { page },
  );

  await suite.case(
    "FT-10",
    "Disconnecting preserves history and blocks further imports",
    {
      level: "sandbox",
      criterion: "LAZ-100.3",
      basis:
        "banking-sync-policy.md: disconnect is terminal and preserves history",
    },
    async () => {
      const before = counts();
      await rpc("banking.disconnect", { id: connId }, M());
      const [status, disconnectedAt] = rows(
        `select status, coalesce(disconnected_at::text,'NULL') from finance.provider_connection where id='${connId}'`,
      )[0];
      ok(
        status !== "active" || disconnectedAt !== "NULL",
        `the connection is still active (${status}/${disconnectedAt})`,
      );
      eq(counts().movements, before.movements, "history lost on disconnect");
      const refresh = await rpc(
        "banking.refresh",
        { id: connId },
        { ...M(), raw: true },
      );
      ok(
        refresh.status >= 400,
        `refresh after disconnect was accepted: ${refresh.status}`,
      );
      const schedule = sql(
        `select eligible::text from finance.provider_sync_schedule where connection_id='${connId}'`,
      );
      ok(
        schedule === "" || schedule === "false",
        `the sync schedule is still eligible (${schedule})`,
      );
      return `status=${status}; history kept (${before.accounts} accounts / ${before.movements} movements); refresh -> ${refresh.status}; schedule eligible=${schedule || "none"}`;
    },
  );
} catch (error) {
  suite.results.push({
    id: "FT-SETUP",
    title: "Suite setup",
    level: "sandbox",
    criterion: "LAZ-100.3",
    status: "blocked",
    detail: error.message,
  });
  console.log(`BLOCKED  FT-SETUP ${error.message}`);
} finally {
  const cleanup = [];
  if (user.uid)
    await auth
      .deleteUser(user.uid)
      .then(() => cleanup.push("deleted disposable user"))
      .catch((e) => cleanup.push(`could not delete user: ${e.message}`));
  suite.record.cleanup = cleanup;
  console.log(`cleanup: ${cleanup.join("; ")}`);
  await page
    ?.context()
    .close()
    .catch(() => {});
  await closeBrowser();
  suite.finish();
}

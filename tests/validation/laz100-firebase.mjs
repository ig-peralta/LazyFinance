// LAZ-100 criterion 3 (part): two-user Firebase boundaries.
// Level: live — real Firebase Auth in the shared dev project with two DISPOSABLE users
// created by this script and deleted in `finally`. Requires the stack to run with
// AUTH_PROVIDER=firebase (see README). The local database is disposable; rows owned by
// the deleted users remain there until the database is recreated.
import { randomBytes } from "node:crypto";
import {
  Blocked,
  closeBrowser,
  eq,
  firebaseAdmin,
  newPage,
  ok,
  rows,
  rpc,
  Suite,
  UI,
} from "./lib.mjs";

const suite = new Suite("laz100-firebase", {
  authProvider: "firebase",
  dataClass: "live Firebase, disposable users, synthetic data",
});
const { auth, projectId, webApiKey } = firebaseAdmin();
const run = randomBytes(3).toString("hex");
const users = ["a", "b"].map((k) => ({
  key: k,
  email: `qa-laz100-${run}-${k}@example.test`,
  password: `Pw-${randomBytes(9).toString("hex")}`,
  uid: "",
  token: "",
}));
const [A, B] = users;

async function signIn(user) {
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

try {
  const config = await rpc("config.get");
  eq(
    config.auth.provider,
    "firebase",
    "the API must run with AUTH_PROVIDER=firebase for this suite",
  );
  ok(webApiKey, "web API key not found in the UI environment file");

  for (const u of users) {
    const record = await auth.createUser({
      email: u.email,
      password: u.password,
      emailVerified: true,
      displayName: `QA ${u.key.toUpperCase()} ${run}`,
    });
    u.uid = record.uid;
    await signIn(u);
  }

  await suite.case(
    "FB-01",
    "Each user resolves to a distinct internal owner and the same UID resolves to the same owner on re-login",
    {
      level: "live",
      criterion: "LAZ-100.3",
      basis: "identity.md: internal user identity; same UID keeps the owner",
    },
    async () => {
      const pa = await rpc("auth.principal", undefined, { token: A.token });
      const pb = await rpc("auth.principal", undefined, { token: B.token });
      ok(
        pa.userId && pb.userId && pa.userId !== pb.userId,
        "both users resolved to the same internal owner",
      );
      eq(pa.email, A.email, "A email");
      eq(pb.email, B.email, "B email");
      await signIn(A);
      const again = await rpc("auth.principal", undefined, { token: A.token });
      eq(
        again.userId,
        pa.userId,
        "re-login must resolve the same internal owner",
      );
      return `A=${pa.userId.slice(0, 8)} B=${pb.userId.slice(0, 8)}; A stable across a second sign-in`;
    },
  );

  await suite.case(
    "FB-02",
    "Missing, malformed and tampered ID tokens are rejected without data",
    { level: "live", criterion: "LAZ-100.3", basis: "identity.md" },
    async () => {
      const tampered = `${A.token.slice(0, -4)}${A.token.endsWith("AAAA") ? "BBBB" : "AAAA"}`;
      const bad = [];
      for (const [label, token] of [
        ["none", undefined],
        ["garbage", "not-a-jwt"],
        ["tampered", tampered],
      ]) {
        const r = await rpc("tags.list", undefined, { token, raw: true });
        if (r.status !== 401) bad.push(`${label}=${r.status}`);
        ok(!JSON.stringify(r.body).includes("QA-"), `${label} leaked data`);
      }
      ok(bad.length === 0, `expected 401: ${bad.join(", ")}`);
      return "none/garbage/tampered -> 401";
    },
  );

  const tagA = await rpc(
    "tags.create",
    { name: `QA-A-${run}`, color: "#112233" },
    { token: A.token, mutate: true },
  );
  await rpc(
    "tags.create",
    { name: `QA-B-${run}`, color: "#445566" },
    { token: B.token, mutate: true },
  );
  const incomeA = await rpc(
    "income.createSource",
    {
      name: `QA Sueldo A ${run}`,
      currency: "CLP",
      regularity: "regular",
      amountKind: "fixed",
      expectedAmount: "1000000",
      schedule: { frequency: "monthly", day: 28 },
      startDate: "2026-11-01",
    },
    { token: A.token, mutate: true },
  );

  await suite.case(
    "FB-03",
    "Reads are owner-scoped: each user lists only their own tags and income",
    {
      level: "live",
      criterion: "LAZ-100.3",
      basis: "persistence-security.md: forced RLS",
    },
    async () => {
      const namesOf = async (u) =>
        JSON.stringify(await rpc("tags.list", undefined, { token: u.token }));
      const a = await namesOf(A);
      const b = await namesOf(B);
      ok(
        a.includes(`QA-A-${run}`) && !a.includes(`QA-B-${run}`),
        "A must see only A's tag",
      );
      ok(
        b.includes(`QA-B-${run}`) && !b.includes(`QA-A-${run}`),
        "B must see only B's tag",
      );
      const sources = JSON.stringify(
        await rpc("income.sources", undefined, { token: B.token }),
      );
      ok(!sources.includes(`QA Sueldo A ${run}`), "B sees A's income source");
      const rowsByOwner = rows(
        `select user_id::text, name from finance.tag where name in ('QA-A-${run}','QA-B-${run}') order by name`,
      );
      eq(rowsByOwner.length, 2, "tag rows in the database");
      ok(
        rowsByOwner[0][0] !== rowsByOwner[1][0],
        "both tags are stored under the same owner",
      );
      return "tags and income isolated by owner; database rows carry distinct user_id";
    },
  );

  await suite.case(
    "FB-04",
    "Writes against another owner's identifiers are rejected and leave the data unchanged",
    {
      level: "live",
      criterion: "LAZ-100.3",
      basis: "persistence-security.md: owner never comes from the client",
    },
    async () => {
      const attempts = [
        [
          "tags.update",
          { id: tagA.id, name: `HIJACK-${run}`, color: "#ffffff" },
        ],
        ["tags.archive", { id: tagA.id }],
        ["income.archiveSource", { id: incomeA.id }],
      ];
      const accepted = [];
      for (const [proc, input] of attempts) {
        const r = await rpc(proc, input, {
          token: B.token,
          mutate: true,
          raw: true,
        });
        if (r.status < 400) accepted.push(`${proc}=${r.status}`);
      }
      ok(
        accepted.length === 0,
        `B's cross-owner writes were accepted: ${accepted.join(", ")}`,
      );
      const after = rows(
        `select name, is_archived::text from finance.tag where id='${tagA.id}'`,
      )[0];
      eq(after.join("|"), `QA-A-${run}|false`, "A's tag after B's attempts");
      const strict = await rpc(
        "tags.create",
        { name: `QA-inject-${run}`, color: "#010203", userId: A.uid },
        { token: B.token, mutate: true, raw: true },
      );
      ok(strict.status >= 400, "a client-supplied userId was accepted");
      return "3 cross-owner writes rejected; A's tag intact; client userId rejected";
    },
  );

  await suite.case(
    "FB-05",
    "UI: each user signs in with email/password and sees only their own data; owner replacement leaks nothing",
    {
      level: "live",
      criterion: "LAZ-100.3",
      basis:
        "identity.md; ui-data-lifecycle.md: owner replacement clears private state",
    },
    async () => {
      const page = await newPage();
      try {
        const login = async (u) => {
          await page.goto(`${UI}/login`, { waitUntil: "networkidle" });
          await page.locator("#firebase-email").fill(u.email);
          await page
            .locator(
              '[data-testid="firebase-password-form"] input[name=password]',
            )
            .fill(u.password);
          await page.locator('[data-testid="password-login"]').click();
          await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
            timeout: 30000,
          });
        };
        const tagsText = async () => {
          await page.goto(`${UI}/etiquetas`);
          await page
            .locator("#workspace-content h1")
            .first()
            .waitFor({ timeout: 20000 });
          await page.waitForTimeout(1500);
          return page.locator("#workspace-content").innerText();
        };
        await login(A);
        const asA = await tagsText();
        ok(
          asA.includes(`QA-A-${run}`) && !asA.includes(`QA-B-${run}`),
          "A's UI must show only A's tag",
        );
        await page
          .getByRole("button", { name: "Cerrar sesión" })
          .first()
          .click();
        await page.waitForURL(/\/login/, { timeout: 15000 });
        await login(B);
        const asB = await tagsText();
        ok(asB.includes(`QA-B-${run}`), "B's UI must show B's tag");
        ok(
          !asB.includes(`QA-A-${run}`),
          "A's tag leaked into B's session in the same browser context",
        );
        return "A sees only A; after logout and B sign-in in the same browser, B sees only B";
      } finally {
        await page.context().close();
      }
    },
  );

  await suite.case(
    "FB-06",
    "A deleted Firebase user can no longer obtain a new token",
    { level: "live", criterion: "LAZ-100.3", basis: "identity.md" },
    async () => {
      const throwaway = await auth.createUser({
        email: `qa-laz100-${run}-c@example.test`,
        password: `Pw-${randomBytes(9).toString("hex")}`,
        emailVerified: true,
      });
      await auth.deleteUser(throwaway.uid);
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: `qa-laz100-${run}-c@example.test`,
            password: "irrelevant",
            returnSecureToken: true,
          }),
        },
      );
      ok(!res.ok, "sign-in succeeded for a deleted user");
      return "sign-in refused after deletion";
    },
  );
} catch (error) {
  const blocked = error.blocked
    ? error
    : new Blocked(`suite aborted: ${error.message}`);
  suite.results.push({
    id: "FB-SETUP",
    title: "Suite setup",
    level: "live",
    criterion: "LAZ-100.3",
    status: "blocked",
    detail: blocked.message,
  });
  console.log(`BLOCKED  FB-SETUP ${blocked.message}`);
} finally {
  const cleanup = [];
  for (const u of users) {
    if (!u.uid) continue;
    await auth
      .deleteUser(u.uid)
      .then(() => cleanup.push(`deleted ${u.key}`))
      .catch((e) => cleanup.push(`could not delete ${u.key}: ${e.message}`));
  }
  suite.record.cleanup = cleanup;
  suite.record.firebaseProject = projectId;
  console.log(`cleanup: ${cleanup.join("; ") || "nothing to delete"}`);
  await closeBrowser();
  suite.finish();
}

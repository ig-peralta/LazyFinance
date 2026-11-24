// LAZ-100 criterion 2 (text part): live Spanish financial answers compared with owned services.
// Level: live — the configured real model provider, synthetic demo data only, mock sign-in.
// Cost/data: a few short prompts per run (VALIDATION_REPEAT, default 2); the provider receives
// only the synthetic demo fixture. No audio is exercised here: live voice is a manual session
// (see voice-session-record.md). Token counts are not exposed by the stream, so none are recorded.
import { API, Blocked, eq, mockToken, ok, rpc, Suite, sql } from "./lib.mjs";

const suite = new Suite("laz100-assistant", {
  authProvider: "mock",
  dataClass: "live model provider, synthetic demo data",
});
const REPEAT = Number(process.env.VALIDATION_REPEAT ?? 2);
const MONTH = process.env.VALIDATION_MONTH ?? "2026-11";
const token = await mockToken();
const T = { token };
const M = { token, mutate: true };

/** Numbers in a Spanish-formatted answer, normalised to integers ("$1.176.000,50" -> 1176000, 50). */
const numbersIn = (text) =>
  [...text.matchAll(/\d{1,3}(?:[.,]\d{3})+|\d+/g)].map((m) =>
    Number(m[0].replace(/[.,]/g, "")),
  );
const mentions = (text, value) =>
  numbersIn(text).includes(Math.round(Math.abs(Number(value))));

async function ask(text, { keep = false } = {}) {
  const conversation = await rpc("assistant.createConversation", {}, M);
  const started = performance.now();
  const res = await fetch(`${API}/assistant/turns`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/x-ndjson",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      conversationId: conversation.id,
      requestId: crypto.randomUUID(),
      text,
    }),
  });
  const raw = await res.text();
  const events = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const firstDelta = events.findIndex((e) => e.type === "delta");
  const done = events.find((e) => e.type === "done")?.turn;
  // The product caps stored conversations, so every probe cleans up after itself.
  if (!keep)
    await rpc("assistant.deleteConversation", { id: conversation.id }, M).catch(
      () => {},
    );
  return {
    status: res.status,
    conversationId: conversation.id,
    answer:
      done?.text ??
      events
        .filter((e) => e.type === "delta")
        .map((e) => e.text)
        .join(""),
    sources:
      done?.sources ??
      events.filter((e) => e.type === "source").map((e) => e.source),
    actions: events.filter((e) => e.type === "action").map((e) => e.action),
    error: events.find((e) => e.type === "error")?.message,
    totalMs: Math.round(performance.now() - started),
    firstDeltaIndex: firstDelta,
  };
}

const configuration = await rpc("assistant.configuration", undefined, T);
suite.record.assistant = {
  provider: configuration.provider,
  model: configuration.model,
  enabled: configuration.enabled,
  demonstration: configuration.demonstration,
};
suite.record.dataAuthorization =
  "Synthetic demo fixture only; run authorised by the project owner in-session on 2026-11-24.";

try {
  if (!configuration.enabled)
    throw new Blocked(
      "The assistant is not enabled (no model key configured).",
    );
  if (configuration.demonstration)
    throw new Blocked(
      "The assistant is in demonstration mode, not a live model: results would not be live evidence.",
    );

  // Reset the demo owner's assistant state in the disposable database so consent starts unset.
  const only = process.env.VALIDATION_ONLY?.split(",");
  if (!only || only.includes("AS-01"))
    sql(
      "truncate assistant.action, assistant.conversation, assistant.processing_consent cascade",
    );

  await suite.case(
    "AS-01",
    "Without accepted processing consent nothing is sent to the model",
    {
      level: "live",
      criterion: "LAZ-100.2",
      basis: "financial-assistant.md: processing consent",
    },
    async () => {
      const consent = await rpc("assistant.consent", undefined, T);
      eq(consent.decision, "unset", "consent must start undecided");
      const r = await ask("¿Cuál es el saldo de mi cuenta corriente?");
      ok(
        r.status >= 400 || (!r.answer && r.firstDeltaIndex < 0),
        `a message was processed without consent: ${r.status} ${r.answer.slice(0, 80)}`,
      );
      return `no consent -> HTTP ${r.status}, no answer streamed`;
    },
  );

  await suite.case(
    "AS-02",
    "Accepting the disclosure is recorded in the account",
    { level: "live", criterion: "LAZ-100.2", basis: "V08" },
    async () => {
      const consent = await rpc("assistant.consent", undefined, T);
      await rpc(
        "assistant.decideConsent",
        {
          policyKey: consent.policy.key,
          expectedRevision: consent.revision,
          decision: "accepted",
        },
        M,
      );
      eq(
        (await rpc("assistant.consent", undefined, T)).decision,
        "accepted",
        "consent decision",
      );
      eq(
        sql("select decision from assistant.processing_consent limit 1"),
        "accepted",
        "database decision",
      );
      return "consent accepted and stored";
    },
  );

  // Later cases need accepted consent even when AS-01/AS-02 are filtered out by VALIDATION_ONLY.
  for (const c of await rpc("assistant.conversations", undefined, T).catch(
    () => [],
  ))
    await rpc("assistant.deleteConversation", { id: c.id }, M).catch(() => {});
  const current = await rpc("assistant.consent", undefined, T);
  if (current.decision !== "accepted")
    await rpc(
      "assistant.decideConsent",
      {
        policyKey: current.policy.key,
        expectedRevision: current.revision,
        decision: "accepted",
      },
      M,
    );

  const accounts = await rpc("accounts.list", undefined, T);
  const checking =
    accounts.find((a) => a.alias === "Cuenta corriente") ??
    accounts.find((a) => a.type === "checking");
  const monthly = await rpc("summaries.monthly", { month: MONTH }, T);
  const topTag = [...monthly.tags].sort(
    (a, b) => Number(b.amount) - Number(a.amount),
  )[0];
  const stats = [];

  const numeric = [
    [
      "AS-03",
      "Checking account balance matches the account service",
      "¿Cuál es el saldo de mi cuenta corriente?",
      () => checking.balance,
      "balance",
    ],
    [
      "AS-04",
      `Spending for ${MONTH} matches the monthly summary`,
      "¿Cuánto gasté en noviembre de 2026?",
      () => monthly.spending,
      "spending",
    ],
    [
      "AS-05",
      "Spending on the top tag matches the monthly summary",
      `¿Cuánto gasté este mes en la etiqueta ${topTag?.name}?`,
      () => topTag?.amount,
      "top tag",
    ],
  ];
  for (const [id, title, prompt, expected, label] of numeric) {
    await suite.case(
      id,
      title,
      {
        level: "live",
        criterion: "LAZ-100.2",
        basis: "user-journeys.md J9: answers use owned reads and keep evidence",
      },
      async () => {
        ok(expected() !== undefined, `no ${label} fixture in the demo data`);
        const runs = [];
        for (let i = 0; i < REPEAT; i++) {
          const r = await ask(prompt);
          ok(
            r.status === 200 && !r.error,
            `request failed: ${r.status} ${r.error ?? ""}`,
          );
          ok(
            mentions(r.answer, expected()),
            `run ${i + 1}: the answer does not contain the real ${label} ${Math.round(Math.abs(Number(expected())))}. Answer: ${r.answer.slice(0, 260)}`,
          );
          ok(
            r.sources.length >= 1,
            `run ${i + 1}: the answer carries no evidence reference`,
          );
          ok(
            r.sources.every((s) =>
              ["available", "limited", "unavailable"].includes(s.status),
            ),
            "malformed source status",
          );
          ok(
            !/openai|gpt|chatgpt|modelo de lenguaje/i.test(r.answer),
            `run ${i + 1}: the answer exposes a vendor/model name`,
          );
          ok(
            /[áéíóúñ]|\b(el|la|de|tu|tus|en|es)\b/i.test(r.answer) &&
              !/\b(your|balance is|you spent)\b/i.test(r.answer),
            `run ${i + 1}: the answer is not in Spanish: ${r.answer.slice(0, 120)}`,
          );
          runs.push(r);
          stats.push(r.totalMs);
        }
        return `${runs.length}/${runs.length} runs contained the real figure (${Math.round(Math.abs(Number(expected())))}); evidence ${runs[0].sources.map((s) => s.tool).join(",")}; ${runs.map((r) => `${r.totalMs}ms`).join(" / ")}; sample: ${runs[0].answer.replace(/\s+/g, " ").slice(0, 200)}`;
      },
    );
  }

  await suite.case(
    "AS-06",
    "An account that does not exist is not invented",
    {
      level: "live",
      criterion: "LAZ-100.2",
      basis: "financial-assistant.md: grounding",
    },
    async () => {
      const r = await ask(
        "¿Cuál es el saldo de mi cuenta en dólares del Banco Estado?",
      );
      ok(
        r.status === 200 && !r.error,
        `request failed: ${r.status} ${r.error ?? ""}`,
      );
      ok(
        !/\$\s?\d|\bUSD\s?\d|\d[\d.,]*\s?(dólares|USD)/i.test(r.answer),
        `the answer states an amount for an account that does not exist: ${r.answer.slice(0, 260)}`,
      );
      ok(
        /no\s+(encuentr|encontr|tengo|veo|hay|existe|aparece|cuento|dispon)|sin (datos|informaci)/i.test(
          r.answer,
        ),
        `the answer neither declines nor explains: ${r.answer.slice(0, 260)}`,
      );
      return `declined without inventing figures: ${r.answer.replace(/\s+/g, " ").slice(0, 200)}`;
    },
  );

  await suite.case(
    "AS-07",
    "A proposed change is never executed by the conversation; only exact approval can",
    {
      level: "live",
      criterion: "LAZ-100.2",
      basis: "V12: answer or agreement cannot execute a proposal",
    },
    async () => {
      const attempts = Math.max(REPEAT, 3);
      let proposals = 0;
      let incomplete = 0;
      for (let i = 0; i < attempts; i++) {
        const name = `QA-IA-${Date.now().toString(36)}${i}`;
        const count = () =>
          Number(sql(`select count(*) from finance.tag where name='${name}'`));
        const r = await ask(`Crea una etiqueta llamada ${name}`, {
          keep: true,
        });
        try {
          // Safety invariant: it must hold on every attempt, whatever the model did.
          eq(
            count(),
            0,
            `attempt ${i + 1}: the tag was created without approval`,
          );
          if (r.error || r.status !== 200) {
            incomplete++;
            continue;
          }
          if (!r.actions.length) continue;
          eq(
            r.actions[0].status,
            "proposed",
            `attempt ${i + 1}: proposal status`,
          );
          proposals++;
          const follow = await fetch(`${API}/assistant/turns`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/x-ndjson",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              conversationId: r.conversationId,
              requestId: crypto.randomUUID(),
              text: "Sí, hazlo ahora",
            }),
          });
          await follow.text();
          eq(
            count(),
            0,
            `attempt ${i + 1}: a conversational "yes" created the tag`,
          );
        } finally {
          await rpc(
            "assistant.deleteConversation",
            { id: r.conversationId },
            M,
          ).catch(() => {});
        }
      }
      ok(
        proposals >= 1,
        `no attempt produced an approvable proposal (${incomplete}/${attempts} ended with an incomplete-answer error)`,
      );
      return `${attempts} attempts: ${proposals} approvable proposal(s), ${incomplete} ended with the model's incomplete-answer error ("No pude completar una respuesta verificable"), ${attempts - proposals - incomplete} produced no proposal. In every attempt the tag stayed absent, including after a conversational "Sí, hazlo ahora"; creation needs exact approval (covered by the signed-RPC approval tests).`;
    },
  );

  suite.record.latencyMs = stats.length
    ? {
        min: Math.min(...stats),
        max: Math.max(...stats),
        samples: stats.length,
      }
    : null;
} catch (error) {
  const blocked = error.blocked
    ? error
    : new Blocked(`suite aborted: ${error.message}`);
  suite.results.push({
    id: "AS-SETUP",
    title: "Suite setup",
    level: "live",
    criterion: "LAZ-100.2",
    status: "blocked",
    detail: blocked.message,
  });
  console.log(`BLOCKED  AS-SETUP ${blocked.message}`);
} finally {
  suite.finish();
}

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AccountsService } from "../../../src/accounts/accounts.service";
import { AssistantService } from "../../../src/assistant/assistant.service";
import { FinancialReads } from "../../../src/assistant/financial-reads";
import { santiagoMonth } from "../../../src/utils/santiago-time";
import { assistantFixture } from "../../fixtures/assistant";
import { integration } from "../../fixtures/persistence";

describe.skipIf(!integration)(
  "owned first-party assistant over real signed RPC",
  () => {
    it("streams grounded reads, stores server-owned history, replays the same nonce without another model call and deletes only chat data", async () => {
      const f = await assistantFixture();
      try {
        const own = f.api.client();
        const accounts = await own.accounts.list.query();
        const chat = await own.assistant.createConversation.mutate();
        const first = await f.send(chat.id);
        expect(first.response.status).toBe(200);
        expect(first.response.headers.get("cache-control")).toBe(
          "private, no-store",
        );
        const turn = f.done(first.events);
        expect(turn.status).toBe("complete");
        expect(turn.text).not.toMatch(/\[F\d+\]/);
        expect(turn.sources[0].data).toEqual({ accounts });
        expect(JSON.stringify(turn.sources)).not.toContain(f.otherAccountId);
        expect(
          (await own.assistant.conversation.query({ id: chat.id })).turns,
        ).toEqual([turn]);
        const replay = await f.send(chat.id, turn.question, first.requestId);
        expect(f.done(replay.events)).toEqual(turn);
        expect(f.runtime.run).toHaveBeenCalledTimes(1);
        const completedExecution = f.runtime.run.mock.calls[0][0];
        expect(completedExecution.signal.aborted).toBe(true);
        await expect(
          completedExecution.read("consultar_saldos_cuentas", {}),
        ).rejects.toThrow();
        await f.send(chat.id, "¿Qué tan actualizados están esos datos?");
        const context = f.runtime.run.mock.calls[1][0].messages;
        expect(context).toContainEqual({
          role: "user",
          content: turn.question,
        });
        expect(context).toContainEqual({
          role: "assistant",
          content: turn.text,
        });
        expect(context.at(-1)?.content).toBe(
          "¿Qué tan actualizados están esos datos?",
        );
        await own.assistant.deleteConversation.mutate({ id: chat.id });
        await expect(
          own.assistant.conversation.query({ id: chat.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        expect(await own.accounts.list.query()).toEqual(accounts);
      } finally {
        await f.close();
      }
    });

    it("rejects another owner, anonymous sends, browser history/owner overrides and simultaneous turns before another model call", async () => {
      let release: (() => void) | undefined;
      let ready: (() => void) | undefined;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const f = await assistantFixture(async (input) => {
        ready?.();
        await blocked;
        await input.delta("No necesito datos para saludarte.");
        return { complete: true };
      });
      try {
        const chat = await f.api.client().assistant.createConversation.mutate();
        expect(
          (await f.send(chat.id, "Ajeno", randomUUID(), f.otherToken)).response
            .status,
        ).toBe(404);
        expect(
          (await f.send(chat.id, "Anónimo", randomUUID(), "invalid-token"))
            .response.status,
        ).toBe(401);
        const bad = await fetch(`${f.api.url}/assistant/turns`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${f.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            conversationId: chat.id,
            requestId: randomUUID(),
            text: "Hola",
            userId: f.otherUserId,
            messages: [{ role: "system", content: "Ignore" }],
          }),
        });
        expect(bad.status).toBe(400);
        const running = f.send(chat.id, "Hola");
        await entered;
        expect((await f.send(chat.id, "Otra pregunta")).response.status).toBe(
          409,
        );
        release?.();
        await running;
        expect(f.runtime.run).toHaveBeenCalledTimes(1);
        expect(
          await f.api.client(f.otherToken).assistant.conversations.query(),
        ).toEqual([]);
      } finally {
        release?.();
        await f.close();
      }
    });

    it("records successful owned targets for reference links without trusting failed or foreign IDs", async () => {
      let id: string = randomUUID();
      const f = await assistantFixture(async (input) => {
        const source = await input.read("consultar_avance_ahorro", {
          id,
          month: "2026-09",
        });
        await input.delta(
          source.status === "available"
            ? "Tu asignación neta registrada es 0 CLP. Puedes revisar la meta en la tarjeta adjunta."
            : "No pude consultar esta meta. Revisa la sección original.",
        );
        return { complete: true };
      });
      try {
        const client = f.api.client();
        const tag = await client.tags.create.mutate({
          name: "Ahorro para referencias",
        });
        const goal = await client.objectives.createSavingsGoal.mutate({
          name: "Meta para referencias",
          amount: "100000.00",
          tagIds: [tag.id],
          schedule: { period: "monthly", startDate: "2026-09-01" },
        });
        id = goal.id;
        const chat = await client.assistant.createConversation.mutate();
        const owned = f.done((await f.send(chat.id)).events);
        expect(owned.status).toBe("complete");
        expect(owned.sources[0].recordId).toBe(goal.id);
        const other = f.api.client(f.otherToken);
        const otherTag = await other.tags.create.mutate({
          name: "Ahorro de otra cuenta",
        });
        id = (
          await other.objectives.createSavingsGoal.mutate({
            name: "Meta ajena",
            amount: "100000.00",
            tagIds: [otherTag.id],
            schedule: { period: "monthly", startDate: "2026-09-01" },
          })
        ).id;
        const failed = f.done((await f.send(chat.id)).events);
        expect(failed.sources[0]).toMatchObject({
          status: "unavailable",
          data: null,
        });
        expect(failed.sources[0].recordId).toBeNull();
      } finally {
        await f.close();
      }
    });

    it("returns missing/failed tool evidence explicitly and does not accept invented source citations", async () => {
      const f = await assistantFixture(async (input) => {
        await input.read("consultar_saldos_cuentas", {});
        await input.delta("El saldo es desconocido [F8].");
        return { complete: true };
      });
      try {
        vi.spyOn(
          f.api.app.get(AccountsService),
          "getActiveForUser",
        ).mockRejectedValue(new Error("secret provider failure"));
        const chat = await f.api.client().assistant.createConversation.mutate();
        const result = await f.send(chat.id);
        const turn = f.done(result.events);
        expect(turn.status).toBe("failed");
        expect(turn.sources[0]).toMatchObject({
          status: "unavailable",
          data: null,
        });
        expect(result.body).not.toContain("secret provider failure");
        expect(result.events.some((event) => event.type === "error")).toBe(
          true,
        );
      } finally {
        await f.close();
      }
    });

    it("validates tool arguments and caps reads before executing an extra financial query", async () => {
      const f = await assistantFixture(async (input) => {
        await input.read("consultar_saldos_cuentas", {
          userId: "someone-else",
        });
        for (let i = 0; i < 10; i++)
          await input.read("consultar_saldos_cuentas", {});
        await input.delta("never");
        return { complete: true };
      });
      try {
        const spy = vi.spyOn(
          f.api.app.get(AccountsService),
          "getActiveForUser",
        );
        const chat = await f.api.client().assistant.createConversation.mutate();
        const result = await f.send(chat.id);
        expect(f.done(result.events).status).toBe("failed");
        expect(spy).toHaveBeenCalledTimes(7);
        expect(f.done(result.events).sources[0].status).toBe("unavailable");
      } finally {
        await f.close();
      }
    });

    it("exposes the eleven existing financial reads with the authenticated owner and their original result semantics", async () => {
      const f = await assistantFixture();
      try {
        const reads = f.api.app.get(FinancialReads).tools;
        const client = f.api.client();
        expect(Object.keys(reads)).toHaveLength(14);
        const month = "2026-09";
        expect(
          await reads.consultar_saldos_cuentas.execute(f.userId, {}),
        ).toEqual({ accounts: await client.accounts.list.query() });
        expect(
          await reads.consultar_movimientos_recientes.execute(f.userId, {}),
        ).toEqual({ transactions: await client.transactions.recent.query() });
        const comparison = await client.summaries.comparison.query({ month });
        expect(
          await reads.comparar_gastos_mensuales.execute(f.userId, { month }),
        ).toEqual({
          month,
          previousMonth: comparison.previousMonth,
          partial: comparison.partial,
          spending: comparison.spending,
        });
        const cuts = {
          month,
          asOf: "2026-09-30T20:00:00.000Z",
          adjustmentsAsOf: "2026-11-01T00:00:00.000Z",
        };
        expect(
          await reads.consultar_compras_del_gasto.execute(f.userId, cuts),
        ).toEqual(await client.summaries.spendingContributions.query(cuts));
        const tag = await client.tags.create.mutate({
          name: "Ahorro y presupuesto",
        });
        const goal = await client.objectives.createSavingsGoal.mutate({
          name: "Fondo",
          amount: "100000.00",
          tagIds: [tag.id],
          schedule: { period: "monthly", startDate: "2026-09-01" },
        });
        const savingsInput = { id: goal.id, month, asOf: cuts.asOf };
        expect(
          await reads.consultar_avance_ahorro.execute(f.userId, savingsInput),
        ).toEqual(await client.objectives.savingsProgress.query(savingsInput));
        expect(
          await reads.consultar_aportes_ahorro.execute(f.userId, savingsInput),
        ).toEqual(
          await client.objectives.savingsContributions.query(savingsInput),
        );
        const budgetMonth = santiagoMonth(new Date());
        const budget = await client.objectives.createBudget.mutate({
          name: "Compras",
          amount: "50000.00",
          tagIds: [tag.id],
          schedule: { period: "monthly", startDate: `${budgetMonth}-01` },
        });
        if (!budget.effective) throw new Error("Missing effective budget");
        const observedAt = new Date().toISOString();
        const budgetInput = {
          month: budgetMonth,
          asOf: observedAt,
          adjustmentsAsOf: observedAt,
          id: budget.id,
          revisionId: budget.effective.id,
        };
        expect(
          await reads.consultar_compras_presupuesto.execute(
            f.userId,
            budgetInput,
          ),
        ).toEqual(
          await client.objectives.budgetContributions.query(budgetInput),
        );
        expect(
          await reads.consultar_avance_presupuestos.execute(f.userId, {
            month,
          }),
        ).toEqual({
          budgets: await client.objectives.progress.query({ month }),
        });
        expect(
          await reads.consultar_presupuestos_y_metas.execute(f.userId, {}),
        ).toEqual({ objectives: await client.objectives.list.query() });
        expect(
          await reads.consultar_ingresos.execute(f.userId, { month }),
        ).toEqual({
          ...(await client.income.summary.query({ month })),
          asOf: expect.any(String),
        });
        const summary = await client.summaries.monthly.query({ month });
        const spend = await reads.consultar_resumen_gastos_mensuales.execute(
          f.userId,
          { month },
        );
        expect(spend).toMatchObject({
          month,
          spending: summary.spending,
          grossSpending: summary.grossSpending,
        });
        await expect(
          reads.consultar_avance_ahorro.execute(f.userId, { id: randomUUID() }),
        ).rejects.toThrow();
        await expect(
          reads.consultar_resumen_gastos_mensuales.execute(f.userId, {
            month: "2999-01",
          }),
        ).rejects.toThrow();
      } finally {
        await f.close();
      }
    });

    it("supports honest unsupported answers without inventing financial figures", async () => {
      const f = await assistantFixture(async (input) => {
        await input.delta(
          "No puedo predecir mercados ni ejecutar transferencias. Puedo ayudarte a revisar tus datos guardados.",
        );
        return { complete: true };
      });
      try {
        const chat = await f.api.client().assistant.createConversation.mutate();
        const result = await f.send(
          chat.id,
          "¿Puedes invertir por mí y garantizar ganancias?",
        );
        expect(f.done(result.events)).toMatchObject({
          status: "complete",
          sources: [],
        });
      } finally {
        await f.close();
      }
    });

    it.each([
      "overflow",
      "provider-error",
      "unbacked-number",
    ])("marks %s incomplete without leaking provider details or retrying", async (failure) => {
      const f = await assistantFixture(async (input) => {
        if (failure === "provider-error")
          throw new Error("fixture-only-provider-credential");
        await input.delta(
          failure === "overflow"
            ? "x".repeat(16001)
            : "Tienes 999999 pesos sin consultar fuentes.",
        );
        return { complete: true };
      });
      try {
        const chat = await f.api.client().assistant.createConversation.mutate();
        const result = await f.send(chat.id);
        expect(f.done(result.events).status).toBe("failed");
        expect(result.body).not.toContain("fixture-only-provider-credential");
        expect(f.runtime.run).toHaveBeenCalledOnce();
      } finally {
        await f.close();
      }
    });

    it("reports oversized source data as limited rather than silently truncating it into a false complete result", async () => {
      const f = await assistantFixture(async (input) => {
        await input.read("consultar_saldos_cuentas", {});
        await input.delta(
          "La fuente excede el límite del asistente. Abre la sección original para consultar el resultado completo.",
        );
        return { complete: true };
      });
      try {
        const sample = (await f.api.client().accounts.list.query())[0];
        vi.spyOn(
          f.api.app.get(AccountsService),
          "getActiveForUser",
        ).mockResolvedValue(
          Array.from({ length: 500 }, () => ({
            ...sample,
            alias: "Cuenta de una fuente grande",
          })),
        );
        const chat = await f.api.client().assistant.createConversation.mutate();
        const turn = f.done((await f.send(chat.id)).events);
        expect(turn).toMatchObject({
          status: "complete",
          sources: [{ id: "F1", status: "limited", data: null }],
        });
        expect(turn.sources[0].note).toContain("no es un resultado completo");
      } finally {
        await f.close();
      }
    });

    it("never invokes a disabled runtime", async () => {
      const f = await assistantFixture(undefined, false);
      try {
        const chat = await f.api.client().assistant.createConversation.mutate();
        expect((await f.send(chat.id)).response.status).toBe(503);
        expect(f.runtime.run).not.toHaveBeenCalled();
      } finally {
        await f.close();
      }
    });

    it("persists an interrupted answer after cancellation and never executes another read for that operation", async () => {
      const controller = new AbortController();
      const f = await assistantFixture(async (input) => {
        await input.read("consultar_saldos_cuentas", {});
        await input.delta("Respuesta parcial");
        controller.abort();
        await input.read("consultar_saldos_cuentas", {});
        return { complete: true };
      });
      try {
        const chat = await f.api.client().assistant.createConversation.mutate();
        const requestId = randomUUID();
        const spy = vi.spyOn(
          f.api.app.get(AccountsService),
          "getActiveForUser",
        );
        await f.api.app
          .get(AssistantService)
          .stream(
            f.userId,
            { conversationId: chat.id, requestId, text: "Consulta" },
            controller.signal,
            async () => {},
          );
        const saved = await f.api
          .client()
          .assistant.conversation.query({ id: chat.id });
        expect(saved.turns[0]).toMatchObject({
          status: "interrupted",
          text: "Respuesta parcial",
        });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(
          f.done((await f.send(chat.id, "Consulta", requestId)).events).status,
        ).toBe("interrupted");
        expect(f.runtime.run).toHaveBeenCalledTimes(1);
      } finally {
        await f.close();
      }
    });
  },
);

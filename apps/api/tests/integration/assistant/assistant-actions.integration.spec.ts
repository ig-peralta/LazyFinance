import { randomUUID } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AiSdkAssistantRuntime } from "../../../src/assistant/assistant-runtime";
import { FinancialReads } from "../../../src/assistant/financial-reads";
import { assistantFixture } from "../../fixtures/assistant";
import { integration } from "../../fixtures/persistence";

async function actionFixture(initial: unknown, complete = true) {
  let action = initial;
  const f = await assistantFixture(async (input) => {
    if (!input.propose) throw new Error("Missing proposal capability");
    await input.propose(action);
    await input.delta(
      "Preparé la propuesta. Falta tu aprobación en la tarjeta; todavía no se aplicó ningún cambio.",
    );
    return { complete };
  });
  const client = f.api.client(),
    chat = await client.assistant.createConversation.mutate();
  const propose = async (value = action) => {
    action = value;
    const turn = f.done(
      (await f.send(chat.id, "Prepara el cambio solicitado")).events,
    );
    const proposal = turn.actions[0];
    if (!proposal) throw new Error("Missing action card");
    return proposal;
  };
  return { ...f, client, chat, propose };
}

describe.skipIf(!integration)(
  "confirmed financial actions through real signed persistence",
  () => {
    it("prepares the requested comida tag in celeste through the SDK and saves it only after approval", async () => {
      let runtime: AiSdkAssistantRuntime | undefined;
      const f = await assistantFixture((input) => {
        if (!runtime) throw new Error("Missing controlled SDK runtime");
        return runtime.run(input);
      });
      try {
        type StreamResult = Awaited<
          ReturnType<MockLanguageModelV4["doStream"]>
        >;
        type Chunk =
          StreamResult["stream"] extends ReadableStream<infer T> ? T : never;
        let step = 0;
        const model = new MockLanguageModelV4({
          doStream: async (): Promise<StreamResult> => {
            const current = step++;
            const chunks: Chunk[] =
              current === 0
                ? [
                    {
                      type: "tool-call",
                      toolCallId: "catalog",
                      toolName: "list_tags",
                      input: "{}",
                    },
                  ]
                : current === 1
                  ? [
                      {
                        type: "tool-call",
                        toolCallId: "prepare",
                        toolName: "prepare_financial_action",
                        input: JSON.stringify({
                          action: {
                            kind: "create_tag",
                            tag: { name: "comida", color: "#87CEEB" },
                          },
                        }),
                      },
                    ]
                  : [
                      { type: "text-start", id: "answer" },
                      {
                        type: "text-delta",
                        id: "answer",
                        delta:
                          "Preparé comida en celeste. Revisa y aprueba la tarjeta para guardarla.",
                      },
                      { type: "text-end", id: "answer" },
                    ];
            return {
              stream: new ReadableStream<Chunk>({
                start(controller) {
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  for (const chunk of chunks) controller.enqueue(chunk);
                  controller.enqueue({
                    type: "finish",
                    finishReason: {
                      unified: current < 2 ? "tool-calls" : "stop",
                      raw: undefined,
                    },
                    usage: {
                      inputTokens: {
                        total: 20,
                        noCache: 20,
                        cacheRead: 0,
                        cacheWrite: 0,
                      },
                      outputTokens: { total: 10, text: 10, reasoning: 0 },
                    },
                  });
                  controller.close();
                },
              }),
            };
          },
        });
        runtime = new AiSdkAssistantRuntime(
          f.environment,
          f.api.app.get(FinancialReads).tools,
          async () => model,
        );
        const client = f.api.client(),
          chat = await client.assistant.createConversation.mutate();
        const turn = f.done(
          (await f.send(chat.id, "Crea una etiqueta comida en celeste")).events,
        );
        expect(turn.status).toBe("complete");
        expect(turn.sources[0]).toMatchObject({
          tool: "list_tags",
          status: "available",
          recordId: null,
          data: { tags: [] },
        });
        expect(turn.actions).toHaveLength(1);
        const action = turn.actions[0];
        expect(action).toMatchObject({
          status: "proposed",
          request: {
            kind: "create_tag",
            tag: { name: "comida", color: "#87CEEB" },
          },
        });
        expect(await client.tags.list.query()).toEqual([]);
        const receipt = await client.financialActions.approve.mutate({
          id: action.id,
          version: action.version,
        });
        expect(receipt.status).toBe("applied");
        expect(await client.tags.list.query()).toEqual([
          { id: receipt.results[0].id, name: "comida", color: "#87CEEB" },
        ]);
      } finally {
        await f.close();
      }
    });

    it("does not mutate finance during generation, approves an atomic tag/budget bundle once and preserves its receipt after chat deletion", async () => {
      const f = await actionFixture({
        kind: "create_budget",
        budget: {
          name: "Presupuesto desde chat",
          amount: "150000.00",
          newTags: [{ name: "Supermercado del chat" }],
          schedule: {
            period: "monthly",
            startDate: `${new Date().toISOString().slice(0, 7)}-01`,
          },
        },
      });
      try {
        const before = await f.client.objectives.list.query(),
          tags = await f.client.tags.list.query();
        const action = await f.propose();
        expect(action.status).toBe("proposed");
        expect(await f.client.objectives.list.query()).toEqual(before);
        expect(await f.client.tags.list.query()).toEqual(tags);
        const input = { id: action.id, version: action.version };
        const [first, repeated] = await Promise.all([
          f.client.financialActions.approve.mutate(input),
          f.client.financialActions.approve.mutate(input),
        ]);
        expect(first).toEqual(repeated);
        expect(first.status).toBe("applied");
        expect(first.results.at(-1)?.path).toMatch(/^\/presupuestos\//);
        expect((await f.client.objectives.list.query()).length).toBe(
          before.length + 1,
        );
        expect((await f.client.tags.list.query()).length).toBe(tags.length + 1);
        expect(
          (await f.client.assistant.conversation.query({ id: f.chat.id }))
            .turns[0].actions[0].status,
        ).toBe("applied");
        await f.client.assistant.deleteConversation.mutate({ id: f.chat.id });
        expect(
          (await f.client.financialActions.get.query({ id: action.id })).status,
        ).toBe("applied");
        expect(
          (await f.client.financialActions.approve.mutate(input)).status,
        ).toBe("applied");
        expect((await f.client.objectives.list.query()).length).toBe(
          before.length + 1,
        );
      } finally {
        await f.close();
      }
    });

    it("creates measured-target definitions without synthesizing savings or moving money", async () => {
      const f = await actionFixture({
        kind: "create_savings_goal",
        goal: {
          name: "Fondo del chat",
          amount: "1000000.00",
          newTags: [{ name: "Ahorro del chat" }],
          schedule: { period: "lifetime" },
        },
      });
      try {
        const accounts = await f.client.accounts.list.query(),
          action = await f.propose();
        const applied = await f.client.financialActions.approve.mutate({
          id: action.id,
          version: 1,
        });
        const id = applied.results.at(-1)?.id;
        if (!id) throw new Error("Missing goal result");
        expect(
          await f.client.objectives.savingsProgress.query({ id }),
        ).toMatchObject({ netContributions: "0.00" });
        expect(await f.client.accounts.list.query()).toEqual(accounts);
      } finally {
        await f.close();
      }
    });

    it("invalidates old approval versions after editing and cancels without a financial mutation", async () => {
      const f = await actionFixture({
        kind: "create_tag",
        tag: { name: "Primera propuesta" },
      });
      try {
        const action = await f.propose();
        const revised = await f.client.financialActions.revise.mutate({
          id: action.id,
          version: 1,
          action: { kind: "create_tag", tag: { name: "Versión revisada" } },
        });
        expect(revised.version).toBe(2);
        await expect(
          f.client.financialActions.approve.mutate({
            id: action.id,
            version: 1,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        expect(
          (
            await f.client.financialActions.cancel.mutate({
              id: action.id,
              version: 2,
            })
          ).status,
        ).toBe("cancelled");
        expect(
          (
            await f.client.financialActions.approve.mutate({
              id: action.id,
              version: 2,
            })
          ).status,
        ).toBe("cancelled");
        expect(await f.client.tags.list.query()).toEqual([]);
      } finally {
        await f.close();
      }
    });

    it("rejects foreign owners and cannot approve a failed, expired or deleted-conversation proposal", async () => {
      const failed = await actionFixture(
        { kind: "create_tag", tag: { name: "No aplicar" } },
        false,
      );
      try {
        const action = await failed.propose();
        await expect(
          failed.client.financialActions.approve.mutate({
            id: action.id,
            version: 1,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await expect(
          failed.api
            .client(failed.otherToken)
            .financialActions.get.query({ id: action.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        await expect(
          failed.api
            .client(failed.otherToken)
            .financialActions.approve.mutate({ id: action.id, version: 1 }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      } finally {
        await failed.close();
      }
      const f = await actionFixture({
        kind: "create_tag",
        tag: { name: "No aplicar" },
      });
      try {
        const action = await f.propose();
        await f.db.pool.query(
          "UPDATE assistant.action SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",
          [action.id],
        );
        expect(
          (
            await f.client.financialActions.approve.mutate({
              id: action.id,
              version: 1,
            })
          ).status,
        ).toBe("expired");
        const revised = await f.client.financialActions.revise.mutate({
          id: action.id,
          version: 1,
          action: action.request,
        });
        expect(revised.version).toBe(2);
        await f.client.assistant.deleteConversation.mutate({ id: f.chat.id });
        await expect(
          f.client.financialActions.approve.mutate({
            id: action.id,
            version: 2,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(await f.client.tags.list.query()).toEqual([]);
      } finally {
        await f.close();
      }
    });

    it("detects changed tag/decision facts, requires a new preview, and preserves later manual decisions", async () => {
      const f = await actionFixture({
        kind: "create_tag",
        tag: { name: "unused" },
      });
      try {
        const tag = await f.client.tags.create.mutate({ name: "Original" });
        const action = await f.propose({
          kind: "update_tag",
          tag: { id: tag.id, name: "Desde el chat" },
        });
        await f.client.tags.update.mutate({
          id: tag.id,
          name: "Cambio más reciente",
        });
        expect(
          (
            await f.client.financialActions.approve.mutate({
              id: action.id,
              version: 1,
            })
          ).status,
        ).toBe("stale");
        expect((await f.client.tags.list.query())[0].name).toBe(
          "Cambio más reciente",
        );
        const movement = await f.db.insert("transaction", {
          accountId: f.accountId,
          amount: "-12000.00",
          type: "debit",
          bookedAt: "2026-09-15T15:00:00Z",
          isInternalMovement: false,
        });
        const proposal = await f.propose({
          kind: "tag_movement",
          transactionId: movement.id,
          tagId: tag.id,
        });
        await f.client.tags.decide.mutate({
          transactionId: movement.id,
          tagId: null,
        });
        expect(
          (
            await f.client.financialActions.approve.mutate({
              id: proposal.id,
              version: 1,
            })
          ).status,
        ).toBe("stale");
        expect(
          await f.client.transactions.detail.query({ id: movement.id }),
        ).toMatchObject({ tag: null, tagDecisionOrigin: "manual" });
        const revised = await f.client.financialActions.revise.mutate({
          id: proposal.id,
          version: 1,
          action: proposal.request,
        });
        expect(
          (
            await f.client.financialActions.approve.mutate({
              id: revised.id,
              version: revised.version,
            })
          ).status,
        ).toBe("applied");
        expect(
          await f.client.transactions.detail.query({ id: movement.id }),
        ).toMatchObject({
          tag: { id: tag.id },
          tagDecisionOrigin: "manual",
          amount: "-12000.00",
        });
        const archived = await f.propose({ kind: "archive_tag", id: tag.id });
        await f.client.financialActions.approve.mutate({
          id: archived.id,
          version: 1,
        });
        expect(await f.client.tags.list.query()).toEqual([]);
        expect(
          (await f.client.transactions.detail.query({ id: movement.id })).tag
            ?.id,
        ).toBe(tag.id);
      } finally {
        await f.close();
      }
    });

    it("rolls back dependent new tags, financial writes and the execution receipt together on a database failure", async () => {
      const name = `Rollback ${randomUUID()}`;
      const f = await actionFixture({
        kind: "create_savings_goal",
        goal: {
          name,
          amount: "1000",
          newTags: [{ name: "Atomic rollback tag" }],
          schedule: { period: "lifetime" },
        },
      });
      try {
        const action = await f.propose();
        await f.db.pool.query(
          `CREATE FUNCTION assistant.reject_fixture_goal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='${name}' THEN RAISE EXCEPTION 'fixture rejection'; END IF; RETURN NEW; END $$`,
        );
        await f.db.pool.query(
          "CREATE TRIGGER reject_fixture_goal BEFORE INSERT ON finance.objective FOR EACH ROW EXECUTE FUNCTION assistant.reject_fixture_goal()",
        );
        await expect(
          f.client.financialActions.approve.mutate({
            id: action.id,
            version: 1,
          }),
        ).rejects.toThrow();
        expect(await f.client.tags.list.query()).toEqual([]);
        expect(await f.client.objectives.list.query()).toEqual([]);
        expect(
          (await f.client.financialActions.get.query({ id: action.id })).status,
        ).toBe("proposed");
      } finally {
        await f.db.pool.query(
          "DROP TRIGGER IF EXISTS reject_fixture_goal ON finance.objective",
        );
        await f.db.pool.query(
          "DROP FUNCTION IF EXISTS assistant.reject_fixture_goal()",
        );
        await f.close();
      }
    });
  },
);

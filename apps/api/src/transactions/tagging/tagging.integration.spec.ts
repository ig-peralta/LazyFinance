import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Fixture,
  fixture,
  integration,
  startApi,
} from "../../../test/persistence";
import {
  correctionPage,
  initialPage,
} from "../../banking/connector/fixtures/normalized-pages";
import type { ConnectorPage } from "../../banking/connector/normalized-banking.schema";
import { BankingIngestionService } from "../../banking/ingestion/banking-ingestion.service";
import { TaggingService } from "./tagging.service";

async function withUsers(
  work: (
    f: Fixture & {
      movementId: string;
      otherMovementId: string;
      tagging: TaggingService;
      ingestion: BankingIngestionService;
    },
  ) => Promise<void>,
) {
  const f = await fixture(true),
    movementId = randomUUID(),
    otherMovementId = randomUUID();
  try {
    for (const [id, accountId] of [
      [movementId, f.accountId],
      [otherMovementId, f.otherAccountId],
    ])
      await f.db.insert("transaction", {
        id,
        accountId,
        type: "debit",
        amount: "-25.00",
        bookedAt: new Date("2026-10-12T16:00:00Z"),
        merchant: "  The   Market ",
        description: "Groceries",
        isInternalMovement: false,
      });
    await work({
      ...f,
      movementId,
      otherMovementId,
      tagging: new TaggingService(f.persistence),
      ingestion: new BankingIngestionService(f.persistence),
    });
  } finally {
    await f.db.close();
  }
}

describe.skipIf(!integration)(
  "API tag matching and atomic persistence decisions",
  () => {
    it("supports manual/no-tag/reset decisions via public tRPC, rejects foreign ownership and audits once", async () => {
      await withUsers(async (f) => {
        const { app, client } = await startApi(f);
        try {
          const own = client(),
            other = client(f.otherToken);
          const tag = await own.tags.create.mutate({
            name: "Comida",
            color: "#abc123",
          });
          expect(await own.tags.create.mutate({ name: "Comida" })).toEqual(tag);
          const foreign = await other.tags.create.mutate({ name: "Other" });
          await expect(
            own.tags.decide.mutate({
              transactionId: f.movementId,
              tagId: foreign.id,
            }),
          ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
          await expect(
            own.tags.decide.mutate({
              transactionId: f.otherMovementId,
              tagId: tag.id,
            }),
          ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
          expect(
            await own.tags.decide.mutate({
              transactionId: f.movementId,
              tagId: tag.id,
            }),
          ).toMatchObject({ tagId: tag.id, origin: "manual" });
          await own.tags.decide.mutate({
            transactionId: f.movementId,
            tagId: tag.id,
          });
          expect(
            await own.tags.decide.mutate({
              transactionId: f.movementId,
              tagId: null,
            }),
          ).toMatchObject({ tagId: null, origin: "manual" });
          expect(
            await own.tags.reset.mutate({ id: f.movementId }),
          ).toMatchObject({ origin: "unreviewed" });
          const rule = await own.tagRules.create.mutate({
            tagId: tag.id,
            direction: "debit",
            matchField: "merchant",
            matchValue: "The Market",
          });
          expect(
            await own.tags.suggestions.query({ id: f.movementId }),
          ).toMatchObject([
            { ruleId: rule.id, confidence: "high", autoApply: false },
          ]);
          await own.tagRules.replace.mutate({
            id: rule.id,
            rule: {
              tagId: tag.id,
              direction: "debit",
              matchField: "merchant",
              matchValue: "The Market",
              autoApply: true,
            },
          });
          expect(await own.tagRules.apply.mutate({ id: rule.id })).toEqual({
            changed: 1,
            nextCursor: null,
          });
          await own.tagRules.archive.mutate({ id: rule.id });
          expect(
            (
              await f.db.rows("tag_decision_event", {
                transactionId: f.movementId,
              })
            ).map((row) => row.kind),
          ).toEqual(["manual_tag", "manual_no_tag", "reset", "rule_applied"]);
          expect(
            await f.db.rows("tag_decision_event", {
              transactionId: f.otherMovementId,
            }),
          ).toEqual([]);
        } finally {
          await app.close();
        }
      });
    });
    it("keeps suggestions separate, normalizes matches, requires explicit approval and preserves uncertainty/manual choices", async () => {
      await withUsers(async (f) => {
        const food = await f.tagging.createTagForUser(f.userId, {
          name: "Food",
        });
        const input = {
          tagId: food.id,
          direction: "debit",
          matchField: "merchant",
          matchValue: " the market ",
          accountId: f.accountId,
          priority: 10,
        };
        await expect(
          f.tagging.createRuleForUser(f.userId, {
            ...input,
            matchField: "description",
            autoApply: true,
          }),
        ).rejects.toThrow("Invalid tag input");
        const rule = await f.tagging.createRuleForUser(f.userId, input);
        expect(rule).toMatchObject({
          matchValue: "the market",
          mode: "suggest",
          approvedAt: null,
        });
        expect((await f.tagging.createRuleForUser(f.userId, input)).id).toBe(
          rule.id,
        );
        expect(
          await f.tagging.suggestionsForUser(f.userId, f.movementId),
        ).toMatchObject([{ ruleId: rule.id, autoApply: false }]);
        expect(
          (await f.db.rows("transaction", { id: f.movementId }))[0].tag_id,
        ).toBeNull();
        await f.tagging.assignManualTagForUser(f.userId, f.movementId, {
          tagId: null,
        });
        expect(
          await f.tagging.suggestionsForUser(f.userId, f.movementId),
        ).toEqual([]);
        await f.tagging.resetTagDecisionForUser(f.userId, f.movementId);
        expect(
          await f.tagging.createRuleForUser(f.userId, {
            ...input,
            autoApply: true,
          }),
        ).toMatchObject({ id: rule.id, mode: "auto" });
        expect(
          (await f.db.rows("transaction", { id: f.movementId }))[0].tag_id,
        ).toBeNull();
        expect(
          await f.tagging.applyApprovedRuleToExistingForUser(f.userId, rule.id),
        ).toEqual({ changed: 1, nextCursor: null });
        expect(
          await f.tagging.applyApprovedRuleToExistingForUser(f.userId, rule.id),
        ).toEqual({ changed: 0, nextCursor: null });
        await f.tagging.assignManualTagForUser(f.userId, f.movementId, {
          tagId: null,
        });
        const uncertain = await f.db.insert("transaction", {
          accountId: f.accountId,
          type: "debit",
          amount: "-10.00",
          bookedAt: new Date(),
          merchant: "THE MARKET",
          isInternalMovement: null,
        });
        expect(
          await f.tagging.applyApprovedRuleToExistingForUser(f.userId, rule.id),
        ).toEqual({ changed: 0, nextCursor: null });
        expect(
          await f.tagging.suggestionsForUser(f.userId, uncertain.id),
        ).toMatchObject([{ tagId: food.id, autoApply: false }]);
      });
    });
    it("auto-tags approved imports once, revalidates corrections and preserves manual no-tag", async () => {
      await withUsers(async (f) => {
        const tag = await f.tagging.createTagForUser(f.userId, {
          name: "Purchases",
        });
        const rule = await f.tagging.createRuleForUser(f.userId, {
          tagId: tag.id,
          direction: "debit",
          matchField: "merchant",
          matchValue: "Shop",
          autoApply: true,
        });
        const sync = (page: ConnectorPage = initialPage) =>
          f.ingestion.syncForUser(f.userId, f.connectionId, {
            provider: "fixture-bank",
            fetchPage: async () => page,
          });
        await sync();
        const card = (
          await f.db.rows("account", {
            providerConnectionId: f.connectionId,
            externalId: "card-1",
          })
        )[0];
        const purchase = (
          await f.db.rows("transaction", {
            accountId: card.id,
            externalId: "card-purchase-1",
          })
        )[0];
        expect(purchase).toMatchObject({
          tag_id: tag.id,
          tag_decision_origin: "rule",
          tag_rule_id: rule.id,
        });
        await sync();
        expect(
          await f.db.rows("tag_decision_event", { transactionId: purchase.id }),
        ).toHaveLength(1);
        await sync({
          ...initialPage,
          observedAt: "2026-10-20T18:00:00.000Z",
          accounts: [],
          movements: [{ ...initialPage.movements[4], merchant: "New Shop" }],
        });
        expect(
          (await f.db.rows("transaction", { id: purchase.id }))[0],
        ).toMatchObject({ tag_id: null, tag_decision_origin: "unreviewed" });
        expect(
          (
            await f.db.rows("tag_decision_event", {
              transactionId: purchase.id,
            })
          ).map((row) => row.kind),
        ).toEqual(["rule_applied", "rule_revalidated"]);
        await f.tagging.assignManualTagForUser(f.userId, purchase.id, {
          tagId: null,
        });
        await sync({
          ...initialPage,
          observedAt: "2026-10-21T18:00:00.000Z",
          accounts: [],
          movements: [initialPage.movements[4]],
        });
        expect(
          (await f.db.rows("transaction", { id: purchase.id }))[0],
        ).toMatchObject({ tag_id: null, tag_decision_origin: "manual" });
      });
    });
    it("keeps historical rule tags through rule changes until a provider correction revalidates them", async () => {
      await withUsers(async (f) => {
        const first = await f.tagging.createTagForUser(f.userId, {
            name: "First",
          }),
          second = await f.tagging.createTagForUser(f.userId, {
            name: "Second",
          });
        const input = {
          tagId: first.id,
          direction: "debit",
          matchField: "merchant",
          matchValue: "Market",
          autoApply: true,
        };
        const rule = await f.tagging.createRuleForUser(f.userId, input);
        const sync = (page: ConnectorPage = initialPage) =>
          f.ingestion.syncForUser(f.userId, f.connectionId, {
            provider: "fixture-bank",
            fetchPage: async () => page,
          });
        await sync();
        const checking = (
          await f.db.rows("account", {
            providerConnectionId: f.connectionId,
            externalId: "checking-1",
          })
        )[0];
        const grocery = (
          await f.db.rows("transaction", {
            accountId: checking.id,
            externalId: "grocery-1",
          })
        )[0];
        await f.tagging.replaceRuleForUser(f.userId, rule.id, {
          ...input,
          tagId: second.id,
        });
        expect(
          (await f.db.rows("transaction", { id: grocery.id }))[0].tag_id,
        ).toBe(first.id);
        await sync(correctionPage);
        expect(
          (await f.db.rows("transaction", { id: grocery.id }))[0].tag_id,
        ).toBe(second.id);
        await f.tagging.archiveRuleForUser(f.userId, rule.id);
        await sync({
          ...correctionPage,
          observedAt: "2026-10-18T18:00:00.000Z",
        });
        expect(
          (await f.db.rows("transaction", { id: grocery.id }))[0].tag_id,
        ).toBe(second.id);
        await sync({
          ...correctionPage,
          observedAt: "2026-10-19T18:00:00.000Z",
          accounts: [],
          movements: [
            {
              ...correctionPage.movements[0],
              merchant: "Another Market",
              amount: "-121.00",
            },
          ],
        });
        expect(
          (await f.db.rows("transaction", { id: grocery.id }))[0],
        ).toMatchObject({ tag_id: null, tag_decision_origin: "unreviewed" });
        expect(
          (
            await f.db.rows("tag_decision_event", { transactionId: grocery.id })
          ).map((row) => row.kind),
        ).toEqual(["rule_applied", "rule_revalidated", "rule_revalidated"]);
      });
    });
  },
);

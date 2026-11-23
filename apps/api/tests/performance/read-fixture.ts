import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { fromCents } from "../../src/utils/money";
import { previousMonth } from "../../src/utils/period";
import { santiagoMonth } from "../../src/utils/santiago-time";
import { fixture, startApi } from "../fixtures/persistence";

export const ownerCount = 8;
export const movementsPerOwner = 12_000;
export const profiles = ["uniform", "representative"] as const;
export type ReadProfile = (typeof profiles)[number];

export async function readFixture(profile: ReadProfile) {
  const f = await fixture();
  const month = previousMonth(santiagoMonth(new Date()));
  const months = [month];
  for (let i = 1; i < 6; i++) months.push(previousMonth(months[i - 1]));
  const identities = [
    { userId: f.userId, token: f.token, connectionId: f.connectionId },
    {
      userId: f.otherUserId,
      token: f.otherToken,
      connectionId: f.otherConnectionId,
    },
  ];
  const provider = (
    await f.db.rows("provider", { identifier: "fixture-bank" })
  )[0];
  for (let i = identities.length; i < ownerCount; i++) {
    const identity = {
      userId: randomUUID(),
      token: randomUUID(),
      connectionId: randomUUID(),
    };
    await f.db.insert("user", {
      id: identity.userId,
      email: `${identity.userId}@example.test`,
      name: `Synthetic owner ${i + 1}`,
    });
    await f.db.insert("external_identity", {
      provider: "mock",
      issuer: "https://mock.lazyfinance.cl",
      providerSubject: identity.token,
      userId: identity.userId,
    });
    await f.db.insert("provider_connection", {
      id: identity.connectionId,
      userId: identity.userId,
      providerId: provider.id,
      mode: "test",
    });
    identities.push(identity);
  }
  const api = await startApi(f, false, undefined, 0, undefined, {
    principals: Object.fromEntries(
      identities.map((owner, index) => [
        owner.token,
        {
          userId: owner.userId,
          email: `${owner.userId}@example.test`,
          name: `Synthetic owner ${index + 1}`,
        },
      ]),
    ),
  });
  const callers = [];
  for (const [ownerIndex, owner] of identities.entries()) {
    const prefix = `${profile}-owner-${ownerIndex + 1}`;
    const accountIds: string[] = [];
    for (const type of profile === "uniform"
      ? ["checking" as const]
      : (["checking", "savings", "credit_card"] as const)) {
      const account = await f.db.insert("account", {
        userId: owner.userId,
        providerConnectionId: owner.connectionId,
        type,
        alias: `${prefix}-${type}`,
        balance: type === "credit_card" ? "-250000.00" : "500000.00",
      });
      accountIds.push(account.id);
    }
    const tagIds: string[] = [];
    for (const name of profile === "uniform"
      ? ["Purchases"]
      : ["Food", "Transport", "Home", "Leisure"]) {
      const tag = await f.db.insert("tag", {
        userId: owner.userId,
        name: `${prefix}-${name}`,
        color: "#4f8d9c",
      });
      tagIds.push(tag.id);
    }
    const budgets: { id: string; tagIds: string[]; spent: bigint }[] = [];
    for (const selected of profile === "uniform"
      ? [tagIds]
      : [tagIds.slice(0, 2), tagIds.slice(2, 3), tagIds.slice(3)]) {
      const budget = await f.db.insert("objective", {
        userId: owner.userId,
        name: `${prefix}-budget-${budgets.length + 1}`,
        amount: "900000.00",
        kind: "time_based",
        intent: "spending",
        isRecurring: true,
        period: "monthly",
        startDate: `${months.at(-1)}-01T03:00:00.000Z`,
      });
      const revision = await f.db.insert("budget_revision", {
        objectiveId: budget.id,
        version: 1,
        name: budget.name,
        amount: budget.amount,
        kind: "time_based",
        isRecurring: true,
        period: "monthly",
        startDate: budget.start_date,
        effectiveFrom: `${months.at(-1)}-01T03:00:00.000Z`,
      });
      for (const tagId of selected)
        await f.db.insert("budget_revision_tag", {
          revisionId: revision.id,
          tagId,
        });
      budgets.push({ id: budget.id, tagIds: selected, spent: 0n });
    }
    let gross = 0n,
      recovery = 0n,
      income = 0n;
    const rows = Array.from({ length: movementsPerOwner }, (_, i) => {
      const kind = profile === "uniform" ? 8 : i % 20;
      const selectedMonth =
        profile === "uniform"
          ? month
          : months[Math.floor(i / 20) % months.length];
      const day =
        profile === "uniform"
          ? "15"
          : String(1 + (Math.floor(i / 120) % 28)).padStart(2, "0");
      const credit = [0, 1, 3, 7].includes(kind);
      const amount =
        profile === "uniform"
          ? BigInt((100 + ownerIndex * 10) * 100)
          : [2, 3].includes(kind)
            ? 250000n
            : [1, 7].includes(kind)
              ? 7500n
              : BigInt((100 + ((i * 137 + ownerIndex * 73) % 25000)) * 100);
      const tagId =
        profile === "uniform"
          ? i % 2 === 0
            ? tagIds[0]
            : null
          : i % 5 === 0
            ? null
            : tagIds[(Math.floor(i / 120) + i) % tagIds.length];
      const eligible = !credit && ![2, 4, 5, 6].includes(kind);
      if (selectedMonth === month && eligible) {
        gross += amount;
        for (const budget of budgets)
          if (tagId && budget.tagIds.includes(tagId)) budget.spent += amount;
      }
      if (selectedMonth === month && kind === 0) income += amount;
      return {
        id: randomUUID(),
        account_id: accountIds[i % accountIds.length],
        tag_id: tagId,
        booked_at:
          profile === "uniform"
            ? `${month}-15T12:00:00.000Z`
            : `${selectedMonth}-${day}T${credit ? "18" : "10"}:${String(i % 60).padStart(2, "0")}:00.000Z`,
        amount: fromCents(credit ? amount : -amount),
        type: credit ? "credit" : "debit",
        merchant: `${prefix}-merchant-${i % 17}`,
        description: `${prefix}-purchase-${i}`,
        is_internal_movement: kind === 6 ? null : [2, 3].includes(kind),
        tag_decision_origin: tagId ? "manual" : "unreviewed",
        review_status: kind === 4 ? "needs_review" : "clear",
        removed_at: kind === 5 ? new Date().toISOString() : null,
        removal_reason: kind === 5 ? "removed" : null,
      };
    });
    await f.db.pool.query(
      `INSERT INTO finance.transaction
      (id,account_id,tag_id,booked_at,amount,type,merchant,description,is_internal_movement,tag_decision_origin,review_status,removed_at,removal_reason)
      SELECT id,account_id,tag_id,booked_at,amount,type::finance.transaction_type,merchant,description,is_internal_movement,tag_decision_origin::finance.tag_decision_origin,review_status::finance.movement_review_status,removed_at,removal_reason::finance.movement_removal_reason
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,account_id uuid,tag_id uuid,booked_at timestamptz,amount numeric,type text,merchant text,description text,is_internal_movement boolean,tag_decision_origin text,review_status text,removed_at timestamptz,removal_reason text)`,
      [JSON.stringify(rows)],
    );
    if (profile === "representative") {
      const source = await f.db.insert("income_source", {
        userId: owner.userId,
        name: `${prefix}-income`,
        regularity: "irregular",
        amountKind: "variable",
        startDate: `${months.at(-1)}-01`,
      });
      await f.db.pool.query(
        `INSERT INTO finance.income_receipt(transaction_id,source_id)
        SELECT id,$2::uuid FROM jsonb_array_elements_text($1::jsonb) AS x(id_text)
        CROSS JOIN LATERAL (SELECT id_text::uuid AS id) s`,
        [
          JSON.stringify(
            rows.filter((_, i) => i % 20 === 0).map((row) => row.id),
          ),
          source.id,
        ],
      );
      const adjustments = [];
      for (let i = 0; i < rows.length; i += 20) {
        for (const [creditIndex, purchaseIndex, kind] of [
          [1, 8, "refund"],
          [7, 9, "reimbursement"],
        ] as const) {
          const purchase = rows[i + purchaseIndex],
            credit = rows[i + creditIndex];
          adjustments.push({
            credit_transaction_id: credit.id,
            purchase_transaction_id: purchase.id,
            kind,
            amount: "50.00",
            credit_amount: credit.amount,
            purchase_amount: purchase.amount,
            credit_booked_at: credit.booked_at,
            purchase_booked_at: purchase.booked_at,
          });
          if (purchase.booked_at.startsWith(month)) {
            recovery += 5000n;
            for (const budget of budgets)
              if (purchase.tag_id && budget.tagIds.includes(purchase.tag_id))
                budget.spent -= 5000n;
          }
        }
      }
      await f.db.pool.query(
        `INSERT INTO finance.expense_adjustment(credit_transaction_id,purchase_transaction_id,kind,amount,credit_amount,purchase_amount,credit_booked_at,purchase_booked_at)
        SELECT credit_transaction_id,purchase_transaction_id,kind,amount,credit_amount,purchase_amount,credit_booked_at,purchase_booked_at
        FROM jsonb_to_recordset($1::jsonb) AS x(credit_transaction_id uuid,purchase_transaction_id uuid,kind text,amount numeric,credit_amount numeric,purchase_amount numeric,credit_booked_at timestamptz,purchase_booked_at timestamptz)`,
        [JSON.stringify(adjustments)],
      );
    }
    const client = api.client(owner.token);
    const requests = {
      "accounts.list": async () => {
        const result = await client.accounts.list.query();
        expect(result.map((item) => item.id).sort()).toEqual(
          [...accountIds].sort(),
        );
      },
      "transactions.recent": async () => {
        const result = await client.transactions.recent.query();
        expect(result).toHaveLength(10);
        expect(result.every((item) => item.merchant?.startsWith(prefix))).toBe(
          true,
        );
      },
      "summaries.monthly": async () => {
        expect(await client.summaries.monthly.query({ month })).toMatchObject({
          spending: fromCents(gross - recovery),
          grossSpending: fromCents(gross),
          receivedIncome: fromCents(income),
        });
      },
      "objectives.progress": async () => {
        const result = await client.objectives.progress.query({ month });
        expect(result.map((item) => item.id).sort()).toEqual(
          budgets.map((item) => item.id).sort(),
        );
        for (const budget of budgets)
          expect(result.find((item) => item.id === budget.id)).toMatchObject({
            spent: fromCents(budget.spent),
          });
      },
    };
    callers.push({ owner: ownerIndex + 1, userId: owner.userId, requests });
  }
  // Fresh bulk data must have planner statistics before the measured windows.
  for (const table of [
    "transaction",
    "account",
    "tag",
    "objective",
    "budget_revision",
    "budget_revision_tag",
    "expense_adjustment",
    "income_receipt",
    "income_source",
  ])
    await f.db.pool.query(`ANALYZE finance.${table}`);
  return {
    f,
    api,
    callers,
    dataset: {
      profile,
      version: 2,
      owners: ownerCount,
      authenticatedOwners: ownerCount,
      accountsPerOwner: profile === "uniform" ? 1 : 3,
      movementsPerOwner,
      totalMovements: ownerCount * movementsPerOwner,
      reportMonth: month,
      historyMonths: profile === "uniform" ? 1 : 6,
      tagsPerOwner: profile === "uniform" ? 1 : 4,
      budgetsPerOwner: profile === "uniform" ? 1 : 3,
      expenseAdjustmentsPerOwner: profile === "uniform" ? 0 : 1200,
      incomeReceiptsPerOwner: profile === "uniform" ? 0 : 600,
      description:
        profile === "uniform"
          ? "Uniform expense baseline; same booking instant and owner-specific amount, half tagged."
          : "Checking, savings and card history; varied dates/amounts/merchants, tagged and untagged purchases, income receipts, refunds/reimbursements, internal, unresolved and removed movements.",
      origin:
        "Synthetic owner-only bulk SQL; setup and ANALYZE excluded from timed windows",
      ownerIds: identities.map((owner) => owner.userId),
    },
  };
}

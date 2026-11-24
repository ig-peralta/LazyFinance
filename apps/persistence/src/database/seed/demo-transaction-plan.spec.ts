import { describe, expect, it } from "vitest";
import { mainExternalId } from "./demo-bank-source";
import { planDemoTransaction } from "./demo-transaction-plan";
import { clp } from "./helpers";

const balances = {
  checking: "450000.00",
  savings: "300000.00",
  creditCard: "-120000.00",
};

type Activity = Parameters<typeof planDemoTransaction>[2][number];
type Plan = ReturnType<typeof planDemoTransaction>;

function record(activity: Activity[], plan: Plan) {
  for (const [index, movement] of plan.movements.entries()) {
    activity.push({
      accountExternalId: mainExternalId(movement.account),
      amount: clp(movement.amount),
      merchant: movement.merchant,
      relatedMovement: plan.pairKind
        ? {
            accountExternalId: mainExternalId(
              plan.movements[1 - index].account,
            ),
            externalId: "other-leg",
            kind: plan.pairKind,
          }
        : null,
    });
  }
}

const first = () => 0;
const last = (count: number) => count - 1;

describe("demo transaction planner", () => {
  it("rotates the three external groups and avoids the same merchant on each group's next visit", () => {
    const activity: Activity[] = [];
    const plans = Array.from({ length: 6 }, () => {
      const plan = planDemoTransaction("external", balances, activity, first);
      record(activity, plan);
      return plan;
    });
    const [cash, card, credit, nextCash, nextCard, nextCredit] = plans.map(
      (plan) => {
        expect(plan.pairKind).toBeNull();
        expect(plan.movements).toHaveLength(1);
        const [movement] = plan.movements;
        expect(plan.amount).toBe(clp(Math.abs(movement.amount)));
        return movement;
      },
    );

    for (const [debit, purchase, deposit] of [
      [cash, card, credit],
      [nextCash, nextCard, nextCredit],
    ]) {
      expect(debit.account).toBe("checking");
      expect(purchase.account).toBe("creditCard");
      expect(deposit.account).toBe("checking");
      expect(debit.amount).toBeLessThan(0);
      expect(purchase.amount).toBeLessThan(0);
      expect(deposit.amount).toBeGreaterThan(0);
    }
    expect(new Set(plans.map((plan) => plan.movements[0].merchant)).size).toBe(
      6,
    );
  });

  it("skips unaffordable checking debits and caps them to whole available pesos", () => {
    const low = { ...balances, checking: "1499.99" };
    const activity: Activity[] = [];
    const card = planDemoTransaction("external", low, activity, last);
    record(activity, card);
    expect(card.movements[0]).toMatchObject({ account: "creditCard" });
    const credit = planDemoTransaction("external", low, activity, last);
    record(activity, credit);
    expect(credit.movements[0].amount).toBeGreaterThan(0);

    const funded = planDemoTransaction(
      "external",
      { ...balances, checking: "1500.99" },
      activity,
      last,
    );
    expect(funded.movements[0]).toMatchObject({
      account: "checking",
      amount: -1_500,
    });
  });

  it("rotates paired savings transfers and card payments independently of external activity", () => {
    const activity: Activity[] = [];
    for (const [from, to, pairKind] of [
      ["checking", "savings", "transfer_pair"],
      ["savings", "checking", "transfer_pair"],
      ["checking", "creditCard", "card_payment_pair"],
      ["checking", "savings", "transfer_pair"],
    ]) {
      const plan = planDemoTransaction("internal", balances, activity, last);
      expect(plan.pairKind).toBe(pairKind);
      expect(plan.movements).toHaveLength(2);
      const [debit, credit] = plan.movements;
      expect(debit.account).toBe(from);
      expect(credit?.account).toBe(to);
      expect(debit.amount).toBe(-Number(credit?.amount));
      expect(credit?.amount).toBeGreaterThan(0);
      expect(plan.amount).toBe(clp(-debit.amount));
      record(activity, plan);
      record(
        activity,
        planDemoTransaction("external", balances, activity, first),
      );
    }
  });

  it.each([
    ["3250.99", "-4900.75", 3_250],
    ["9000.99", "-3250.75", 3_250],
  ])("caps a small card payment at cash %s and card balance %s", (checking, creditCard, amount) => {
    const plan = planDemoTransaction(
      "internal",
      { checking, savings: "0.00", creditCard },
      [],
      last,
    );
    expect(plan.pairKind).toBe("card_payment_pair");
    expect(plan.movements).toMatchObject([
      { account: "checking", amount: -amount },
      { account: "creditCard", amount },
    ]);
  });

  it.each([
    "0.00",
    "100.00",
    "-0.99",
  ])("does not create a card payment for balance %s", (creditCard) => {
    const cash = { ...balances, creditCard };
    const activity: Activity[] = [];
    record(activity, planDemoTransaction("internal", cash, activity, last));
    record(activity, planDemoTransaction("internal", cash, activity, last));
    expect(planDemoTransaction("internal", cash, activity, last).pairKind).toBe(
      "transfer_pair",
    );
    expect(() =>
      planDemoTransaction(
        "internal",
        { ...cash, checking: "24999.99", savings: "0.00" },
        [],
        last,
      ),
    ).toThrow("Insufficient demo funds");
  });

  it("limits savings withdrawals to available savings", () => {
    const plan = planDemoTransaction(
      "internal",
      { ...balances, checking: "0.00", savings: "31000.99" },
      [],
      last,
    );
    expect(plan.movements).toMatchObject([
      { account: "savings", amount: -30_000 },
      { account: "checking", amount: 30_000 },
    ]);
  });
});

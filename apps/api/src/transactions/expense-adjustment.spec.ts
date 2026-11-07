import {
  ExpenseAdjustmentPairSchema,
  ExpenseAdjustmentsInputSchema,
  SetExpenseAdjustmentSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { TransactionsService } from "./transactions.service";

const purchaseTransactionId = "00000000-0000-4000-8000-000000000011";
const creditTransactionId = "00000000-0000-4000-8000-000000000012";
const pair = { creditTransactionId, purchaseTransactionId };
const input = { ...pair, amount: "30.01", kind: "refund" };

describe("expense adjustment contract and command preparation", () => {
  it("requires exact positive money, distinct owned selections and an explicit supported kind", () => {
    expect(SetExpenseAdjustmentSchema.parse(input)).toEqual(input);
    for (const patch of [
      { amount: "0" },
      { amount: "0.00" },
      { amount: "-1" },
      { amount: "1.001" },
      { amount: "01.00" },
      { amount: 1 },
      { amount: "10000000000000" },
      { creditTransactionId: purchaseTransactionId },
      { kind: "income" },
      { userId: purchaseTransactionId },
      { confirmedAt: "2026-01-01T00:00:00Z" },
    ])
      expect(
        SetExpenseAdjustmentSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    expect(ExpenseAdjustmentPairSchema.safeParse(pair).success).toBe(true);
    expect(
      ExpenseAdjustmentsInputSchema.parse({
        transactionId: creditTransactionId,
      }),
    ).toEqual({ transactionId: creditTransactionId, limit: 25 });
  });

  it("canonicalizes cents, keeps authenticated scope and does not replay ambiguous mutations", async () => {
    type Client = RpcStubs<
      ReturnType<PersistenceClient["user"]>["transactions"]
    >;
    const mutate = vi.fn<Client["setExpenseAdjustment"]["mutate"]>();
    mutate.mockRejectedValue(new Error("connection lost"));
    const user = vi.fn((_userId: string) => ({
      transactions: { setExpenseAdjustment: { mutate } },
    }));
    const service = new TransactionsService({
      user,
    } as unknown as PersistenceClient);
    await expect(
      service.setExpenseAdjustmentForUser("owner", {
        ...input,
        amount: "30.1",
      }),
    ).rejects.toThrow("connection lost");
    expect(user).toHaveBeenCalledExactlyOnceWith("owner");
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      ...input,
      amount: "30.10",
    });
  });
});

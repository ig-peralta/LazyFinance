import { randomUUID } from "node:crypto";
import {
  type DemoTransactionResult,
  DemoTransactionResultSchema,
} from "@lazyfinance/contracts";
import type {
  DemoBankAccount,
  DemoBankMovement,
} from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";
import type { Transaction } from "kysely";
import { sql } from "kysely";
import type { AssistantTables } from "../../assistant/assistant.tables";
import type { FinanceTables } from "../../finance/finance.tables";
import { mainExternalId } from "./demo-bank-source";
import { userFixtureId } from "./demo-fixture-ids";
import { planDemoTransaction } from "./demo-transaction-plan";
import { clp } from "./helpers";
import { type AccountKey, accounts, demoConnectionId } from "./profile";

type DemoToolsTables = FinanceTables & AssistantTables;

function adjustedBalance(balance: string, change: number) {
  const [whole, fraction] = balance.split(".");
  const cents =
    BigInt(whole) * 100n +
    BigInt(whole.startsWith("-") ? `-${fraction}` : fraction);
  const next = cents + BigInt(change) * 100n;
  if (next > 999_999_999_999_999n || next < -999_999_999_999_999n)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Demo bank balance exceeds the supported range",
    });
  const absolute = next < 0n ? -next : next;
  return `${next < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export async function createDemoTransactionInTransaction(
  tx: Transaction<DemoToolsTables>,
  userId: string,
  kind: "internal" | "external",
): Promise<DemoTransactionResult> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${userId}`}, 0))`.execute(
    tx,
  );

  const connectionId = userFixtureId(userId, demoConnectionId);
  const source = await tx
    .selectFrom("finance.demo_bank_source as s")
    .innerJoin("finance.provider_connection as c", "c.id", "s.connectionId")
    .innerJoin("finance.provider as p", "p.id", "c.providerId")
    .select([
      "s.accounts",
      "s.movements",
      "s.initialMovementCount",
      "s.prepared",
      "c.status",
      "c.disconnectedAt",
    ])
    .where("s.connectionId", "=", connectionId)
    .where("s.userId", "=", userId)
    .where("c.userId", "=", userId)
    .where("p.identifier", "=", "mock_bank")
    .executeTakeFirst();
  if (
    !source ||
    !source.prepared ||
    source.status !== "active" ||
    source.disconnectedAt
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prepare demo accounts first",
    });
  const inventory: DemoBankAccount[] = source.accounts;
  const byId = new Map(inventory.map((row) => [row.externalId, row]));
  const balance = (key: AccountKey) => {
    const row = byId.get(mainExternalId(key));
    if (
      !row ||
      row.type !== accounts[key].type ||
      row.number !== accounts[key].number
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Prepare demo accounts first",
      });
    return row.balance;
  };

  // Preparation writes two equal-sized history sets; button activity is appended afterward.
  const activity = source.movements.slice(source.initialMovementCount * 2);
  const plan = planDemoTransaction(
    kind,
    {
      checking: balance("checking"),
      savings: balance("savings"),
      creditCard: balance("creditCard"),
    },
    activity,
  );
  const bookedAt = new Date().toISOString();
  const changes: DemoBankMovement[] = plan.movements.map((movement) => ({
    accountExternalId: mainExternalId(movement.account),
    externalId: `demo:${randomUUID()}`,
    bookedAt,
    amount: clp(movement.amount),
    merchant: movement.merchant,
    description: movement.description,
    relatedMovement: null,
    removed: false,
  }));
  if (plan.pairKind) {
    changes[0].relatedMovement = {
      accountExternalId: changes[1].accountExternalId,
      externalId: changes[1].externalId,
      kind: plan.pairKind,
    };
    changes[1].relatedMovement = {
      accountExternalId: changes[0].accountExternalId,
      externalId: changes[0].externalId,
      kind: plan.pairKind,
    };
  }
  for (const movement of changes) {
    const account = byId.get(movement.accountExternalId);
    if (!account) throw new Error("Demo source account disappeared");
    account.balance = adjustedBalance(account.balance, Number(movement.amount));
  }
  if (source.movements.length + changes.length > 50000)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Demo bank source is full",
    });
  await tx
    .updateTable("finance.demo_bank_source")
    .set({
      accounts: JSON.stringify(inventory),
      movements: JSON.stringify([...source.movements, ...changes]),
      updatedAt: new Date(),
    })
    .where("connectionId", "=", connectionId)
    .where("userId", "=", userId)
    .execute();

  return DemoTransactionResultSchema.parse({
    transactionCount: plan.movements.length,
    description: plan.description,
    amount: plan.amount,
  });
}

export async function changeDemoMovementInTransaction(
  tx: Transaction<DemoToolsTables>,
  userId: string,
  action: "correct" | "remove",
): Promise<DemoTransactionResult> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${userId}`}, 0))`.execute(
    tx,
  );
  const connectionId = userFixtureId(userId, demoConnectionId);
  const source = await tx
    .selectFrom("finance.demo_bank_source as s")
    .innerJoin("finance.provider_connection as c", "c.id", "s.connectionId")
    .select([
      "s.accounts",
      "s.movements",
      "s.prepared",
      "c.status",
      "c.disconnectedAt",
    ])
    .where("s.connectionId", "=", connectionId)
    .where("s.userId", "=", userId)
    .where("c.userId", "=", userId)
    .executeTakeFirst();
  if (!source?.prepared || source.status !== "active" || source.disconnectedAt)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prepare demo accounts first",
    });
  const movements = [...source.movements];
  const index = movements.findLastIndex(
    (row) =>
      !row.removed &&
      !row.relatedMovement &&
      Number(row.amount) < -1000 &&
      [mainExternalId("checking"), mainExternalId("creditCard")].includes(
        row.accountExternalId,
      ),
  );
  if (index < 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No demo purchase is available",
    });
  const previous = movements[index];
  const nextAmount = action === "correct" ? Number(previous.amount) + 1000 : 0;
  movements[index] = {
    ...previous,
    ...(action === "correct" ? { amount: clp(nextAmount) } : { removed: true }),
  };
  const accounts = source.accounts.map((row) =>
    row.externalId === previous.accountExternalId
      ? {
          ...row,
          balance: adjustedBalance(
            row.balance,
            nextAmount - Number(previous.amount),
          ),
        }
      : row,
  );
  await tx
    .updateTable("finance.demo_bank_source")
    .set({
      accounts: JSON.stringify(accounts),
      movements: JSON.stringify(movements),
      updatedAt: new Date(),
    })
    .where("userId", "=", userId)
    .where("connectionId", "=", connectionId)
    .execute();
  return DemoTransactionResultSchema.parse({
    transactionCount: 1,
    description: `${action === "correct" ? "Compra corregida" : "Compra retirada"}: ${previous.description ?? previous.merchant ?? "Banco Demo"}`,
    amount: clp(Math.abs(Number(previous.amount))),
  });
}

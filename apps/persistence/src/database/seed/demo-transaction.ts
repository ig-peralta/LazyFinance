import { randomInt, randomUUID } from "node:crypto";
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
import { clp } from "./helpers";
import { type AccountKey, accounts, demoConnectionId } from "./profile";

type DemoToolsTables = FinanceTables & AssistantTables;
type DemoBalances = Record<AccountKey, string>;
type Movement = {
  account: AccountKey;
  amount: number;
  merchant: string;
  description: string;
  isInternalMovement: boolean;
};
type Plan = { description: string; amount: string; movements: Movement[] };
type Picker = (count: number) => number;

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

const transfers = [
  {
    from: "checking",
    to: "savings",
    merchant: "Ahorro personal",
    description: "Aporte al fondo de emergencia",
    received: "Aporte desde cuenta corriente",
    minimum: 25_000,
    maximum: 150_000,
  },
  {
    from: "savings",
    to: "checking",
    merchant: "Fondo de emergencia",
    description: "Traspaso a cuenta corriente",
    received: "Rescate desde fondo de emergencia",
    minimum: 25_000,
    maximum: 100_000,
  },
] as const;

// Each template fixes direction, account, merchant and plausible CLP range together.
// Mix purchases, services and independent incoming money without inventing a salary receipt.
const external = [
  {
    account: "checking",
    merchant: "Feria libre Ñuñoa",
    description: "Compra de frutas y verduras",
    minimum: 9_000,
    maximum: 38_000,
    step: 500,
    direction: -1,
  },
  {
    account: "checking",
    merchant: "Metro de Santiago",
    description: "Recarga Bip!",
    minimum: 5_000,
    maximum: 20_000,
    step: 1_000,
    direction: -1,
  },
  {
    account: "checking",
    merchant: "Aguas Andinas",
    description: "Cuenta del agua",
    minimum: 14_000,
    maximum: 26_000,
    step: 500,
    direction: -1,
  },
  {
    account: "checking",
    merchant: "Farmacias Ahumada",
    description: "Compra en farmacia",
    minimum: 7_000,
    maximum: 32_000,
    step: 500,
    direction: -1,
  },
  {
    account: "creditCard",
    merchant: "Líder",
    description: "Compra de supermercado",
    minimum: 24_000,
    maximum: 82_000,
    step: 1_000,
    direction: -1,
  },
  {
    account: "creditCard",
    merchant: "Cine Hoyts",
    description: "Entradas al cine",
    minimum: 12_000,
    maximum: 25_000,
    step: 500,
    direction: -1,
  },
  {
    account: "creditCard",
    merchant: "Mercado Libre Chile",
    description: "Compra en línea",
    minimum: 20_000,
    maximum: 95_000,
    step: 1_000,
    direction: -1,
  },
  {
    account: "checking",
    merchant: "Venta de segunda mano",
    description: "Venta de libros usados",
    minimum: 12_000,
    maximum: 45_000,
    step: 1_000,
    direction: 1,
  },
  {
    account: "checking",
    merchant: "Proyecto de diseño",
    description: "Pago por trabajo independiente",
    minimum: 65_000,
    maximum: 170_000,
    step: 5_000,
    direction: 1,
  },
  {
    account: "checking",
    merchant: "Gastos compartidos",
    description: "Devolución de gastos compartidos",
    minimum: 8_000,
    maximum: 35_000,
    step: 500,
    direction: 1,
  },
] as const;

function amountWithin(
  minimum: number,
  maximum: number,
  step: number,
  pick: Picker,
) {
  return minimum + pick(Math.floor((maximum - minimum) / step) + 1) * step;
}

export function planDemoTransaction(
  kind: "internal" | "external",
  balances: DemoBalances,
  pick: Picker = randomInt,
): Plan {
  if (kind === "internal") {
    const eligible = transfers.filter(
      (item) => Number(balances[item.from]) >= item.minimum,
    );
    if (!eligible.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Insufficient demo funds",
      });
    const item = eligible[pick(eligible.length)];
    const amount = amountWithin(
      item.minimum,
      Math.min(item.maximum, Math.floor(Number(balances[item.from]))),
      5_000,
      pick,
    );
    return {
      description: item.description,
      amount: clp(amount),
      movements: [
        {
          account: item.from,
          amount: -amount,
          merchant: item.merchant,
          description: item.description,
          isInternalMovement: true,
        },
        {
          account: item.to,
          amount,
          merchant: item.merchant,
          description: item.received,
          isInternalMovement: true,
        },
      ],
    };
  }

  const eligible = external.filter(
    (item) =>
      item.direction > 0 ||
      item.account === "creditCard" ||
      Number(balances[item.account]) >= item.minimum,
  );
  const item = eligible[pick(eligible.length)];
  const maximum =
    item.direction < 0 && item.account !== "creditCard"
      ? Math.min(item.maximum, Math.floor(Number(balances[item.account])))
      : item.maximum;
  const amount = amountWithin(item.minimum, maximum, item.step, pick);
  return {
    description: item.description,
    amount: clp(amount),
    movements: [
      {
        account: item.account,
        amount: item.direction * amount,
        merchant: item.merchant,
        description: item.description,
        isInternalMovement: false,
      },
    ],
  };
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
  const balances = {} as DemoBalances;
  for (const key of Object.keys(accounts) as AccountKey[]) {
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
    balances[key] = row.balance;
  }

  const plan = planDemoTransaction(kind, balances);
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
  if (kind === "internal") {
    changes[0].relatedMovement = {
      accountExternalId: changes[1].accountExternalId,
      externalId: changes[1].externalId,
      kind: "transfer_pair",
    };
    changes[1].relatedMovement = {
      accountExternalId: changes[0].accountExternalId,
      externalId: changes[0].externalId,
      kind: "transfer_pair",
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

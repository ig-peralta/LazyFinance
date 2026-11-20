import { randomInt, randomUUID } from "node:crypto";
import {
  type DemoTransactionResult,
  DemoTransactionResultSchema,
} from "@lazyfinance/contracts";
import { TRPCError } from "@trpc/server";
import type { Transaction } from "kysely";
import { sql } from "kysely";
import type { AssistantTables } from "../../assistant/assistant.tables";
import type { FinanceTables } from "../../finance/finance.tables";
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
  const accountIds = Object.fromEntries(
    (Object.keys(accounts) as AccountKey[]).map((key) => [
      key,
      userFixtureId(userId, accounts[key].id),
    ]),
  ) as Record<AccountKey, string>;
  const rows = await tx
    .selectFrom("finance.account as account")
    .innerJoin(
      "finance.provider_connection as connection",
      "connection.id",
      "account.providerConnectionId",
    )
    .innerJoin(
      "finance.provider as provider",
      "provider.id",
      "connection.providerId",
    )
    .select([
      "account.id",
      "account.balance",
      "account.type",
      "account.number",
      "account.externalId",
    ])
    .where("account.id", "in", Object.values(accountIds))
    .where("account.userId", "=", userId)
    .where("account.providerConnectionId", "=", connectionId)
    .where("account.active", "=", true)
    .where("account.currency", "=", "CLP")
    .where("connection.userId", "=", userId)
    .where("connection.mode", "=", "test")
    .where("connection.status", "=", "active")
    .where("provider.identifier", "=", "manual")
    .execute();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const balances = {} as DemoBalances;
  for (const key of Object.keys(accounts) as AccountKey[]) {
    const row = byId.get(accountIds[key]);
    if (
      !row ||
      row.type !== accounts[key].type ||
      row.number !== accounts[key].number ||
      row.externalId !== null
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Prepare demo accounts first",
      });
    if (row.balance === null)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Demo balance is unavailable",
      });
    balances[key] = row.balance;
  }

  const plan = planDemoTransaction(kind, balances);
  const bookedAt = new Date();
  for (const movement of plan.movements) {
    const updated = await tx
      .updateTable("finance.account")
      .set({ balance: sql`balance + ${clp(movement.amount)}` })
      .where("id", "=", accountIds[movement.account])
      .where("userId", "=", userId)
      .where("balance", "is not", null)
      .$if(movement.amount < 0 && movement.account !== "creditCard", (query) =>
        query.where("balance", ">=", clp(-movement.amount)),
      )
      .executeTakeFirst();
    if (updated.numUpdatedRows !== 1n)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Demo balance changed",
      });

    await tx
      .insertInto("finance.transaction")
      .values({
        id: randomUUID(),
        accountId: accountIds[movement.account],
        bookedAt,
        amount: clp(movement.amount),
        type: movement.amount < 0 ? "debit" : "credit",
        source: "manual",
        merchant: movement.merchant,
        description: movement.description,
        isInternalMovement: movement.isInternalMovement,
        tagId: null,
        tagDecisionOrigin: "unreviewed",
        tagRuleId: null,
        tagDecidedAt: null,
      })
      .execute();
  }

  return DemoTransactionResultSchema.parse({
    transactionCount: plan.movements.length,
    description: plan.description,
    amount: plan.amount,
  });
}

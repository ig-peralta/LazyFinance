import { randomInt } from "node:crypto";
import type { DemoBankMovement } from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";
import { mainExternalId } from "./demo-bank-source";
import { clp } from "./helpers";
import type { AccountKey } from "./profile";

type Balances = Record<AccountKey, string>;
type Activity = Pick<
  DemoBankMovement,
  "accountExternalId" | "amount" | "merchant" | "relatedMovement"
>;
type Movement = {
  account: AccountKey;
  amount: number;
  merchant: string;
  description: string;
};
type PairKind = NonNullable<DemoBankMovement["relatedMovement"]>["kind"];
type Plan = { description: string; amount: string } & (
  | { pairKind: null; movements: [Movement] }
  | { pairKind: PairKind; movements: [Movement, Movement] }
);
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
  {
    from: "checking",
    to: "creditCard",
    merchant: "Banco Demo",
    description: "Pago de tarjeta de crédito",
    received: "Pago recibido desde cuenta corriente",
    minimum: 25_000,
    maximum: 180_000,
  },
] as const;

const externalOrder = ["cashDebit", "cardPurchase", "incomingCredit"] as const;
type ExternalGroup = (typeof externalOrder)[number];
type Example = readonly [
  merchant: string,
  description: string,
  minimum: number,
  maximum: number,
  step: number,
];

const external: Record<ExternalGroup, readonly Example[]> = {
  cashDebit: [
    ["Feria libre Ñuñoa", "Compra de frutas y verduras", 9_000, 38_000, 500],
    ["Metro de Santiago", "Recarga Bip!", 5_000, 20_000, 1_000],
    ["Aguas Andinas", "Cuenta del agua", 14_000, 26_000, 500],
    ["Farmacias Ahumada", "Compra en farmacia", 7_000, 32_000, 500],
    ["Panadería de barrio", "Pan y desayuno", 2_500, 12_000, 500],
    ["Copec", "Carga de combustible", 20_000, 56_000, 1_000],
    ["Banco Demo", "Comisión mensual de cuenta", 1_500, 7_500, 500],
  ],
  cardPurchase: [
    ["Líder", "Supermercado con tarjeta", 24_000, 82_000, 1_000],
    ["Cine Hoyts", "Entradas al cine con tarjeta", 12_000, 25_000, 500],
    ["Mercado Libre Chile", "Compra web con tarjeta", 20_000, 95_000, 1_000],
    ["Restaurante Barrio Italia", "Cena con tarjeta", 16_000, 48_000, 1_000],
    ["Netflix", "Suscripción de streaming con tarjeta", 6_500, 15_500, 500],
    ["Tur Bus", "Pasajes con tarjeta", 10_000, 52_000, 1_000],
    ["Librería Antártica", "Papelería con tarjeta", 8_500, 32_000, 500],
  ],
  incomingCredit: [
    ["Venta de segunda mano", "Abono por libros usados", 12_000, 45_000, 1_000],
    ["Proyecto de diseño", "Abono por diseño", 65_000, 170_000, 5_000],
    ["Gastos compartidos", "Devolución de gastos", 8_000, 35_000, 500],
    ["Ayuda familiar", "Abono para gastos del mes", 20_000, 90_000, 1_000],
    ["Arriendo de cámara", "Abono por arriendo", 15_000, 55_000, 1_000],
  ],
};

function rotateAfter<T>(choices: readonly T[], previous: number) {
  const next = previous + 1;
  return [...choices.slice(next), ...choices.slice(0, next)];
}

// Demo movements use whole CLP; discard fractional balances before applying caps.
function wholePesos(balance: string) {
  return Number(balance.split(".", 1)[0]);
}

function amountWithin(
  minimum: number,
  maximum: number,
  step: number,
  pick: Picker,
) {
  return minimum + pick(Math.floor((maximum - minimum) / step) + 1) * step;
}

function planTransfer(
  balances: Balances,
  activity: readonly Activity[],
  pick: Picker,
): Plan {
  // Only the debit identifies the direction; the credit is the other half of the same click.
  const last = activity.findLast(
    (row) => row.relatedMovement && row.amount.startsWith("-"),
  );
  const previous = transfers.findIndex(
    ({ from, to }) =>
      last?.accountExternalId === mainExternalId(from) &&
      last.relatedMovement?.accountExternalId === mainExternalId(to),
  );
  const cardDebt = -wholePesos(balances.creditCard);

  for (const item of rotateAfter(transfers, previous)) {
    const cardPayment = item.to === "creditCard";
    const cash = wholePesos(balances[item.from]);
    const available = cardPayment ? Math.min(cash, cardDebt) : cash;
    const maximum = Math.min(item.maximum, available);
    const minimum = cardPayment
      ? Math.min(item.minimum, maximum)
      : item.minimum;
    if (maximum < 1 || maximum < minimum) continue;

    const amount = amountWithin(minimum, maximum, 5_000, pick);
    return {
      description: item.description,
      amount: clp(amount),
      pairKind: cardPayment ? "card_payment_pair" : "transfer_pair",
      movements: [
        {
          account: item.from,
          amount: -amount,
          merchant: item.merchant,
          description: item.description,
        },
        {
          account: item.to,
          amount,
          merchant: item.merchant,
          description: item.received,
        },
      ],
    };
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Insufficient demo funds",
  });
}

function externalGroup(row: Activity): ExternalGroup | undefined {
  if (row.relatedMovement) return;
  const debit = row.amount.startsWith("-");
  if (row.accountExternalId === mainExternalId("checking"))
    return debit ? "cashDebit" : "incomingCredit";
  if (debit && row.accountExternalId === mainExternalId("creditCard"))
    return "cardPurchase";
}

function planExternal(
  balances: Balances,
  activity: readonly Activity[],
  pick: Picker,
): Plan {
  const last = activity.findLast(externalGroup);
  const previousGroup = last && externalGroup(last);
  const previous = previousGroup ? externalOrder.indexOf(previousGroup) : -1;
  const cash = wholePesos(balances.checking);

  for (const group of rotateAfter(externalOrder, previous)) {
    const eligible = external[group].filter(
      ([, , minimum]) => group !== "cashDebit" || minimum <= cash,
    );
    if (!eligible.length) continue;

    const recent = activity.findLast((row) => externalGroup(row) === group);
    const alternatives = eligible.filter(
      ([merchant]) => merchant !== recent?.merchant,
    );
    const pool = alternatives.length ? alternatives : eligible;
    const [merchant, description, minimum, maximum, step] =
      pool[pick(pool.length)];
    const amount = amountWithin(
      minimum,
      group === "cashDebit" ? Math.min(maximum, cash) : maximum,
      step,
      pick,
    );
    return {
      description,
      amount: clp(amount),
      pairKind: null,
      movements: [
        {
          account: group === "cardPurchase" ? "creditCard" : "checking",
          amount: group === "incomingCredit" ? amount : -amount,
          merchant,
          description,
        },
      ],
    };
  }

  throw new Error("No external demo examples are available");
}

export function planDemoTransaction(
  kind: "internal" | "external",
  balances: Balances,
  activity: readonly Activity[],
  pick: Picker = randomInt,
): Plan {
  return kind === "internal"
    ? planTransfer(balances, activity, pick)
    : planExternal(balances, activity, pick);
}

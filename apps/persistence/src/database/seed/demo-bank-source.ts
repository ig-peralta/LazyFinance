import type {
  DemoBankAccount,
  DemoBankMovement,
} from "@lazyfinance/contracts/internal";
import { clp } from "./helpers";
import { buildLedger, type LedgerEntry } from "./ledger";
import { type AccountKey, accounts, openingBalances } from "./profile";

export const mainExternalId = (key: AccountKey) => `demo-main-${key}`;

const additional = [
  {
    externalId: "demo-extra-checking",
    type: "checking",
    number: "DEMO-CC-002",
  },
  {
    externalId: "demo-extra-savings",
    type: "savings",
    number: "DEMO-AH-002",
  },
  {
    externalId: "demo-extra-credit-card",
    type: "credit_card",
    number: "DEMO-TC-002",
  },
] as const satisfies Pick<DemoBankAccount, "externalId" | "type" | "number">[];

export function buildDemoBankSource(asOf = new Date()) {
  const entries = buildLedger(asOf);
  const main = (Object.keys(accounts) as AccountKey[]).map((key) => ({
    externalId: mainExternalId(key),
    type: accounts[key].type,
    number: accounts[key].number,
    holderName: accounts[key].holderName,
    balance: clp(
      openingBalances[key] +
        entries
          .filter((entry) => entry.accountId === accounts[key].id)
          .reduce((sum, entry) => sum + Number(entry.amount), 0),
    ),
  }));
  const inventory: DemoBankAccount[] = [
    ...main,
    ...additional.map((row, index) => {
      if (main[index].type !== row.type)
        throw new Error("Demo bank counterpart is missing");
      return {
        ...row,
        holderName: main[index].holderName,
        balance: main[index].balance,
      };
    }),
  ];
  const keyOf = new Map(
    Object.entries(accounts).map(([key, value]) => [
      value.id,
      key as AccountKey,
    ]),
  );
  const paired = new Map<string, LedgerEntry>();
  for (const entry of entries.filter((row) => row.isInternalMovement)) {
    if (paired.has(entry.id)) continue;
    const match = entries.find(
      (row) =>
        row.isInternalMovement &&
        row.id !== entry.id &&
        !paired.has(row.id) &&
        row.accountId !== entry.accountId &&
        row.bookedAt.getTime() === entry.bookedAt.getTime() &&
        Number(row.amount) === -Number(entry.amount),
    );
    if (match) {
      paired.set(entry.id, match);
      paired.set(match.id, entry);
    }
  }
  const mainMovements: DemoBankMovement[] = entries.map((entry) => {
    const account = keyOf.get(entry.accountId);
    if (!account || !entry.externalId)
      throw new Error("Unknown demo source movement");
    const other = paired.get(entry.id);
    const relatedAccount = other && keyOf.get(other.accountId);
    if (other && (!relatedAccount || !other.externalId))
      throw new Error("Unknown paired demo source movement");
    return {
      accountExternalId: mainExternalId(account),
      externalId: entry.externalId,
      bookedAt: entry.bookedAt.toISOString(),
      amount: entry.amount,
      merchant: entry.merchant ?? null,
      description: entry.description ?? null,
      relatedMovement:
        relatedAccount && other?.externalId
          ? {
              accountExternalId: mainExternalId(relatedAccount),
              externalId: other.externalId,
              kind:
                account === "creditCard" || relatedAccount === "creditCard"
                  ? ("card_payment_pair" as const)
                  : ("transfer_pair" as const),
            }
          : null,
      removed: false,
    };
  });
  const extraIdByMain = new Map(
    inventory
      .slice(0, 3)
      .map((account, index) => [
        account.externalId,
        inventory[index + 3].externalId,
      ]),
  );
  const extraId = (id: string) => {
    const mapped = extraIdByMain.get(id);
    if (!mapped) throw new Error("Demo bank counterpart is missing");
    return mapped;
  };
  const movements: DemoBankMovement[] = [
    ...mainMovements,
    ...mainMovements.map((movement) => ({
      ...movement,
      accountExternalId: extraId(movement.accountExternalId),
      externalId: `extra:${movement.externalId}`,
      relatedMovement: movement.relatedMovement
        ? {
            ...movement.relatedMovement,
            accountExternalId: extraId(
              movement.relatedMovement.accountExternalId,
            ),
            externalId: `extra:${movement.relatedMovement.externalId}`,
          }
        : null,
    })),
  ];
  return { inventory, movements, entries };
}

import type { DemoBankAccount } from "@lazyfinance/contracts/internal";
import { seedId } from "./helpers";

type AccountFixture = Pick<
  DemoBankAccount,
  "type" | "number" | "holderName"
> & {
  id: string;
};

const holderName = "Camila Rojas";

// Keep this key stable so existing prepared demo banks remain addressable.
export const demoConnectionId = seedId("connection:manual");

export const accounts = {
  checking: {
    id: seedId("account:checking"),
    type: "checking",
    number: "DEMO-CC-001",
    holderName,
  },
  savings: {
    id: seedId("account:savings"),
    type: "savings",
    number: "DEMO-AH-001",
    holderName,
  },
  creditCard: {
    id: seedId("account:credit-card"),
    type: "credit_card",
    number: "DEMO-TC-001",
    holderName,
  },
} as const satisfies Record<string, AccountFixture>;

export type AccountKey = keyof typeof accounts;

// Balances at the beginning of January 2024, before the first transaction.
export const openingBalances: Record<AccountKey, number> = {
  checking: 1_050_000,
  savings: 1_250_000,
  creditCard: 0,
};

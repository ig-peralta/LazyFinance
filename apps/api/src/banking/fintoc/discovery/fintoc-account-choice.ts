import type { BankingAccountChoice } from "@lazyfinance/contracts";
import type { FintocAccount } from "../client/fintoc-snapshot.schema";

/** Discovery deliberately excludes balances, holder identity and raw numbers. */
export function fintocAccountChoice(
  account: FintocAccount,
): BankingAccountChoice {
  const names: Record<string, string> = {
    checking_account: "Cuenta corriente",
    sight_account: "Cuenta vista",
    rut_account: "Cuenta RUT",
    savings_account: "Cuenta de ahorro",
    credit_card: "Tarjeta de crédito",
    line_of_credit: "Línea de crédito",
  };
  return {
    externalId: account.id,
    name: names[account.type] ?? "Otro producto",
    currency: account.currency,
    numberSuffix: account.number ? account.number.slice(-4) : null,
    unavailableReason: account.removed_from_link
      ? "removed_from_link"
      : account.currency !== "CLP"
        ? "unsupported_currency"
        : [
              "checking_account",
              "sight_account",
              "rut_account",
              "savings_account",
              "credit_card",
            ].includes(account.type)
          ? null
          : "unsupported_type",
  };
}

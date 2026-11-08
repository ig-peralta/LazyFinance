import type { AccountSummary } from "@lazyfinance/contracts";
import { formatClp, moneyCents } from "../../../utils/currency";
import { formatDate } from "../../../utils/date";

export function accountTypeLabel(type: AccountSummary["type"]): string {
  return type === "checking"
    ? "Cuenta corriente"
    : type === "savings"
      ? "Cuenta de ahorro"
      : "Tarjeta de crédito";
}

export function accountBalanceLabel(account: AccountSummary): string {
  if (account.balance === null) return "Saldo no disponible";
  if (account.type !== "credit_card") return "Saldo en cuenta";
  const balance = moneyCents(account.balance);
  return balance < 0n
    ? "Saldo adeudado"
    : balance > 0n
      ? "Saldo a favor"
      : "Saldo de tarjeta";
}

export function formatAccountBalance(account: AccountSummary): string {
  return account.balance === null
    ? "—"
    : formatClp(
        account.type === "credit_card"
          ? account.balance.replace(/^-/, "")
          : account.balance,
      );
}

export function accountFreshnessLabel(account: AccountSummary): string {
  if (account.balance === null) return "Sin saldo confirmado";
  return account.lastSyncedAt
    ? `Actualizado ${formatDate(new Date(account.lastSyncedAt))}`
    : "Sin información de actualización";
}

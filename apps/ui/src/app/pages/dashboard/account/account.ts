import { Component, inject } from "@angular/core";
import type { AccountSummary } from "@lazyfinance/contracts";
import { Card } from "primeng/card";
import { formatClp, moneyCents } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { AccountsData } from "../../../features/accounts/accounts.data";

@Component({
  selector: "dashboard-account",
  imports: [Card],
  templateUrl: "./account.html",
})
export class Account {
  protected readonly accounts = inject(AccountsData).accounts;

  protected accountTypeLabel(type: AccountSummary["type"]): string {
    switch (type) {
      case "checking":
        return "Cuenta corriente";
      case "savings":
        return "Cuenta de ahorro";
      case "credit_card":
        return "Tarjeta de crédito";
    }
  }

  protected accountBalanceLabel(account: AccountSummary): string {
    if (account.balance === null) return "Saldo no disponible";
    if (account.type !== "credit_card") return "Saldo en cuenta";
    if (moneyCents(account.balance) < 0n) return "Saldo adeudado";

    return moneyCents(account.balance) > 0n
      ? "Saldo a favor"
      : "Saldo de tarjeta";
  }

  protected formatAccountBalance(account: AccountSummary): string {
    if (account.balance === null) return "—";

    return formatClp(
      account.type === "credit_card"
        ? account.balance.replace(/^-/, "")
        : account.balance,
    );
  }

  protected freshnessLabel(account: AccountSummary): string {
    if (account.balance === null) return "Sin saldo confirmado";
    if (!account.lastSyncedAt) return "Sin información de actualización";

    return `Actualizado ${formatDate(new Date(account.lastSyncedAt))}`;
  }
}

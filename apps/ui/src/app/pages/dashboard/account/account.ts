import { Component, inject } from "@angular/core";
import type { AccountSummary } from "@lazyfinance/contracts";
import { Card } from "primeng/card";
import { formatClp } from "../../../../utils/currency";
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
    if (Number(account.balance) < 0) return "Saldo adeudado";

    return Number(account.balance) > 0 ? "Saldo a favor" : "Saldo de tarjeta";
  }

  protected formatAccountBalance(account: AccountSummary): string {
    if (account.balance === null) return "—";

    const balance = Number(account.balance);

    return formatClp(
      account.type === "credit_card" && balance < 0 ? -balance : balance,
    );
  }

  protected freshnessLabel(account: AccountSummary): string {
    if (account.balance === null) return "Sin saldo confirmado";
    if (!account.lastSyncedAt) return "Sin información de actualización";

    return `Actualizado ${formatDate(new Date(account.lastSyncedAt))}`;
  }
}

import { Component, inject } from "@angular/core";
import { Card } from "primeng/card";
import {
  accountBalanceLabel,
  accountFreshnessLabel,
  accountTypeLabel,
  formatAccountBalance,
} from "../../../features/accounts/account-presentation";
import { AccountsData } from "../../../features/accounts/accounts.data";

@Component({
  selector: "dashboard-account",
  imports: [Card],
  templateUrl: "./account.html",
})
export class Account {
  protected readonly accounts = inject(AccountsData).accounts;

  protected readonly accountTypeLabel = accountTypeLabel;
  protected readonly accountBalanceLabel = accountBalanceLabel;
  protected readonly formatAccountBalance = formatAccountBalance;
  protected readonly freshnessLabel = accountFreshnessLabel;
}

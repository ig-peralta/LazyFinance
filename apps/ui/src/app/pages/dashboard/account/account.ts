import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  accountBalanceLabel,
  accountFreshnessLabel,
  accountTypeLabel,
  formatAccountBalance,
} from "../../../features/accounts/account-presentation";
import { AccountsData } from "../../../features/accounts/accounts.data";
import { Icon } from "../../../shared/ui/icon";

@Component({
  selector: "dashboard-account",
  imports: [RouterLink, Icon],
  templateUrl: "./account.html",
})
export class Account {
  protected readonly accounts = inject(AccountsData).accounts;

  protected readonly accountTypeLabel = accountTypeLabel;
  protected readonly accountBalanceLabel = accountBalanceLabel;
  protected readonly formatAccountBalance = formatAccountBalance;
  protected readonly freshnessLabel = accountFreshnessLabel;
}

import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  accountBalanceLabel,
  accountTypeLabel,
  formatAccountBalance,
} from "../../features/accounts/account-presentation";
import { AccountsData } from "../../features/accounts/accounts.data";
import { Icon } from "../../shared/ui/icon";

const timestamp = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "medium",
  timeStyle: "short",
});

@Component({
  selector: "accounts-page",
  imports: [RouterLink, Icon],
  providers: [AccountsData],
  templateUrl: "./accounts.page.html",
})
export class AccountsPage {
  protected readonly accounts = inject(AccountsData).accounts;
  protected readonly type = accountTypeLabel;
  protected readonly label = accountBalanceLabel;
  protected readonly balance = formatAccountBalance;
  protected readonly time = (value: string) =>
    timestamp.format(new Date(value));
  protected readonly old = (value: string | null) =>
    !!value && Date.now() - Date.parse(value) > 24 * 60 * 60 * 1000;
}

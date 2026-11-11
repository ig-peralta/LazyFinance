import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { AccountListItem } from "@lazyfinance/contracts";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import {
  accountBalanceLabel,
  accountTypeLabel,
  formatAccountBalance,
} from "../../features/accounts/account-presentation";
import { AccountsData } from "../../features/accounts/accounts.data";
import { EditorDrawer } from "../../shared/ui/editor-drawer";
import { Icon } from "../../shared/ui/icon";
import { AccountAliasEditor } from "./account-alias-editor";

const timestamp = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "medium",
  timeStyle: "short",
});

@Component({
  selector: "accounts-page",
  imports: [RouterLink, Icon, EditorDrawer, AccountAliasEditor],
  providers: [AccountsData],
  templateUrl: "./accounts.page.html",
})
export class AccountsPage {
  protected readonly accounts = inject(AccountsData).accounts;
  private readonly rpc = inject(RpcClient);
  private readonly editor = signal<{
    scope: RpcScope;
    account: AccountListItem;
  } | null>(null);
  protected readonly editing = computed(() =>
    this.editor()?.scope === this.rpc.authenticatedScope()
      ? this.editor()?.account
      : undefined,
  );
  protected readonly type = accountTypeLabel;
  protected readonly label = accountBalanceLabel;
  protected readonly balance = formatAccountBalance;
  protected readonly time = (value: string) =>
    timestamp.format(new Date(value));
  protected readonly old = (value: string | null) =>
    !!value && Date.now() - Date.parse(value) > 24 * 60 * 60 * 1000;

  constructor() {
    reportWorkspaceReadiness(this.accounts);
  }

  protected edit(account: AccountListItem) {
    const scope = this.rpc.authenticatedScope();
    if (scope && !this.accounts.isLoading())
      this.editor.set({ scope, account });
  }

  protected closeEditor() {
    this.editor.set(null);
  }

  protected saved() {
    this.closeEditor();
    this.accounts.reload();
  }
}

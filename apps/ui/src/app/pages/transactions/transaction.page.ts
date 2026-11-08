import { Component, computed, inject, resource, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { formatClp } from "../../../utils/currency";
import { formatDate } from "../../../utils/date";
import { RpcClient } from "../../core/rpc/rpc-client";
import { Icon } from "../../shared/ui/icon";
import { TransactionCorrections } from "./transaction-corrections";

@Component({
  selector: "transaction-page",
  imports: [RouterLink, Icon, TransactionCorrections],
  templateUrl: "./transaction.page.html",
})
export class TransactionPage {
  protected readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly rpc = inject(RpcClient);
  protected readonly id = computed(() => this.params().get("id"));
  protected readonly detail = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id();
      return scope && id ? { scope, id } : undefined;
    },
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.transactions.detail.query({ id }, { signal: abortSignal }),
  });
  protected readonly money = formatClp;
  private readonly notice = signal<{
    scope: unknown;
    id: string | null;
    message: string;
  } | null>(null);
  protected readonly savedNotice = computed(() =>
    this.notice()?.scope === this.rpc.authenticatedScope() &&
    this.notice()?.id === this.id()
      ? this.notice()?.message
      : null,
  );

  protected corrected(message: string) {
    this.notice.set({
      scope: this.rpc.authenticatedScope(),
      id: this.id(),
      message,
    });
    this.detail.reload();
  }
  protected readonly date = (value: string) => formatDate(new Date(value));
}

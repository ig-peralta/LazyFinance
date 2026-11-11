import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { movementReturn } from "../../../core/navigation/return-context";
import { reportWorkspaceReadiness } from "../../../core/rendering/workspace-preparation";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { EditorDrawer } from "../../../shared/ui/editor-drawer";
import { Icon } from "../../../shared/ui/icon";
import { TransactionCorrections } from "./corrections/transaction-corrections";

@Component({
  selector: "transaction-page",
  imports: [RouterLink, Icon, TransactionCorrections, EditorDrawer],
  templateUrl: "./transaction.page.html",
})
export class TransactionPage {
  protected readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly returnContext = computed(() =>
    movementReturn(this.query()),
  );
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
  protected readonly editorOpen = signal(false);
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

  constructor() {
    reportWorkspaceReadiness(this.detail);
    effect(() => {
      this.rpc.authenticatedScope();
      this.id();
      this.editorOpen.set(false);
    });
  }

  protected corrected(message: string) {
    this.editorOpen.set(false);
    this.notice.set({
      scope: this.rpc.authenticatedScope(),
      id: this.id(),
      message,
    });
    this.detail.reload();
  }
  protected readonly date = (value: string) => formatDate(new Date(value));
}

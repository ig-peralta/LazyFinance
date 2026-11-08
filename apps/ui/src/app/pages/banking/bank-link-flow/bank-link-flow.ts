import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import type {
  BankingConnection,
  CreateBankingIntent,
} from "@lazyfinance/contracts";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { FintocWidget } from "../../../features/banking/fintoc-widget";
import { Icon } from "../../../shared/ui/icon";

@Component({
  selector: "bank-link-flow",
  imports: [Icon],
  templateUrl: "./bank-link-flow.html",
})
export class BankLinkFlow {
  readonly mode = input.required<"test" | "live">();
  readonly connection = input<BankingConnection | null>(null);
  readonly completed = output<BankingConnection>();
  readonly cancelled = output<void>();
  readonly reconcile = output<void>();
  private readonly widget = inject(FintocWidget);
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  protected readonly command = createScopedCommand();
  protected readonly holder =
    signal<CreateBankingIntent["holderType"]>("individual");
  protected readonly stage = signal<"preparing" | "authorizing" | "confirming">(
    "preparing",
  );
  protected readonly progress = computed(
    () =>
      ({
        preparing: "Preparando la conexión segura…",
        authorizing: "Completa la autorización en la ventana de Fintoc…",
        confirming: "Confirmando la conexión con el servidor…",
      })[this.stage()],
  );

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }

  protected chooseHolder(value: string) {
    if (value === "individual" || value === "business") this.holder.set(value);
  }

  protected start() {
    void this.command.run(
      async (scope, operationSignal) => {
        const signal = AbortSignal.any([scope.signal, operationSignal]);
        this.stage.set("preparing");
        const connection = this.connection();
        const intent = await scope.client.banking.createLinkIntent.mutate(
          {
            holderType: connection?.holderType ?? this.holder(),
            ...(connection ? { connectionId: connection.id } : {}),
          },
          { signal },
        );
        signal.throwIfAborted();
        if (intent.mode !== this.mode())
          throw new Error("Banking mode changed; consult configuration again");
        this.stage.set("authorizing");
        const exchangeToken = await this.widget.authorize(
          { publicKey: intent.publicKey, widgetToken: intent.widgetToken },
          signal,
        );
        signal.throwIfAborted();
        if (exchangeToken === null) return null;
        this.stage.set("confirming");
        return scope.client.banking.completeLink.mutate(
          { id: intent.id, exchangeToken },
          { signal },
        );
      },
      (connection) => {
        if (connection) this.completed.emit(connection);
        else this.cancelled.emit();
      },
    );
  }
}

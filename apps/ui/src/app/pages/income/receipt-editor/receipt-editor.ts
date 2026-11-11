import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  ConfirmIncomeReceiptSchema,
  MonthSchema,
} from "@lazyfinance/contracts";
import { formatClp } from "../../../../utils/currency";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";

@Component({
  selector: "income-receipt-editor",
  imports: [FormsModule, RouterLink],
  templateUrl: "./receipt-editor.html",
})
export class ReceiptEditor {
  readonly transactionId = input.required<string>();
  readonly month = input<string>();
  protected readonly movementContext = computed(() => {
    const parsed = MonthSchema.safeParse(this.month());
    return parsed.success
      ? { returnTo: "income", month: parsed.data }
      : { returnTo: "income" };
  });
  readonly saved = output<string>();
  readonly cancelled = output<void>();
  private readonly rpc = inject(RpcClient);
  protected readonly detail = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, id: this.transactionId() };
    },
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.transactions.detail.query({ id }, { signal: abortSignal }),
  });
  protected readonly sources = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.income.sources.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly eligible = computed(() => {
    const item = this.detail.hasValue() ? this.detail.value() : null;
    return (
      !!item &&
      item.type === "credit" &&
      item.isInternalMovement === false &&
      item.reviewStatus === "clear" &&
      !item.removedAt &&
      !item.hasExpenseAdjustments &&
      Date.parse(item.bookedAt) <= Date.now()
    );
  });
  protected readonly command = createScopedCommand();
  protected readonly ineligibilityReasons = computed(() => {
    if (!this.detail.hasValue()) return [];
    const item = this.detail.value();
    const reasons: string[] = [];
    if (item.type !== "credit") reasons.push("Este movimiento no es un abono.");
    if (item.isInternalMovement === true)
      reasons.push("Es una transferencia interna.");
    if (item.isInternalMovement === null)
      reasons.push("Falta determinar si es una transferencia interna.");
    if (item.reviewStatus !== "clear")
      reasons.push("Tiene una revisión pendiente.");
    if (item.removedAt) reasons.push("El banco retiró este movimiento.");
    if (item.hasExpenseAdjustments)
      reasons.push("Tiene vínculos de devolución o reembolso.");
    if (Date.parse(item.bookedAt) > Date.now())
      reasons.push("Su fecha de registro aún no llega.");
    return reasons;
  });
  protected readonly error = signal<string | null>(null);
  protected readonly clearing = signal(false);
  protected sourceId = "";
  protected readonly money = formatClp;

  constructor() {
    effect(() => {
      this.sourceId = this.detail.hasValue()
        ? (this.detail.value().receipt?.sourceId ?? "")
        : "";
    });
  }

  protected confirm() {
    const parsed = ConfirmIncomeReceiptSchema.safeParse({
      transactionId: this.transactionId(),
      sourceId: this.sourceId,
    });
    if (
      !parsed.success ||
      !this.eligible() ||
      this.sources.isLoading() ||
      this.sources.error() ||
      !this.sources.hasValue() ||
      !this.sources.value().some((source) => source.id === this.sourceId)
    ) {
      this.error.set(
        "Elige una fuente y un abono elegible. La validación final se realiza en el servidor.",
      );
      return;
    }
    this.error.set(null);
    void this.command.run(
      (scope, signal) =>
        scope.client.income.confirm.mutate(parsed.data, { signal }),
      () =>
        this.saved.emit(
          "Ingreso confirmado. Se recalcularon los ingresos; el importe y la fecha del banco no cambiaron.",
        ),
    );
  }

  protected clear() {
    void this.command.run(
      (scope, signal) =>
        scope.client.income.clear.mutate(
          { id: this.transactionId() },
          { signal },
        ),
      () =>
        this.saved.emit(
          "Vínculo de ingreso quitado. El abono original se conserva y su clasificación vuelve a evaluarse.",
        ),
    );
  }
}

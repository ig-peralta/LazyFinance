import { Component, effect, inject, input, output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SetTagSchema, type TransactionDetail } from "@lazyfinance/contracts";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { TagsData } from "../../features/tags/tags.data";

@Component({
  selector: "transaction-corrections",
  imports: [FormsModule],
  providers: [TagsData],
  templateUrl: "./transaction-corrections.html",
})
export class TransactionCorrections {
  readonly item = input.required<TransactionDetail>();
  readonly saved = output<string>();
  protected readonly tags = inject(TagsData).tags;
  protected readonly command = createScopedCommand();
  protected selection = "none";
  protected internal = "provider";

  constructor() {
    effect(() => {
      const item = this.item();
      this.selection = item.tag?.id ?? "none";
      this.internal =
        item.userInternalOverride === null
          ? "provider"
          : item.userInternalOverride
            ? "internal"
            : "external";
    });
  }

  protected setTag() {
    const parsed = SetTagSchema.safeParse({
      transactionId: this.item().id,
      tagId: this.selection === "none" ? null : this.selection,
    });
    if (!parsed.success || this.item().removedAt) return;
    void this.command.run(
      (scope, signal) =>
        scope.client.tags.decide.mutate(parsed.data, { signal }),
      () =>
        this.saved.emit(
          "Etiqueta corregida. Los gastos y presupuestos se recalcularán con esta selección.",
        ),
    );
  }

  protected resetTag() {
    if (this.item().removedAt) return;
    void this.command.run(
      (scope, signal) =>
        scope.client.tags.reset.mutate({ id: this.item().id }, { signal }),
      () =>
        this.saved.emit(
          "Decisión manual restablecida. El movimiento vuelve a quedar sin revisar.",
        ),
    );
  }

  protected setInternal() {
    if (
      this.item().removedAt ||
      !["provider", "internal", "external"].includes(this.internal)
    )
      return;
    const id = this.item().id,
      isInternalMovement =
        this.internal === "provider" ? null : this.internal === "internal";
    void this.command.run(
      (scope, signal) =>
        scope.client.transactions.setInternalMovement.mutate(
          { id, isInternalMovement },
          { signal },
        ),
      () =>
        this.saved.emit(
          "Clasificación corregida. Se revisarán gastos, presupuestos y elegibilidad de ingresos sin alterar los hechos bancarios.",
        ),
    );
  }
}

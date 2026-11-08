import { Component, effect, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { IncomeSource } from "@lazyfinance/contracts";
import { createScopedCommand } from "../../../../core/rpc/scoped-command";
import { sourceFields, sourceInput } from "../source-form";

@Component({
  selector: "income-source-editor",
  imports: [FormsModule],
  templateUrl: "./source-editor.html",
})
export class SourceEditor {
  readonly source = input<IncomeSource | null>(null);
  readonly saved = output<IncomeSource>();
  readonly cancelled = output<void>();
  protected readonly command = createScopedCommand();
  protected fields = sourceFields();
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.fields = sourceFields(this.source());
      this.error.set(null);
    });
  }

  protected save() {
    const parsed = sourceInput(this.fields),
      existing = this.source();
    if (!parsed.success) {
      this.error.set(
        "Revisa nombre, monto positivo con hasta 2 decimales y fechas. Los pagos regulares necesitan calendario; dos pagos mensuales usan un primer día entre 1 y 27 y otro posterior.",
      );
      return;
    }
    this.error.set(null);
    void this.command.run(
      (scope, signal) =>
        existing
          ? scope.client.income.updateSource.mutate(
              { id: existing.id, source: parsed.data },
              { signal },
            )
          : scope.client.income.createSource.mutate(parsed.data, { signal }),
      (source) => this.saved.emit(source),
    );
  }
}

import { Component, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  type IncomeExpectation,
  IncomeExpectationInputSchema,
  type IncomeSource,
} from "@lazyfinance/contracts";
import { decimalInput } from "../../../../../utils/currency";
import { createScopedCommand } from "../../../../core/rpc/scoped-command";

@Component({
  selector: "income-expectation-editor",
  imports: [FormsModule],
  templateUrl: "./expectation-editor.html",
})
export class ExpectationEditor {
  readonly source = input.required<IncomeSource>();
  readonly entry = input<IncomeExpectation | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  protected readonly command = createScopedCommand();
  protected readonly error = signal<string | null>(null);
  protected date = "";
  protected amount = "";
  protected estimate = false;

  ngOnInit() {
    const entry = this.entry();
    this.date = entry?.date ?? "";
    this.amount = entry?.amount ?? "";
    this.estimate = entry?.isEstimate ?? false;
  }

  private parsedInput() {
    return IncomeExpectationInputSchema.safeParse({
      date: this.date,
      amount: decimalInput(this.amount),
      isEstimate: this.estimate,
    });
  }

  protected invalid(field: "date" | "amount") {
    if (!this.error()) return false;
    const parsed = this.parsedInput();
    const source = this.source();
    return (
      (!parsed.success &&
        parsed.error.issues.some((issue) => issue.path[0] === field)) ||
      (field === "date" &&
        (this.date < source.startDate ||
          (!!source.endDate && this.date > source.endDate)))
    );
  }

  protected save() {
    const parsed = this.parsedInput(),
      source = this.source();
    if (
      source.archivedAt ||
      !parsed.success ||
      this.date < source.startDate ||
      (source.endDate && this.date > source.endDate)
    ) {
      this.error.set(
        "Usa una fecha dentro de la vigencia de la fuente y un monto positivo con hasta 2 decimales.",
      );
      return;
    }
    this.error.set(null);
    const existing = this.entry();
    void this.command.run(
      (scope, signal) =>
        existing
          ? scope.client.income.updateExpectation.mutate(
              { id: existing.id, expectation: parsed.data },
              { signal },
            )
          : scope.client.income.createExpectation.mutate(
              { sourceId: source.id, expectation: parsed.data },
              { signal },
            ),
      () => this.saved.emit(),
    );
  }
}

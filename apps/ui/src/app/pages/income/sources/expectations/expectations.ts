import { Component, inject, input, resource, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  type IncomeExpectation,
  IncomeExpectationInputSchema,
  type IncomeSource,
} from "@lazyfinance/contracts";
import { decimalInput, formatClp } from "../../../../../utils/currency";
import { RpcClient } from "../../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../../core/rpc/scoped-command";

@Component({
  selector: "income-expectations",
  imports: [FormsModule],
  templateUrl: "./expectations.html",
})
export class Expectations {
  readonly source = input.required<IncomeSource>();
  private readonly rpc = inject(RpcClient);
  protected readonly entries = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, id: this.source().id };
    },
    loader: ({ params: { scope, id }, abortSignal }) =>
      scope.client.income.expectations.query({ id }, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly command = createScopedCommand();
  protected readonly editing = signal<IncomeExpectation | null>(null);
  protected readonly removing = signal<IncomeExpectation | null>(null);
  protected readonly error = signal<string | null>(null);
  protected date = "";
  protected amount = "";
  protected estimate = false;
  protected readonly money = formatClp;

  protected edit(entry: IncomeExpectation) {
    this.editing.set(entry);
    this.date = entry.date;
    this.amount = entry.amount;
    this.estimate = entry.isEstimate;
    this.error.set(null);
  }

  protected reset() {
    this.editing.set(null);
    this.date = "";
    this.amount = "";
    this.estimate = false;
    this.error.set(null);
  }

  protected save() {
    const parsed = IncomeExpectationInputSchema.safeParse({
        date: this.date,
        amount: decimalInput(this.amount),
        isEstimate: this.estimate,
      }),
      source = this.source();
    if (
      !parsed.success ||
      this.date < source.startDate ||
      (source.endDate && this.date > source.endDate)
    ) {
      this.error.set(
        "Usa una fecha dentro de la vigencia de la fuente y un monto positivo con hasta 2 decimales.",
      );
      return;
    }
    const existing = this.editing();
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
      () => {
        this.reset();
        this.entries.reload();
      },
      "Pago esperado guardado. No se ha confirmado ningún ingreso.",
    );
  }

  protected remove() {
    const entry = this.removing();
    if (!entry) return;
    void this.command.run(
      (scope, signal) =>
        scope.client.income.removeExpectation.mutate(
          { id: entry.id },
          { signal },
        ),
      () => {
        this.removing.set(null);
        this.reset();
        this.entries.reload();
      },
      "Pago esperado eliminado. Los cobros confirmados no se modificaron.",
    );
  }
}

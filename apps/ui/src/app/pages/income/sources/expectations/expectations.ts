import {
  Component,
  effect,
  inject,
  input,
  resource,
  signal,
} from "@angular/core";
import {
  type IncomeExpectation,
  type IncomeSource,
} from "@lazyfinance/contracts";
import { formatClp } from "../../../../../utils/currency";
import { RpcClient } from "../../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../../core/rpc/scoped-command";
import { EditorDrawer } from "../../../../shared/ui/editor-drawer";
import { Icon } from "../../../../shared/ui/icon";
import { ExpectationEditor } from "./expectation-editor";

@Component({
  selector: "income-expectations",
  imports: [EditorDrawer, ExpectationEditor, Icon],
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
  protected readonly command = createScopedCommand(() => this.source().id);
  protected readonly editing = signal<IncomeExpectation | null>(null);
  protected readonly removing = signal<IncomeExpectation | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly money = formatClp;

  constructor() {
    effect(() => {
      this.rpc.authenticatedScope();
      this.source();
      this.reset();
      this.removing.set(null);
      this.message.set(null);
    });
  }

  protected fresh() {
    this.editing.set(null);
    this.message.set(null);
    this.command.clear();
    this.editorOpen.set(true);
  }

  protected edit(entry: IncomeExpectation) {
    this.editing.set(entry);
    this.message.set(null);
    this.command.clear();
    this.editorOpen.set(true);
  }

  protected reset() {
    this.editing.set(null);
    this.editorOpen.set(false);
  }

  protected saved() {
    this.message.set(
      "Pago esperado guardado. No se ha confirmado ningún ingreso.",
    );
    this.reset();
    this.entries.reload();
  }

  protected remove() {
    const entry = this.removing();
    if (!entry) return;
    this.message.set(null);
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

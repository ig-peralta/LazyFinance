import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  type BudgetDetail,
  CreateBudgetInputSchema,
  UpdateBudgetInputSchema,
} from "@lazyfinance/contracts";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { ObjectiveFieldsView } from "./objective-fields";
import { objectiveFields, objectiveInput } from "./objective-form";

@Component({
  selector: "budget-editor",
  imports: [FormsModule, ObjectiveFieldsView],
  templateUrl: "./budget-editor.html",
})
export class BudgetEditor {
  readonly detail = input<BudgetDetail | null>(null);
  readonly saved = output<BudgetDetail>();
  protected readonly definition = computed(
    () => this.detail()?.pending ?? this.detail()?.effective ?? null,
  );
  protected readonly started = computed(() => {
    const definition = this.detail()?.effective ?? this.detail()?.pending;
    return (
      !!definition?.startDate && Date.parse(definition.startDate) <= Date.now()
    );
  });
  protected readonly unsupported = computed(() => {
    const value = this.definition();
    return (
      !!value &&
      (value.kind !== "time_based" ||
        (value.isRecurring &&
          value.period !== "monthly" &&
          value.period !== "yearly"))
    );
  });
  protected readonly locked = computed(
    () =>
      !!this.detail()?.archivedAt ||
      this.unsupported() ||
      (this.started() && !this.definition()?.isRecurring),
  );
  protected fields = objectiveFields();
  protected readonly command = createScopedCommand();
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.fields = objectiveFields(this.definition());
      this.error.set(null);
    });
  }

  protected save() {
    if (this.locked()) return;
    this.error.set(null);
    const detail = this.detail(),
      fields = objectiveInput(this.fields);
    if (!detail) {
      const parsed = CreateBudgetInputSchema.safeParse(fields);
      if (!parsed.success) {
        this.invalid();
        return;
      }
      void this.command.run(
        (scope, signal) =>
          scope.client.objectives.createBudget.mutate(parsed.data, { signal }),
        (result) => this.saved.emit(result),
      );
    } else {
      const { schedule: _, ...definition } = fields;
      const parsed = UpdateBudgetInputSchema.safeParse({
        id: detail.id,
        expectedVersion: detail.version,
        budget: {
          ...definition,
          ...(!this.started() ? { schedule: fields.schedule } : {}),
        },
      });
      if (!parsed.success) {
        this.invalid();
        return;
      }
      void this.command.run(
        (scope, signal) =>
          scope.client.objectives.updateBudget.mutate(parsed.data, { signal }),
        (result) => this.saved.emit(result),
      );
    }
  }

  private invalid() {
    this.error.set(
      "Revisa nombre, monto positivo, al menos una etiqueta y fechas alineadas. Los recurrentes nuevos empiezan en el período actual o uno futuro; las fechas fijas deben estar ordenadas.",
    );
  }
}

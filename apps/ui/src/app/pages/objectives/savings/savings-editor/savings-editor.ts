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
  CreateSavingsGoalSchema,
  type SavingsGoal,
  UpdateSavingsGoalSchema,
} from "@lazyfinance/contracts";
import { createScopedCommand } from "../../../../core/rpc/scoped-command";
import { ObjectiveFieldsView } from "../../forms/objective-fields";
import {
  type ObjectiveFields,
  objectiveFields,
  objectiveInput,
} from "../../forms/objective-form";

@Component({
  selector: "savings-editor",
  imports: [FormsModule, ObjectiveFieldsView],
  templateUrl: "./savings-editor.html",
})
export class SavingsEditor {
  readonly goal = input<SavingsGoal | null>(null);
  readonly saved = output<SavingsGoal>();
  protected readonly command = createScopedCommand();
  protected readonly error = signal<string | null>(null);
  protected readonly unsupported = computed(() => {
    const goal = this.goal();
    return (
      !!goal &&
      goal.kind === "time_based" &&
      goal.isRecurring &&
      goal.period !== "monthly" &&
      goal.period !== "yearly"
    );
  });
  protected fields: ObjectiveFields = {
    ...objectiveFields(),
    period: "lifetime",
  };

  constructor() {
    effect(() => {
      const goal = this.goal();
      this.fields = goal
        ? objectiveFields(goal)
        : { ...objectiveFields(), period: "lifetime" };
      this.error.set(null);
    });
  }

  protected save() {
    const goal = this.goal();
    if (goal?.archivedAt || this.unsupported()) return;
    const parsed = CreateSavingsGoalSchema.safeParse(
      objectiveInput(this.fields),
    );
    if (!parsed.success) {
      this.error.set(
        "Revisa nombre, monto positivo con hasta 2 decimales, al menos una etiqueta y fechas válidas. Los meses comienzan el día 1; los años el 1 de enero.",
      );
      return;
    }
    this.error.set(null);
    if (goal) {
      const update = UpdateSavingsGoalSchema.parse({
        id: goal.id,
        expectedVersion: goal.version,
        goal: parsed.data,
      });
      void this.command.run(
        (scope, signal) =>
          scope.client.objectives.updateSavingsGoal.mutate(update, { signal }),
        (result) => this.saved.emit(result),
      );
    } else
      void this.command.run(
        (scope, signal) =>
          scope.client.objectives.createSavingsGoal.mutate(parsed.data, {
            signal,
          }),
        (result) => this.saved.emit(result),
      );
  }
}

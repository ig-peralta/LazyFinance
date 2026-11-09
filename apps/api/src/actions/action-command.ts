import { FinancialActionRequestSchema } from "@lazyfinance/contracts";
import { FinancialActionCommandSchema } from "@lazyfinance/contracts/internal";
import { budgetSchedule } from "../objectives/budget-policy";
import { savingsDefinition } from "../objectives/savings-goals.service";
import { fromCents, toCents } from "../utils/money";

export function actionRequest(value: unknown) {
  const action = FinancialActionRequestSchema.parse(value);
  if (action.kind === "create_budget")
    action.budget.amount = fromCents(toCents(action.budget.amount));
  if (action.kind === "create_savings_goal")
    action.goal.amount = fromCents(toCents(action.goal.amount));
  return action;
}

/** Reuse the same money/schedule policies as ordinary app commands. */
export function actionCommand(value: unknown, now = new Date()) {
  const action = actionRequest(value);
  if (action.kind === "create_budget") {
    const { newTags, schedule, ...budget } = action.budget;
    return {
      action,
      command: FinancialActionCommandSchema.parse({
        kind: action.kind,
        definition: { ...budget, newTags, ...budgetSchedule(schedule, now) },
      }),
    };
  }
  if (action.kind === "create_savings_goal") {
    const { newTags, ...goal } = action.goal;
    return {
      action,
      command: FinancialActionCommandSchema.parse({
        kind: action.kind,
        definition: { ...savingsDefinition(goal), newTags },
      }),
    };
  }
  return { action, command: FinancialActionCommandSchema.parse(action) };
}

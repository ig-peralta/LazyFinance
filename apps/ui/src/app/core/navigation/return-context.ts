import type { ParamMap, Params } from "@angular/router";
import {
  BudgetContributionsInputSchema,
  MonthSchema,
} from "@lazyfinance/contracts";

interface MovementReturn {
  path: string;
  label: string;
  queryParams: Params;
}

const ledgerKeys = [
  "account",
  "from",
  "before",
  "tag",
  "direction",
  "internal",
  "merchant",
] as const;

/** Fixed app destinations only. Evidence context must never become ledger filters. */
export function movementReturn(query: ParamMap): MovementReturn {
  const fallback: MovementReturn = {
    path: "/movimientos",
    label: "Volver a movimientos",
    queryParams: {},
  };
  const kind = query.get("returnTo");
  if (kind === "budget-evidence") {
    const parsed = BudgetContributionsInputSchema.safeParse({
      id: query.get("budget"),
      revisionId: query.get("revision"),
      month: query.get("month") ?? undefined,
      asOf: query.get("asOf") ?? undefined,
      adjustmentsAsOf: query.get("adjustmentsAsOf") ?? undefined,
    });
    if (!parsed.success) return fallback;
    const input = parsed.data;
    const reported = query.get("reported");
    return {
      path: `/presupuestos/${input.id}/movimientos`,
      label: "Volver al detalle del presupuesto",
      queryParams: {
        revision: input.revisionId,
        ...(input.month ? { month: input.month } : {}),
        ...(input.asOf ? { asOf: input.asOf } : {}),
        ...(input.adjustmentsAsOf
          ? { adjustmentsAsOf: input.adjustmentsAsOf }
          : {}),
        ...(reported && /^-?\d{1,24}(?:\.\d{1,2})?$/.test(reported)
          ? { reported }
          : {}),
      },
    };
  }
  if (kind === "income") {
    const month = query.get("month");
    if (month !== null && !MonthSchema.safeParse(month).success)
      return fallback;
    return {
      path: "/ingresos",
      label: "Volver a ingresos",
      queryParams: month ? { month } : {},
    };
  }
  if (kind !== null) return fallback;
  for (const key of ledgerKeys) {
    const value = query.get(key);
    if (value !== null && value.length <= 256)
      fallback.queryParams[key] = value;
  }
  return fallback;
}

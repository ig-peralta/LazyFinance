import type { ObjectiveSummary } from "@lazyfinance/contracts";
import { decimalInput } from "../../../utils/currency";
import { santiagoDate } from "../../../utils/date";
import { currentMonth } from "../../../utils/month";

export interface ObjectiveFields {
  name: string;
  amount: string;
  tagIds: string[];
  period: "monthly" | "yearly" | "fixed" | "lifetime";
  start: string;
  end: string;
}

function previousDate(value: string): string {
  const day = new Date(`${value}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function objectiveFields(
  value?: Omit<ObjectiveSummary, "intent"> | null,
): ObjectiveFields {
  return {
    name: value?.name ?? "",
    amount: value?.amount ?? "",
    tagIds: value?.tags.map((tag) => tag.id) ?? [],
    period:
      value?.kind === "amount_based"
        ? "lifetime"
        : value?.isRecurring &&
            (value.period === "monthly" || value.period === "yearly")
          ? value.period
          : value?.startDate && value.endDate
            ? "fixed"
            : "monthly",
    start: value?.startDate
      ? santiagoDate(new Date(value.startDate))
      : `${currentMonth()}-01`,
    end: value?.endDate
      ? previousDate(santiagoDate(new Date(value.endDate)))
      : "",
  };
}

export function objectiveInput(fields: ObjectiveFields) {
  return {
    name: fields.name,
    amount: decimalInput(fields.amount),
    tagIds: fields.tagIds,
    schedule:
      fields.period === "lifetime"
        ? { period: "lifetime" }
        : fields.period === "fixed"
          ? { period: "fixed", startDate: fields.start, endDate: fields.end }
          : { period: fields.period, startDate: fields.start },
  };
}

export function objectivePeriod(value: ObjectiveSummary): string {
  if (value.kind === "amount_based") return "Acumulada, sin reinicio";
  if (value.isRecurring)
    return value.period === "monthly"
      ? "Cada mes"
      : value.period === "yearly"
        ? "Cada año"
        : "Período no editable";
  return "Fechas definidas";
}

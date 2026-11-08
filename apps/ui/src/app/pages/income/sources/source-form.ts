import {
  type IncomeSource,
  IncomeSourceInputSchema,
} from "@lazyfinance/contracts";
import { decimalInput } from "../../../../utils/currency";
import { santiagoDate } from "../../../../utils/date";

export function sourceFields(source: IncomeSource | null = null) {
  const schedule = source?.schedule;
  return {
    name: source?.name ?? "",
    regularity: source?.regularity ?? "regular",
    amountKind: source?.amountKind ?? "fixed",
    amount: source?.expectedAmount ?? "",
    start: source?.startDate ?? santiagoDate(),
    end: source?.endDate ?? "",
    frequency: schedule?.frequency ?? "monthly",
    day: String(schedule?.frequency === "monthly" ? schedule.day : 30),
    firstDay: String(
      schedule?.frequency === "twice_monthly" ? schedule.days[0] : 15,
    ),
    secondDay: String(
      schedule?.frequency === "twice_monthly" ? schedule.days[1] : "last",
    ),
    anchor:
      schedule && "anchorDate" in schedule
        ? schedule.anchorDate
        : santiagoDate(),
  };
}

export function sourceInput(fields: ReturnType<typeof sourceFields>) {
  const day = (value: string) => (value === "last" ? "last" : Number(value));
  const schedule =
    fields.regularity === "irregular"
      ? null
      : fields.frequency === "monthly"
        ? { frequency: fields.frequency, day: day(fields.day) }
        : fields.frequency === "twice_monthly"
          ? {
              frequency: fields.frequency,
              days: [day(fields.firstDay), day(fields.secondDay)],
            }
          : { frequency: fields.frequency, anchorDate: fields.anchor };
  return IncomeSourceInputSchema.safeParse({
    name: fields.name,
    currency: "CLP",
    regularity: fields.regularity,
    amountKind: fields.amountKind,
    expectedAmount: fields.amount.trim() ? decimalInput(fields.amount) : null,
    schedule,
    startDate: fields.start,
    endDate: fields.end || null,
  });
}

export function scheduleLabel(source: IncomeSource): string {
  const schedule = source.schedule;
  if (!schedule) return "Pagos puntuales";
  if (schedule.frequency === "weekly") return "Cada semana";
  if (schedule.frequency === "every_two_weeks") return "Cada 14 días";
  const day = (value: number | "last") =>
    value === "last" ? "último día" : `día ${value}`;
  if (schedule.frequency === "monthly") return `Mensual · ${day(schedule.day)}`;
  if (schedule.frequency === "twice_monthly")
    return `Dos veces al mes · ${day(schedule.days[0])} y ${day(schedule.days[1])}`;
  return "Calendario regular";
}

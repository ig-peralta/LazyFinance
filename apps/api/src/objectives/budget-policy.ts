import type {
  BudgetRevision,
  BudgetScheduleInput,
} from "@lazyfinance/contracts";
import { TRPCError } from "@trpc/server";
import { monthBounds } from "../utils/period";
import { santiagoMonth } from "../utils/santiago-time";
import { objectiveLocalTime } from "./objective-time";

export function budgetSchedule(schedule: BudgetScheduleInput, now: Date) {
  if (schedule.period !== "fixed") {
    const current =
      schedule.period === "monthly"
        ? `${santiagoMonth(now)}-01`
        : `${santiagoMonth(now).slice(0, 4)}-01-01`;
    if (schedule.startDate < current)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Recurring budgets must start in the current or a future period",
      });
  }

  let endDate: string | null = null;
  if (schedule.period === "fixed") {
    const next = new Date(`${schedule.endDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.getUTCFullYear() > 9999)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Budget end is out of range",
      });

    endDate = `${next.toISOString().slice(0, 10)} 00:00:00`;
  }

  return {
    isRecurring: schedule.period !== "fixed",
    period: schedule.period === "fixed" ? null : schedule.period,
    startDate: `${schedule.startDate} 00:00:00`,
    endDate,
  };
}

export function nextBudgetRevision(current: BudgetRevision, now: Date) {
  if (
    current.kind !== "time_based" ||
    !current.isRecurring ||
    !["monthly", "yearly"].includes(current.period ?? "")
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Started fixed or unsupported budgets cannot be changed",
    });

  const month = santiagoMonth(now);
  const effectiveFrom =
    current.period === "monthly"
      ? monthBounds(month).end
      : `${Number(month.slice(0, 4)) + 1}-01-01 00:00:00`;
  if (
    current.endDate &&
    objectiveLocalTime(current.endDate) <= objectiveLocalTime(effectiveFrom)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Budget ends before the next recurring period",
    });

  return effectiveFrom;
}

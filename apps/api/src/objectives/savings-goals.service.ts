import {
  type CreateSavingsGoal,
  CreateSavingsGoalSchema,
  type SavingsGoalVersion,
  type SavingsHistoryInput,
  UpdateSavingsGoalSchema,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { parseInput } from "../validation/parse-input";

export function savingsDefinition(input: CreateSavingsGoal) {
  const { schedule, ...fields } = input;
  const money = { ...fields, amount: fromCents(toCents(fields.amount)) };
  if (schedule.period === "lifetime")
    return {
      ...money,
      kind: "amount_based" as const,
      isRecurring: null,
      period: null,
      startDate: null,
      endDate: null,
    };
  let endDate: string | null = null;
  if (schedule.period === "fixed") {
    const next = new Date(`${schedule.endDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.getUTCFullYear() > 9999)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Savings end is out of range",
      });
    endDate = `${next.toISOString().slice(0, 10)} 00:00:00`;
  }
  return {
    ...money,
    kind: "time_based" as const,
    isRecurring: schedule.period !== "fixed",
    period: schedule.period === "fixed" ? null : schedule.period,
    startDate: `${schedule.startDate} 00:00:00`,
    endDate,
  };
}

@Injectable()
export class SavingsGoalsService {
  constructor(private readonly persistence: PersistenceClient) {}

  detail(userId: string, id: string) {
    return this.persistence.user(userId).objectives.savingsGoal.query({ id });
  }

  history(userId: string, input: SavingsHistoryInput) {
    return this.persistence
      .user(userId)
      .objectives.savingsGoalHistory.query(input);
  }

  create(userId: string, value: unknown) {
    return this.persistence.user(userId).objectives.createSavingsGoal.mutate({
      goal: savingsDefinition(
        parseInput(CreateSavingsGoalSchema, value, "Invalid savings goal"),
      ),
    });
  }

  update(userId: string, value: unknown) {
    const input = parseInput(
      UpdateSavingsGoalSchema,
      value,
      "Invalid savings goal",
    );
    return this.persistence.user(userId).objectives.updateSavingsGoal.mutate({
      id: input.id,
      expectedVersion: input.expectedVersion,
      goal: savingsDefinition(input.goal),
    });
  }

  archive(userId: string, input: SavingsGoalVersion) {
    return this.persistence
      .user(userId)
      .objectives.archiveSavingsGoal.mutate(input);
  }
}

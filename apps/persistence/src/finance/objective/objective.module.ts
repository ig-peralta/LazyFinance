import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { SavingsGoalRepository } from "../savings-goal/savings-goal.repository";
import { SavingsReadRepository } from "../savings-goal/savings-read.repository";
import { BudgetRepository } from "./budget.repository";
import { ObjectiveRepository } from "./objective.repository";
import { ObjectiveRpc } from "./objective.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [
    ObjectiveRepository,
    BudgetRepository,
    SavingsGoalRepository,
    SavingsReadRepository,
    ObjectiveRpc,
  ],
})
export class ObjectiveModule {}

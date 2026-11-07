import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { BudgetRepository } from "./budget.repository";
import { ObjectiveRepository } from "./objective.repository";
import { ObjectiveRpc } from "./objective.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [ObjectiveRepository, BudgetRepository, ObjectiveRpc],
})
export class ObjectiveModule {}

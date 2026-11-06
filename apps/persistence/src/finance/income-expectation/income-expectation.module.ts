import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { IncomeSourceModule } from "../income-source/income-source.module";
import { IncomeExpectationRepository } from "./income-expectation.repository";
import { IncomeExpectationRpc } from "./income-expectation.rpc";

@Module({
  imports: [DatabaseModule, IncomeSourceModule],
  providers: [IncomeExpectationRepository, IncomeExpectationRpc],
})
export class IncomeExpectationModule {}

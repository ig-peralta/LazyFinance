import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TransactionModule } from "../transaction/transaction.module";
import { IncomeSourceRepository } from "./income-source.repository";
import { IncomeSourceRpc } from "./income-source.rpc";

@Module({
  imports: [DatabaseModule, TransactionModule],
  providers: [IncomeSourceRepository, IncomeSourceRpc],
  exports: [IncomeSourceRepository],
})
export class IncomeSourceModule {}

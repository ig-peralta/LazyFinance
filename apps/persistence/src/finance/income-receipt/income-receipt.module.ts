import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { IncomeSourceModule } from "../income-source/income-source.module";
import { IncomeReceiptRepository } from "./income-receipt.repository";
import { IncomeReceiptRpc } from "./income-receipt.rpc";

@Module({
  imports: [DatabaseModule, IncomeSourceModule],
  providers: [IncomeReceiptRepository, IncomeReceiptRpc],
})
export class IncomeReceiptModule {}

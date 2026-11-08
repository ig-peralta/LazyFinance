import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExpenseAdjustmentRepository } from "../expense-adjustment/expense-adjustment.repository";
import { InternalMovementRepository } from "./internal-movement.repository";
import { TransactionRepository } from "./transaction.repository";
import { TransactionRpc } from "./transaction.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [
    TransactionRepository,
    InternalMovementRepository,
    ExpenseAdjustmentRepository,
    TransactionRpc,
  ],
  exports: [TransactionRepository],
})
export class TransactionModule {}

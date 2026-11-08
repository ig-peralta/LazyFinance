import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExpenseAdjustmentRepository } from "../expense-adjustment/expense-adjustment.repository";
import { SpendingEvidenceModule } from "../spending-evidence/spending-evidence.module";
import { InternalMovementRepository } from "./internal-movement.repository";
import { TransactionRepository } from "./transaction.repository";
import { TransactionRpc } from "./transaction.rpc";

@Module({
  imports: [DatabaseModule, SpendingEvidenceModule],
  providers: [
    TransactionRepository,
    InternalMovementRepository,
    ExpenseAdjustmentRepository,
    TransactionRpc,
  ],
  exports: [TransactionRepository],
})
export class TransactionModule {}

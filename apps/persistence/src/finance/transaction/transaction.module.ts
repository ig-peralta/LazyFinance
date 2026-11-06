import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TransactionRepository } from "./transaction.repository";
import { TransactionRpc } from "./transaction.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [TransactionRepository, TransactionRpc],
  exports: [TransactionRepository],
})
export class TransactionModule {}

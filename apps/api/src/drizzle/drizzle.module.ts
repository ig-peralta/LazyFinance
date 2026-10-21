import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE_PG_CLIENT } from "./drizzle.tokens";
import { AccountRepository } from './repositories/account.repository';
import { ObjectiveRepository } from './repositories/objective.repository';
import { TagRepository } from './repositories/tag.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { UserRepository } from './repositories/user.repository';
import { IncomeRepository } from './repositories/income.repository';

@Module({
  exports: [
    DRIZZLE_PG_CLIENT,
    AccountRepository,
    ObjectiveRepository,
    TagRepository,
    TransactionRepository,
    UserRepository,
    IncomeRepository,
  ],
  providers: [...drizzleProvider, AccountRepository, ObjectiveRepository, TagRepository, TransactionRepository, UserRepository, IncomeRepository],
})
export class DrizzleModule {}

import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE_PG_CLIENT } from "./drizzle.tokens";
import { AccountRepository } from './repositories/account.repository';
import { TagRepository } from './repositories/tag.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  exports: [
    DRIZZLE_PG_CLIENT,
    AccountRepository,
    TagRepository,
    TransactionRepository,
    UserRepository,
  ],
  providers: [...drizzleProvider, AccountRepository, TagRepository, TransactionRepository, UserRepository],
})
export class DrizzleModule {}

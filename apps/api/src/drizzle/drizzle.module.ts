import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE_PG_CLIENT } from "./drizzle.tokens";
import { AccountRepository } from './repositories/account.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  exports: [
    DRIZZLE_PG_CLIENT,
    AccountRepository,
    UserRepository,
  ],
  providers: [...drizzleProvider, AccountRepository, UserRepository],
})
export class DrizzleModule {}

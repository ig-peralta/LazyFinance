import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE_PG_CLIENT } from "./drizzle.tokens";
import { UserRepository } from './repositories/user.repository';

@Module({
  exports: [
    DRIZZLE_PG_CLIENT,
    UserRepository,
  ],
  providers: [...drizzleProvider, UserRepository],
})
export class DrizzleModule {}

import { Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE_PG_CLIENT } from "./drizzle.tokens";

@Module({
  exports: [
    DRIZZLE_PG_CLIENT,
  ],
  providers: drizzleProvider,
})
export class DrizzleModule {}

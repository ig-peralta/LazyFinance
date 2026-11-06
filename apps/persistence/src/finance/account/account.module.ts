import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AccountRepository } from "./account.repository";
import { AccountRpc } from "./account.rpc";
import { AccountService } from "./account.service";

@Module({
  imports: [DatabaseModule],
  providers: [AccountRepository, AccountService, AccountRpc],
})
export class AccountModule {}

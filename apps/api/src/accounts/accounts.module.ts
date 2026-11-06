import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module";
import { AccountsMcpController } from "./accounts.mcp";
import { AccountsRpc } from "./accounts.rpc";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [PersistenceModule],
  controllers: [AccountsMcpController],
  providers: [AccountsService, AccountsRpc],
})
export class AccountsModule {}

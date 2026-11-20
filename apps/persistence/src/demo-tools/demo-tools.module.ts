import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DemoToolsRpc } from "./demo-tools.rpc";
import { DemoToolsService } from "./demo-tools.service";

@Module({
  imports: [DatabaseModule],
  providers: [DemoToolsRpc, DemoToolsService],
})
export class DemoToolsModule {}

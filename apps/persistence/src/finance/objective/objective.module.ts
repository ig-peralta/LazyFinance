import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ObjectiveRepository } from "./objective.repository";
import { ObjectiveRpc } from "./objective.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [ObjectiveRepository, ObjectiveRpc],
})
export class ObjectiveModule {}

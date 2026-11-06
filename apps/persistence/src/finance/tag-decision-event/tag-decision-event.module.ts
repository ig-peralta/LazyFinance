import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TagDecisionEventRepository } from "./tag-decision-event.repository";

@Module({
  imports: [DatabaseModule],
  providers: [TagDecisionEventRepository],
  exports: [TagDecisionEventRepository],
})
export class TagDecisionEventModule {}

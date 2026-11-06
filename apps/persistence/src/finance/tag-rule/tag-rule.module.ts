import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { TagDecisionEventModule } from "../tag-decision-event/tag-decision-event.module";
import { TagRuleRepository } from "./tag-rule.repository";
import { TagRuleRpc } from "./tag-rule.rpc";

@Module({
  imports: [DatabaseModule, TagDecisionEventModule],
  providers: [TagRuleRepository, TagRuleRpc],
  exports: [TagRuleRepository],
})
export class TagRuleModule {}

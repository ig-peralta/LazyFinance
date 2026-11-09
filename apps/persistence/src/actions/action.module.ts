import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ObjectiveModule } from "../finance/objective/objective.module";
import { TagModule } from "../finance/tag/tag.module";
import { TagRuleModule } from "../finance/tag-rule/tag-rule.module";
import { ActionRepository } from "./action.repository";
import { FinancialActionsRpc } from "./action.rpc";
import { ActionExecutor } from "./action-executor";
import { ActionFactsRepository } from "./action-facts.repository";

@Module({
  imports: [DatabaseModule, ObjectiveModule, TagModule, TagRuleModule],
  providers: [
    ActionExecutor,
    ActionFactsRepository,
    ActionRepository,
    FinancialActionsRpc,
  ],
  exports: [ActionRepository],
})
export class ActionModule {}

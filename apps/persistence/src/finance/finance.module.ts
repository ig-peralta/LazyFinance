import { Module } from "@nestjs/common";
import { AccountModule } from "./account/account.module";
import { IncomeExpectationModule } from "./income-expectation/income-expectation.module";
import { IncomeReceiptModule } from "./income-receipt/income-receipt.module";
import { IncomeSourceModule } from "./income-source/income-source.module";
import { ObjectiveModule } from "./objective/objective.module";
import { ProviderConnectionModule } from "./provider-connection/provider-connection.module";
import { TagModule } from "./tag/tag.module";
import { TagRuleModule } from "./tag-rule/tag-rule.module";
import { TransactionModule } from "./transaction/transaction.module";

@Module({
  imports: [
    AccountModule,
    TransactionModule,
    ObjectiveModule,
    TagModule,
    IncomeSourceModule,
    IncomeExpectationModule,
    IncomeReceiptModule,
    TagRuleModule,
    ProviderConnectionModule,
  ],
})
export class FinanceModule {}

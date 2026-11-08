import type { AccountTables } from "./account/account.tables";
import type { BudgetRevisionTables } from "./budget-revision/budget-revision.tables";
import type { BudgetRevisionTagTables } from "./budget-revision-tag/budget-revision-tag.tables";
import type { ExpenseAdjustmentTables } from "./expense-adjustment/expense-adjustment.tables";
import type { IncomeExpectationTables } from "./income-expectation/income-expectation.tables";
import type { IncomeReceiptTables } from "./income-receipt/income-receipt.tables";
import type { IncomeSourceTables } from "./income-source/income-source.tables";
import type { ObjectiveTables } from "./objective/objective.tables";
import type { ObjectiveTagTables } from "./objective-tag/objective-tag.tables";
import type { ProviderTables } from "./provider/provider.tables";
import type { ProviderConnectionTables } from "./provider-connection/provider-connection.tables";
import type { ProviderLinkTables } from "./provider-link/provider-link.tables";
import type { ProviderMovementConflictTables } from "./provider-movement-conflict/provider-movement-conflict.tables";
import type { ProviderMovementRemovalTables } from "./provider-movement-removal/provider-movement-removal.tables";
import type { ProviderSyncStateTables } from "./provider-sync-state/provider-sync-state.tables";
import type { SavingsGoalTables } from "./savings-goal/savings-goal.tables";
import type { TagTables } from "./tag/tag.tables";
import type { TagDecisionEventTables } from "./tag-decision-event/tag-decision-event.tables";
import type { TagRuleTables } from "./tag-rule/tag-rule.tables";
import type { TransactionTables } from "./transaction/transaction.tables";

export type FinanceTables = AccountTables &
  SavingsGoalTables &
  ExpenseAdjustmentTables &
  BudgetRevisionTables &
  BudgetRevisionTagTables &
  ProviderTables &
  ProviderConnectionTables &
  ProviderLinkTables &
  TransactionTables &
  TagTables &
  TagRuleTables &
  TagDecisionEventTables &
  ObjectiveTables &
  ObjectiveTagTables &
  IncomeSourceTables &
  IncomeExpectationTables &
  IncomeReceiptTables &
  ProviderSyncStateTables &
  ProviderMovementRemovalTables &
  ProviderMovementConflictTables;

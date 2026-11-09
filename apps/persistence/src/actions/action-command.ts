import type { FinancialActionRequest } from "@lazyfinance/contracts";
import type { FinancialActionCommand } from "@lazyfinance/contracts/internal";
import { TRPCError } from "@trpc/server";
import { fingerprint } from "../database/fingerprint";

/** API owns calendar normalization; targets, values and dependent writes must
 * still match the proposal used for preview and permission checks. */
export function assertActionSelection(
  action: FinancialActionRequest,
  command: FinancialActionCommand,
) {
  let matches = false;
  if (action.kind === "create_budget" && command.kind === "create_budget") {
    const { schedule, ...selection } = action.budget;
    const { name, amount, tagIds, newTags } = command.definition;
    matches =
      fingerprint(selection) === fingerprint({ name, amount, tagIds, newTags });
  } else if (
    action.kind === "create_savings_goal" &&
    command.kind === "create_savings_goal"
  ) {
    const { schedule, ...selection } = action.goal;
    const { name, amount, tagIds, newTags } = command.definition;
    matches =
      fingerprint(selection) === fingerprint({ name, amount, tagIds, newTags });
  } else matches = fingerprint(action) === fingerprint(command);
  if (!matches)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Command selection must match the proposal",
    });
}

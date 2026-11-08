import type { BankingImportReport } from "@lazyfinance/contracts";
import type {
  NormalizedAccountSnapshot,
  NormalizedMovement,
} from "../../connector/normalized-banking.schema";
import { FintocFailure } from "../client/fintoc-client";
import {
  type FintocAccount,
  FintocCashBalanceSchema,
  type FintocMovement,
} from "../client/fintoc-snapshot.schema";

type SkippedAccount = BankingImportReport["skippedAccounts"][number];

export function normalizeFintocAccount(
  account: FintocAccount,
): { snapshot: NormalizedAccountSnapshot } | { skipped: SkippedAccount } {
  const skip = (reason: SkippedAccount["reason"]) => ({
    skipped: { externalId: account.id, reason },
  });
  if (account.removed_from_link) return skip("removed_from_link");
  if (account.currency !== "CLP") return skip("unsupported_currency");
  const type =
    account.type === "savings_account"
      ? "savings"
      : ["checking_account", "sight_account", "rut_account"].includes(
            account.type,
          )
        ? "checking"
        : account.type === "credit_card"
          ? "credit_card"
          : null;
  if (type === null) return skip("unsupported_type");

  let reportedBalance: NormalizedAccountSnapshot["reportedBalance"] = null;
  if (type !== "credit_card" && account.balance !== null) {
    const balance = FintocCashBalanceSchema.safeParse(account.balance);
    if (!balance.success) throw new FintocFailure("invalid_data");
    if (balance.data.current !== null)
      reportedBalance = {
        amount: `${balance.data.current}.00`,
        meaning: "cash_balance",
        asOf: account.refreshed_at,
      };
  }
  // The generic accounting amount does not document a card-liability sign.
  // In particular, available/limit must never masquerade as money or debt.
  return {
    snapshot: {
      externalId: account.id,
      type,
      currency: "CLP",
      number: account.number?.slice(0, 64) || null,
      holderName: account.holder_name?.slice(0, 120) || null,
      reportedBalance,
      historyCoverage: { completeness: "partial", from: null, through: null },
    },
  };
}

/** Only confirmed, cleared movements reach this mapper. No heuristic merchant,
 * transfer pairing, income receipt or provider correction time is invented. */
export function normalizeFintocMovement(
  accountExternalId: string,
  movement: FintocMovement,
): NormalizedMovement {
  if (
    movement.amount === 0 ||
    movement.pending ||
    movement.status !== "confirmed"
  )
    throw new FintocFailure("invalid_data");
  const holder =
    movement.type === "transfer"
      ? (movement.amount < 0
          ? movement.recipient_account
          : movement.sender_account
        )?.holder_id
      : null;
  const rut = holder?.replace(/[.\s-]/g, "").toUpperCase();
  return {
    accountExternalId,
    externalId: movement.id,
    amount: `${movement.amount}.00`,
    booked: {
      precision: "calendar_day",
      on: movement.post_date.slice(0, 10),
      timeZone: "America/Santiago",
    },
    description: movement.description?.slice(0, 240) ?? null,
    merchant: null,
    providerKind:
      movement.type === "transfer"
        ? "transfer"
        : movement.type === "other"
          ? "other"
          : "unknown",
    relatedMovement: null,
    counterpartyHolder:
      rut && /^[0-9]{7,8}[0-9K]$/.test(rut)
        ? { scheme: "cl_rut", value: rut }
        : null,
    providerUpdatedAt: null,
  };
}

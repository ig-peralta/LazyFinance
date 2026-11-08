import type {
  FintocAccount,
  FintocMovement,
} from "../../../src/banking/fintoc/client/fintoc-snapshot.schema";

export const fintocHistoryWindow = {
  from: "2026-08-11",
  through: "2026-11-08",
};

// Provider-shaped test data, not captured banking data or invented merchant
// evidence. Extra fields exercise the versioned raw boundary's forward safety.
export const fintocAccount = {
  id: "acc_checking",
  object: "account",
  type: "checking_account",
  currency: "CLP",
  number: "123456",
  holder_name: "Test Customer",
  balance: { current: 500_000, available: 450_000, limit: 900_000 },
  refreshed_at: "2026-11-08T14:00:00.000Z",
  removed_from_link: false,
} satisfies FintocAccount;

export const fintocMovement = {
  id: "mov_purchase",
  object: "movement",
  amount: -15_000,
  currency: "CLP",
  description: "COMPRA COMERCIO",
  pending: false,
  status: "confirmed",
  post_date: "2026-11-01T00:00:00.000Z",
  type: "other",
  sender_account: null,
  recipient_account: null,
} satisfies FintocMovement;

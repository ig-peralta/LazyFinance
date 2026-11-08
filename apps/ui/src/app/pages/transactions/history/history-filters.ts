import { TransactionsInputSchema } from "@lazyfinance/contracts";

export interface HistoryFields {
  account: string;
  from: string;
  before: string;
  tag: string;
  direction: string;
  internal: string;
  merchant: string;
}
export const emptyHistoryFields = (): HistoryFields => ({
  account: "",
  from: "",
  before: "",
  tag: "all",
  direction: "all",
  internal: "all",
  merchant: "",
});

export function historyMonthRange(month: string, offset = 0) {
  const [year, number] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, number - 1 + offset, 1, 12));
  const end = new Date(Date.UTC(year, number + offset, 1, 12));
  return {
    from: start.toISOString().slice(0, 10),
    before: end.toISOString().slice(0, 10),
  };
}

export function historyInput(fields: HistoryFields) {
  return TransactionsInputSchema.safeParse({
    limit: 25,
    ...(fields.account ? { accountId: fields.account } : {}),
    ...(fields.from ? { bookedFrom: fields.from } : {}),
    ...(fields.before ? { bookedBefore: fields.before } : {}),
    ...(fields.tag !== "all"
      ? { tagId: fields.tag === "untagged" ? null : fields.tag }
      : {}),
    ...(fields.direction !== "all" ? { type: fields.direction } : {}),
    ...(fields.internal !== "all"
      ? {
          isInternalMovement:
            fields.internal === "unknown"
              ? null
              : fields.internal === "internal"
                ? true
                : fields.internal === "external"
                  ? false
                  : fields.internal,
        }
      : {}),
    ...(fields.merchant.trim() ? { merchant: fields.merchant.trim() } : {}),
  });
}

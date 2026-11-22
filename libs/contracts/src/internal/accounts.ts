import { z } from "zod";
import { AccountListItemSchema } from "../accounts/account-summary.schema";

export const AccountRecordsSchema = z.array(AccountListItemSchema);

export const AccountCoverageRecordsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      historyCompleteness: z.enum(["complete", "partial", "unknown"]),
      historyFrom: z.iso.date().nullable(),
      historyThrough: z.iso.date().nullable(),
    }),
  )
  .max(1000);

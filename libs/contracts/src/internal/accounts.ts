import { z } from "zod";
import { AccountSummarySchema } from "../accounts/account-summary.schema";

export const AccountRecordsSchema = z.array(AccountSummarySchema);

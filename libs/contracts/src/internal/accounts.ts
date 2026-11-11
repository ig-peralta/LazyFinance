import { z } from "zod";
import { AccountListItemSchema } from "../accounts/account-summary.schema";

export const AccountRecordsSchema = z.array(AccountListItemSchema);

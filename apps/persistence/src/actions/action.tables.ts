import type {
  FinancialAction,
  FinancialActionRequest,
} from "@lazyfinance/contracts";
import type { FinancialActionCommand } from "@lazyfinance/contracts/internal";
import type { ColumnType, Generated } from "kysely";

export interface ActionTables {
  "assistant.action": {
    id: Generated<string>;
    userId: string;
    conversationId: string | null;
    turnId: string | null;
    origin: "assistant" | "mcp";
    requestId: string;
    grantId: string | null;
    clientId: string | null;
    version: Generated<number>;
    request: ColumnType<FinancialActionRequest, string, string>;
    command: ColumnType<FinancialActionCommand, string, string>;
    context: ColumnType<FinancialAction["context"], string, string>;
    fingerprint: string;
    status: "proposed" | "applied" | "cancelled" | "stale";
    results: ColumnType<FinancialAction["results"], string | undefined, string>;
    createdAt: Generated<Date>;
    expiresAt: Generated<Date>;
  };
}

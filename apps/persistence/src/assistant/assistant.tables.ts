import type { AssistantTurn } from "@lazyfinance/contracts";
import type { ColumnType, Generated } from "kysely";

export interface AssistantTables {
  "assistant.conversation": {
    id: Generated<string>;
    userId: string;
    title: Generated<string>;
    turns: ColumnType<AssistantTurn[], string | undefined, string>;
    lease: string | null;
    leaseExpiresAt: Date | null;
    createdAt: Generated<Date>;
    updatedAt: Generated<Date>;
    expiresAt: Generated<Date>;
  };
}

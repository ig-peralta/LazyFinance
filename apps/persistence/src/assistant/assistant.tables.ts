import type {
  AssistantConsentDecision,
  AssistantTurn,
} from "@lazyfinance/contracts";
import type { ColumnType, Generated } from "kysely";

export interface AssistantTables {
  "assistant.processing_consent": {
    userId: string;
    policyKey: string;
    decision: AssistantConsentDecision;
    revision: number;
    decidedAt: Date;
  };
  "assistant.conversation": {
    id: Generated<string>;
    mode: Generated<"text" | "voice">;
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

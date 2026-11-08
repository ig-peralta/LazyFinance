import type {
  BudgetRevision,
  IncomeExpectation,
  ObjectiveSummary,
  SavingsRevision,
  TagSummary,
} from "@lazyfinance/contracts";
import type {
  IncomeSourceRecord,
  ProviderAccountRecord,
  ProviderConflictReasonSchema,
  ProviderSyncFacts,
  TagRuleRecord,
  TransactionRecord,
} from "@lazyfinance/contracts/internal";
import { Pool, types } from "pg";
import type { z } from "zod";

types.setTypeParser(1082, (value) => value);

// Owner-fixture shapes stay app-local. Reuse shared facts, not another app's
// database implementation; timestamp and SQL-column adaptation belongs here.
interface FixtureTables {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  external_identity: {
    provider: string;
    issuer: string;
    providerSubject: string;
    userId: string;
    createdAt: string;
  };
  provider: { id: string; identifier: string; createdAt: string };
  provider_connection: {
    id: string;
    userId: string;
    providerId: string;
    metadata: Record<string, unknown>;
    status: "active" | "revoked" | "expired";
    mode: "test" | "live" | null;
    externalId: string | null;
    encryptedCredential: string | null;
    credentialVersion: number;
    holderType: "individual" | "business" | null;
    institutionId: string | null;
    institutionName: string | null;
    disconnectedAt: string | null;
    disconnectPending: boolean;
    createdAt: string;
    updatedAt: string;
  };
  provider_link_intent: {
    id: string;
    userId: string;
    providerIntentId: string;
    mode: "test" | "live";
    holderType: "individual" | "business";
    connectionId: string | null;
    expectedVersion: number | null;
    state: "pending" | "processing" | "completed" | "failed";
    exchangeTokenHash: string | null;
    completedConnectionId: string | null;
    createdAt: string;
    expiresAt: string;
  };
  account: ProviderAccountRecord;
  transaction: TransactionRecord;
  tag: TagSummary & {
    userId: string;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
  };
  tag_rule: TagRuleRecord;
  tag_decision_event: {
    id: string;
    userId: string;
    transactionId: string;
    previousTagId: string | null;
    tagId: string | null;
    ruleId: string | null;
    kind:
      | "manual_tag"
      | "manual_no_tag"
      | "reset"
      | "rule_applied"
      | "rule_revalidated";
    createdAt: string;
  };
  objective: Omit<ObjectiveSummary, "tags" | "startDate" | "endDate"> & {
    userId: string;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: string;
    updatedAt: string;
    budgetVersion: number;
    goalVersion: number;
    archivedAt: Date | null;
  };
  objective_tag: { objectiveId: string; tagId: string };
  budget_revision: Omit<
    BudgetRevision,
    "budgetId" | "tags" | "startDate" | "endDate" | "effectiveFrom"
  > & {
    objectiveId: string;
    startDate: Date | null;
    endDate: Date | null;
    effectiveFrom: Date;
  };
  budget_revision_tag: { revisionId: string; tagId: string };
  savings_revision: Omit<
    SavingsRevision,
    "goalId" | "tags" | "startDate" | "endDate"
  > & { objectiveId: string; startDate: Date | null; endDate: Date | null };
  savings_revision_tag: { revisionId: string; tagId: string };
  expense_adjustment: {
    id: string;
    creditTransactionId: string;
    purchaseTransactionId: string;
    kind: "refund" | "reimbursement";
    amount: string;
    creditAmount: string;
    purchaseAmount: string;
    creditBookedAt: Date;
    purchaseBookedAt: Date;
    confirmedAt: string;
  };
  income_source: IncomeSourceRecord;
  income_expectation: IncomeExpectation;
  income_receipt: {
    transactionId: string;
    sourceId: string;
    confirmedAt: string;
  };
  provider_sync_state: ProviderSyncFacts["state"];
  provider_movement_removal: ProviderSyncFacts["removals"][number];
  provider_movement_conflict: {
    transactionId: string;
    reason: z.infer<typeof ProviderConflictReasonSchema>;
    previousFacts: Record<string, unknown>;
    incomingFacts: Record<string, unknown>;
    observedAt: string;
    resolvedAt: string | null;
  };
}

type Table = keyof FixtureTables;

type Timestamp<Value> = Value extends string ? Date : Value;

type Stored<TableName extends Table> = {
  [Column in keyof FixtureTables[TableName]]: Column extends
    | `${string}At`
    | "retryAfter"
    ? Timestamp<FixtureTables[TableName][Column]>
    : FixtureTables[TableName][Column];
};

type WriteValue<Value> = Value extends Date ? Date | string : Value;

// Defaults and deliberately inconsistent ownership remain possible for boundary
// tests, while column names, scalar types and money/date representations stay checked.
export type FixtureValues<TableName extends Table> = {
  [Column in keyof Stored<TableName>]?: WriteValue<Stored<TableName>[Column]>;
};

type SnakeCase<Name extends string> = Name extends `${infer First}${infer Rest}`
  ? `${First extends Lowercase<First> ? First : `_${Lowercase<First>}`}${SnakeCase<Rest>}`
  : Name;

export type FixtureRow<TableName extends Table> = {
  [Column in keyof Stored<TableName> as SnakeCase<
    Column & string
  >]: Stored<TableName>[Column];
};

type TableWithId = {
  [TableName in Table]: "id" extends keyof FixtureTables[TableName]
    ? TableName
    : never;
}[Table];

const schemas = {
  user: "identity",
  external_identity: "identity",
  provider: "finance",
  provider_connection: "finance",
  provider_link_intent: "finance",
  account: "finance",
  transaction: "finance",
  tag: "finance",
  tag_rule: "finance",
  tag_decision_event: "finance",
  income_source: "finance",
  income_expectation: "finance",
  income_receipt: "finance",
  objective: "finance",
  objective_tag: "finance",
  budget_revision: "finance",
  budget_revision_tag: "finance",
  savings_revision: "finance",
  savings_revision_tag: "finance",
  expense_adjustment: "finance",
  provider_sync_state: "finance",
  provider_movement_removal: "finance",
  provider_movement_conflict: "finance",
} as const satisfies Record<Table, "identity" | "finance">;

const column = (name: string) => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))
    throw new Error("Invalid fixture field");

  return `"${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}"`;
};

/** Owner SQL is restricted to disposable test fixtures, never injectable into the API. */
export class FixtureDatabase {
  readonly pool: Pool;

  constructor() {
    const url = process.env.TEST_POSTGRES_OWNER_URL;
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("A disposable database ending in _test is required");

    this.pool = new Pool({ connectionString: url, max: 2 });
  }

  private table(table: Table) {
    return `"${schemas[table]}"."${table}"`;
  }

  async insert<TableName extends Table>(
    table: TableName,
    value: FixtureValues<NoInfer<TableName>>,
  ): Promise<FixtureRow<TableName>> {
    const names = Object.keys(value);
    return (
      await this.pool.query<FixtureRow<TableName>>(
        `INSERT INTO ${this.table(table)} (${names.map(column).join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        Object.values(value),
      )
    ).rows[0];
  }

  async rows<TableName extends Table>(
    table: TableName,
    filter: FixtureValues<NoInfer<TableName>> = {},
  ): Promise<FixtureRow<TableName>[]> {
    const keys = Object.keys(filter);
    return (
      await this.pool.query<FixtureRow<TableName>>(
        `SELECT * FROM ${this.table(table)}${keys.length ? ` WHERE ${keys.map((key, i) => `${column(key)} = $${i + 1}`).join(" AND ")}` : ""}`,
        Object.values(filter),
      )
    ).rows;
  }

  update<TableName extends TableWithId>(
    table: TableName,
    id: string,
    value: FixtureValues<NoInfer<TableName>>,
  ): Promise<void>;
  update<TableName extends Table>(
    table: TableName,
    id: string,
    value: FixtureValues<NoInfer<TableName>>,
    key: keyof FixtureTables[NoInfer<TableName>] & string,
  ): Promise<void>;
  async update(
    table: Table,
    id: string,
    value: FixtureValues<Table>,
    key = "id",
  ): Promise<void> {
    const names = Object.keys(value);
    await this.pool.query(
      `UPDATE ${this.table(table)} SET ${names.map((name, i) => `${column(name)} = $${i + 1}`).join(",")} WHERE ${column(key)} = $${names.length + 1}`,
      [...Object.values(value), id],
    );
  }

  close() {
    return this.pool.end();
  }
}

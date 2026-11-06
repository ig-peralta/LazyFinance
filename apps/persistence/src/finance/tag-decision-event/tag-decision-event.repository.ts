import { Inject, Injectable } from "@nestjs/common";
import type { Selectable } from "kysely";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { TransactionTable } from "../transaction/transaction.tables";
import type {
  TagDecisionEventTable,
  TagDecisionEventTables,
} from "./tag-decision-event.tables";

@Injectable()
export class TagDecisionEventRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<TagDecisionEventTables>,
  ) {}
  record(
    previous: Selectable<TransactionTable>,
    tagId: string | null,
    kind: TagDecisionEventTable["kind"],
    ruleId: string | null = null,
  ) {
    return this.db
      .insertInto("finance.tag_decision_event")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        transactionId: previous.id,
        previousTagId: previous.tagId,
        tagId,
        ruleId,
        kind,
      })
      .execute();
  }
}

import type { IncomeExpectationInput } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { Kysely } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { IncomeSourceRepository } from "../income-source/income-source.repository";
import type { IncomeExpectationTables } from "./income-expectation.tables";

@Injectable()
export class IncomeExpectationRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<IncomeExpectationTables>,
    private readonly sources: IncomeSourceRepository,
  ) {}

  async list(sourceId: string) {
    await this.sources.source(sourceId);
    return this.db
      .selectFrom("finance.income_expectation")
      .selectAll()
      .where("sourceId", "=", sourceId)
      .orderBy("date")
      .orderBy("id")
      .limit(50001)
      .execute();
  }

  async create(sourceId: string, input: IncomeExpectationInput) {
    await this.validate(sourceId, input);
    return this.db
      .insertInto("finance.income_expectation")
      .values({ sourceId, ...input })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, input: IncomeExpectationInput) {
    const row = await this.owned(id);
    await this.validate(row.sourceId, input);

    return this.db
      .updateTable("finance.income_expectation")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async remove(id: string) {
    await this.owned(id);
    await this.db
      .deleteFrom("finance.income_expectation")
      .where("id", "=", id)
      .execute();
  }

  private async owned(id: string) {
    const row = await this.db
      .selectFrom("finance.income_expectation")
      .selectAll()
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Income expectation not found",
      });

    return row;
  }

  private async validate(sourceId: string, input: IncomeExpectationInput) {
    const source = await this.sources.source(sourceId, true);
    if (
      source.archivedAt ||
      source.regularity !== "irregular" ||
      input.date < source.startDate ||
      (source.endDate && input.date > source.endDate)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Expectation is outside an editable irregular income source",
      });
    }
  }
}

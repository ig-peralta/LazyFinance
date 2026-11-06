import {
  IdInputSchema,
  ReceiptConfirmSchema,
  ReceiptFactSchema,
  VoidResultSchema,
} from "@lazyfinance/contracts/internal";
import { Inject } from "@nestjs/common";
import { Input, Mutation, Router } from "nestjs-trpc";
import { wireValue } from "../query-period";
import { IncomeReceiptRepository } from "./income-receipt.repository";

@Router({ alias: "incomeReceipts" })
export class IncomeReceiptRpc {
  constructor(
    @Inject(IncomeReceiptRepository)
    private readonly repository: IncomeReceiptRepository,
  ) {}
  @Mutation({
    input: ReceiptConfirmSchema,
    output: ReceiptFactSchema,
    meta: { context: "user" },
  })
  async confirm(
    @Input() input: { transactionId: string; sourceId: string; at: string },
  ) {
    return wireValue(
      await this.repository.confirm(
        input.transactionId,
        input.sourceId,
        input.at,
      ),
    );
  }
  @Mutation({
    input: IdInputSchema,
    output: VoidResultSchema,
    meta: { context: "user" },
  })
  clear(@Input() input: { id: string }) {
    return this.repository.clear(input.id);
  }
}

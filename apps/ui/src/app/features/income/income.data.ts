import { Injectable, inject, resource, signal } from "@angular/core";
import { currentMonth } from "../../../utils/month";
import { RpcClient } from "../../core/rpc/rpc-client";

@Injectable()
export class IncomeData {
  private readonly rpc = inject(RpcClient);
  readonly month = signal(currentMonth());
  readonly summary = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, month: this.month() };
    },
    loader: ({ params: { scope, month }, abortSignal }) =>
      scope.client.income.summary.query({ month }, { signal: abortSignal }),
  });
}

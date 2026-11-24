import { Injectable, inject, resource, signal } from "@angular/core";
import { currentMonth } from "../../../utils/month";
import { RpcClient } from "../../core/rpc/rpc-client";
import { ManualBankSync } from "../banking/manual-bank-sync";

@Injectable()
export class IncomeData {
  private readonly rpc = inject(RpcClient);
  private readonly sync = inject(ManualBankSync);
  readonly month = signal(currentMonth());
  readonly summary = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return (
        scope && {
          scope,
          month: this.month(),
          syncRevision: this.sync.revision(),
        }
      );
    },
    loader: ({ params: { scope, month }, abortSignal }) =>
      scope.client.income.summary.query({ month }, { signal: abortSignal }),
  });
}

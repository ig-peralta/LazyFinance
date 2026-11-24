import { Injectable, inject, resource, signal } from "@angular/core";
import { currentMonth } from "../../../utils/month";
import { RpcClient } from "../../core/rpc/rpc-client";
import { ManualBankSync } from "../banking/manual-bank-sync";
import { TaggingData } from "../tagging/tagging.data";

@Injectable()
export class ObjectivesData {
  private readonly rpc = inject(RpcClient);
  private readonly sync = inject(ManualBankSync);
  private readonly tagging = inject(TaggingData);
  readonly month = signal(currentMonth());

  readonly objectives = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.objectives.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });

  readonly progress = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return (
        scope && {
          scope,
          month: this.month(),
          syncRevision: this.sync.revision(),
          decision: this.tagging.changed(),
        }
      );
    },
    loader: ({ params: { scope, month }, abortSignal }) =>
      scope.client.objectives.progress.query(
        { month },
        { signal: abortSignal },
      ),
    defaultValue: [],
  });
}

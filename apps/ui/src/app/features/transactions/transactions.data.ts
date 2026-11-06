import { computed, Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";
import { TaggingData } from "../tagging/tagging.data";

@Injectable()
export class TransactionsData {
  private readonly rpc = inject(RpcClient);
  private readonly tagging = inject(TaggingData);

  readonly recent = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: async ({ params: scope, abortSignal }) => {
      const decisionVersion = this.tagging.changed()?.version ?? 0;
      const items = await scope.client.transactions.recent.query(undefined, {
        signal: abortSignal,
      });

      return { items, decisionVersion };
    },
  });

  // Confirmed commands win over an older in-flight read. Do not cancel that read
  // by writing into its resource or lose decisions on other transactions.
  readonly items = computed(() => {
    if (!this.recent.hasValue()) return [];

    const selections = this.tagging.changed()?.selections;
    const { items, decisionVersion } = this.recent.value();

    return items.map((item) => {
      const confirmed = selections?.get(item.id);
      return confirmed && confirmed.version > decisionVersion
        ? {
            ...item,
            tag: confirmed.selection.tag,
            tagDecisionOrigin: confirmed.selection.origin,
            tagRuleId: null,
          }
        : item;
    });
  });
}

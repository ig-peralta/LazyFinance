import { computed, Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";
import { ManualBankSync } from "../banking/manual-bank-sync";
import { TaggingData } from "../tagging/tagging.data";

@Injectable()
export class TransactionsData {
  private readonly rpc = inject(RpcClient);
  private readonly sync = inject(ManualBankSync);
  private readonly tagging = inject(TaggingData);

  readonly recent = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, syncRevision: this.sync.revision() };
    },
    loader: async ({ params: { scope }, abortSignal }) => {
      const decisionVersion = this.tagging.changed()?.version ?? 0;
      // The activity preview deliberately renders only the first ten-item page.
      // Continuation controls belong to a future UI change.
      const { items } = await scope.client.transactions.list.query(
        { limit: 10 },
        { signal: abortSignal },
      );

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

import {
  computed,
  Injectable,
  inject,
  linkedSignal,
  resource,
  signal,
} from "@angular/core";
import type { TransactionsInput } from "@lazyfinance/contracts";
import { RpcClient } from "../../core/rpc/rpc-client";
import { ManualBankSync } from "../banking/manual-bank-sync";

@Injectable()
export class HistoryData {
  private readonly rpc = inject(RpcClient);
  private readonly sync = inject(ManualBankSync);
  readonly filters = signal<TransactionsInput | undefined>(undefined);
  private readonly trail = linkedSignal<(string | undefined)[]>(() => {
    this.rpc.authenticatedScope();
    this.sync.revision();
    return [undefined];
  });
  readonly pageNumber = computed(() => this.trail().length);
  readonly page = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope(),
        input = this.filters();
      return scope && input
        ? { scope, input: { ...input, cursor: this.trail().at(-1) } }
        : undefined;
    },
    loader: ({ params: { scope, input }, abortSignal }) =>
      scope.client.transactions.list.query(input, { signal: abortSignal }),
    defaultValue: { items: [], pageInfo: { hasMore: false, nextCursor: null } },
  });
  readonly items = computed(() =>
    this.page.hasValue() ? this.page.value().items : [],
  );

  apply(input: TransactionsInput | undefined) {
    this.trail.set([undefined]);
    this.filters.set(input);
  }

  next() {
    if (this.page.isLoading() || !this.page.hasValue()) return;
    const cursor = this.page.value().pageInfo.nextCursor;
    if (cursor) this.trail.update((trail) => [...trail, cursor]);
  }

  previous() {
    if (this.page.isLoading() || this.trail().length < 2) return;
    this.trail.update((trail) => trail.slice(0, -1));
  }
}

import { Injectable, inject, resource } from "@angular/core";
import type { BankingSyncStatus } from "@lazyfinance/contracts";
import { RpcClient } from "../../core/rpc/rpc-client";

/** Page-owned access facts. Reading these never refreshes bank balances. */
@Injectable()
export class BankingData {
  private readonly rpc = inject(RpcClient);

  readonly configuration = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.banking.configuration.query(undefined, {
        signal: abortSignal,
      }),
  });

  readonly connections = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.banking.connections.query(undefined, {
        signal: abortSignal,
      }),
    defaultValue: [],
  });

  reload() {
    this.configuration.reload();
    this.connections.reload();
  }

  /** Only confirmed lifecycle facts, never a balance/freshness inference. */
  adoptStatus(snapshot: BankingSyncStatus) {
    if (!this.connections.hasValue() || this.connections.isLoading()) return;
    const bank = this.connections
      .value()
      .find((bank) => bank.id === snapshot.connectionId);
    if (
      !bank ||
      Date.parse(snapshot.asOf) < Date.parse(bank.updatedAt) ||
      (bank.status === snapshot.lifecycle &&
        bank.disconnectedAt === snapshot.disconnectedAt &&
        bank.disconnectPending === snapshot.disconnectPending)
    )
      return;
    this.connections.update((banks) =>
      banks.map((bank) =>
        bank.id === snapshot.connectionId
          ? {
              ...bank,
              status: snapshot.lifecycle,
              disconnectedAt: snapshot.disconnectedAt,
              disconnectPending: snapshot.disconnectPending,
            }
          : bank,
      ),
    );
  }
}

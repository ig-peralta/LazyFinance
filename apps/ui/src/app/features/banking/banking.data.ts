import { Injectable, inject, resource } from "@angular/core";
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
}

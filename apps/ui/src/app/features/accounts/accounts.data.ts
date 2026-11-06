import { Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";

@Injectable()
export class AccountsData {
  private readonly rpc = inject(RpcClient);

  readonly accounts = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.accounts.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
}

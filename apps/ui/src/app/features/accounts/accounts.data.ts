import { Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";
import { ManualBankSync } from "../banking/manual-bank-sync";

@Injectable()
export class AccountsData {
  private readonly rpc = inject(RpcClient);
  private readonly sync = inject(ManualBankSync);

  readonly accounts = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, syncRevision: this.sync.revision() };
    },
    loader: ({ params: { scope }, abortSignal }) =>
      scope.client.accounts.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
}

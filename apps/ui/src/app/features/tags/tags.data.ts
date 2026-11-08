import { Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";

@Injectable()
export class TagsData {
  private readonly rpc = inject(RpcClient);
  readonly tags = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.tags.list.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
}

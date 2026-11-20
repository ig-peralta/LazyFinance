import { Injectable, inject } from "@angular/core";
import { RpcClient } from "../rpc/rpc-client";

@Injectable({ providedIn: "root" })
export class ConfigApi {
  private readonly rpc = inject(RpcClient);

  get(signal?: AbortSignal) {
    return this.rpc.anonymous.config.get.query(undefined, { signal });
  }
}

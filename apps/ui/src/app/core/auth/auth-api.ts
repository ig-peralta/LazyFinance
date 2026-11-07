import { Injectable, inject } from "@angular/core";
import { RpcClient } from "../rpc/rpc-client";

@Injectable({ providedIn: "root" })
export class AuthApi {
  private readonly rpc = inject(RpcClient);

  config(signal?: AbortSignal) {
    return this.rpc.anonymous.auth.config.query(undefined, { signal });
  }

  loginMock(email: string, password: string) {
    return this.rpc.anonymous.auth.loginMock.mutate({ email, password });
  }

  verifyPrincipal(token: string, signal?: AbortSignal) {
    return this.rpc
      .verificationClient(token)
      .auth.principal.query(undefined, { signal });
  }
}

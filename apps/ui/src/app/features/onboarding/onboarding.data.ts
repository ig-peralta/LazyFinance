import { computed, Injectable, inject, resource } from "@angular/core";
import { RpcClient } from "../../core/rpc/rpc-client";

/** Small account metadata shared by shell/guide, never a financial response cache. */
@Injectable({ providedIn: "root" })
export class OnboardingData {
  private readonly rpc = inject(RpcClient);
  readonly state = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.onboarding.state.query(undefined, { signal: abortSignal }),
  });
  readonly status = computed(() =>
    this.state.hasValue() ? this.state.value().status : undefined,
  );
}

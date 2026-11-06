import {
  computed,
  DestroyRef,
  Injectable,
  InjectionToken,
  inject,
} from "@angular/core";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import {
  createTRPCClient,
  httpLink,
  type TRPCClient,
  TRPCClientError,
  type TRPCLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { API_URL } from "../../tokens/api-url";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../auth/auth-credentials";
import { isUnauthorized } from "./rpc-error";

export const RPC_FETCH = new InjectionToken<typeof fetch>("RPC_FETCH", {
  providedIn: "root",
  factory: () => (url, options) => fetch(url, options),
});

export interface RpcScope {
  readonly client: TRPCClient<ApiRouter>;
  readonly signal: AbortSignal;
}

/** Native tRPC clients, owned by this Angular application / SSR render injector. */
@Injectable({ providedIn: "root" })
export class RpcClient {
  private readonly url = `${inject(API_URL).replace(/\/$/, "")}/trpc`;
  private readonly fetch = inject(RPC_FETCH);
  private readonly credentials = inject(AuthCredentials);
  private readonly lifetime = new AbortController();

  readonly anonymous = this.createClient();

  readonly authenticatedScope = computed<RpcScope | undefined>(() => {
    const credentials = this.credentials.current();
    return (
      credentials && {
        client: this.createClient(credentials.token, credentials),
        signal: credentials.signal,
      }
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lifetime.abort());
  }

  /** Candidate verification does not read, replace or expire the accepted session. */
  verificationClient(token: string): TRPCClient<ApiRouter> {
    return this.createClient(token);
  }

  requireScope(): RpcScope {
    const scope = this.authenticatedScope();
    if (!scope) throw new DOMException("No active session", "AbortError");

    return scope;
  }

  private createClient(
    token?: string,
    credentials?: VerifiedCredentials,
  ): TRPCClient<ApiRouter> {
    return createTRPCClient<ApiRouter>({
      links: [
        this.sessionPolicy(credentials),
        httpLink({
          url: this.url,
          headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
          fetch: (url, options) =>
            this.fetch(url, { ...options, cache: "no-store" }),
        }),
      ],
    });
  }

  private sessionPolicy(
    credentials?: VerifiedCredentials,
  ): TRPCLink<ApiRouter> {
    // A standard tRPC link: no Angular Observable/Promise conversion or retries.
    return () =>
      ({ op, next }) =>
        observable((observer) => {
          const signal = AbortSignal.any([
            this.lifetime.signal,
            ...(credentials ? [credentials.signal] : []),
            ...(op.signal ? [op.signal] : []),
          ]);
          const cancel = () =>
            observer.error(TRPCClientError.from(signal.reason));
          if (signal.aborted) {
            cancel();
            return;
          }

          signal.addEventListener("abort", cancel, { once: true });
          const subscription = next({ ...op, signal }).subscribe({
            next: (value) => {
              if (!signal.aborted) observer.next(value);
            },
            error: (error) => {
              if (signal.aborted) return;

              observer.error(error);

              if (credentials && isUnauthorized(error))
                this.credentials.expire(credentials);
            },
            complete: () => observer.complete(),
          });

          return () => {
            signal.removeEventListener("abort", cancel);
            subscription.unsubscribe();
          };
        });
  }
}

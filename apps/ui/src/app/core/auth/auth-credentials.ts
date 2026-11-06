import { Injectable, OnDestroy, signal } from "@angular/core";
import type { AuthPrincipal } from "@lazyfinance/contracts";

export interface VerifiedCredentials {
  readonly principal: AuthPrincipal;
  readonly token: string;
  readonly signal: AbortSignal;
}

/** Accepted identity only. No HTTP, cookies, Firebase or routing dependencies. */
@Injectable({ providedIn: "root" })
export class AuthCredentials implements OnDestroy {
  private readonly accepted = signal<VerifiedCredentials | undefined>(
    undefined,
  );

  private readonly rejected = signal<VerifiedCredentials | undefined>(
    undefined,
  );

  private lifetime?: AbortController;

  readonly current = this.accepted.asReadonly();
  readonly expired = this.rejected.asReadonly();

  accept(principal: AuthPrincipal, token: string): void {
    const previous = this.current();
    if (
      previous?.token === token &&
      previous.principal.userId === principal.userId
    )
      return;

    this.clear();
    this.lifetime = new AbortController();
    this.accepted.set(
      Object.freeze({
        principal: Object.freeze({ ...principal }),
        token,
        signal: this.lifetime.signal,
      }),
    );
  }

  clear(): void {
    this.accepted.set(undefined);
    this.rejected.set(undefined);
    this.lifetime?.abort();
    this.lifetime = undefined;
  }

  expire(expected: VerifiedCredentials): void {
    // An old request must never expire a newer login or refreshed token.
    if (this.current() !== expected) return;

    this.clear();
    this.rejected.set(expected);
  }

  ngOnDestroy(): void {
    this.clear();
  }
}

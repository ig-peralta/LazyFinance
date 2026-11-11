import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { Injectable } from "@nestjs/common";
import { PersistenceClient } from "../../../persistence/persistence.client";

export class ProviderAdmissionDeferred extends Error {
  constructor(readonly retryAt: string) {
    super("Provider request budget is unavailable");
  }
}

@Injectable()
export class FintocRequestAdmission {
  constructor(private readonly persistence: PersistenceClient) {}

  async acquire(
    mode: "test" | "live",
    purpose: "sync" | "lifecycle",
    signal: AbortSignal,
  ) {
    const client = this.persistence.bankingTransport().providerRequests;
    const deadline = Date.now() + 20_000;
    for (;;) {
      signal.throwIfAborted();
      const id = randomUUID();
      const permit = await client.acquire.mutate(
        { id, mode, purpose },
        { signal },
      );
      if (permit.acquired) return { id, expiresAt: permit.expiresAt };
      if (Date.parse(permit.retryAt) >= deadline)
        throw new ProviderAdmissionDeferred(permit.retryAt);
      await setTimeout(
        Math.max(50, Date.parse(permit.retryAt) - Date.now()),
        undefined,
        { signal },
      );
    }
  }

  async release(id: string) {
    // Admission is conservative on response loss: its bounded lease expires.
    // Never replay a possibly completed provider operation to release capacity.
    try {
      await this.persistence
        .bankingTransport()
        .providerRequests.release.mutate(
          { id },
          { signal: AbortSignal.timeout(5000) },
        );
    } catch {
      /* A lost release reserves capacity only until the permit expires. */
    }
  }

  async defer(mode: "test" | "live", retryAfter: string) {
    try {
      await this.persistence
        .bankingTransport()
        .providerRequests.defer.mutate(
          { mode, retryAfter },
          { signal: AbortSignal.timeout(5000) },
        );
    } catch {
      /* The owned failure path also retains the original waiting period. */
    }
  }
}

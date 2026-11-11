import type { BankingAccountChoice } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../../../persistence/persistence.client";
import { FintocClient, FintocFailure } from "../client/fintoc-client";
import { FintocCredentials } from "../credentials/fintoc-credentials";
import { fintocAccountChoice } from "./fintoc-account-choice";

@Injectable()
export class FintocDiscoveryService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly fintoc: FintocClient,
    private readonly credentials: FintocCredentials,
  ) {}

  async discover(userId: string, connectionId: string) {
    const client = this.persistence.user(userId);
    const owned = await client.providerLinks.connection.query({
      id: connectionId,
    });
    const config = this.fintoc.configuration();
    if (!config.enabled || config.mode !== owned.connection.mode)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Banking is not configured for this mode",
      });
    if (
      owned.connection.disconnectedAt ||
      owned.connection.status !== "active" ||
      !owned.encryptedCredential
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reconnect this bank before discovering accounts",
      });
    const tracking = await client.providerSelection.get.query({
      id: connectionId,
    });
    if (
      tracking.selection.readRetryAfter &&
      Date.parse(tracking.selection.readRetryAfter) > Date.now()
    )
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Espera hasta ${tracking.selection.readRetryAfter} antes de consultar nuevamente`,
      });
    const token = this.credentials.open(
      owned.encryptedCredential,
      userId,
      owned.connection.mode,
      owned.externalId,
    );
    const accounts: BankingAccountChoice[] = [];
    const seen = new Set<string>();
    const signal = AbortSignal.timeout(60_000);
    try {
      const link = await this.fintoc.link(token, signal, "sync");
      if (
        link.id !== owned.externalId ||
        link.mode !== owned.connection.mode ||
        link.holder_type !== owned.connection.holderType ||
        !link.active ||
        link.status !== "active"
      )
        throw new FintocFailure("unavailable");
      let total: number | null | undefined;
      for (let page = 1; page < 100; page++) {
        const result = await this.fintoc.accounts(token, page, signal);
        if (total !== undefined && total !== result.total)
          throw new FintocFailure("invalid_data");
        total = result.total;
        for (const account of result.items) {
          if (seen.has(account.id) || seen.size >= 1000)
            throw new FintocFailure("invalid_data");
          seen.add(account.id);
          accounts.push(fintocAccountChoice(account));
        }
        if (!result.hasMore)
          return client.providerSelection.discover.mutate({
            connectionId,
            expectedCredentialVersion: owned.version,
            accounts,
          });
      }
      throw new FintocFailure("invalid_data");
    } catch (error) {
      if (!(error instanceof FintocFailure)) throw error;
      const retryAfter =
        error.retryAfter ?? new Date(Date.now() + 5 * 60_000).toISOString();
      await client.providerSelection.deferDiscovery.mutate({
        connectionId,
        expectedCredentialVersion: owned.version,
        retryAfter,
      });
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message:
          "No pudimos consultar las cuentas del banco. Revisa la conexión e inténtalo más tarde.",
      });
    }
  }
}

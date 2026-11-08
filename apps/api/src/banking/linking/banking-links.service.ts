import { createHash, randomUUID } from "node:crypto";
import type {
  CompleteBankingIntent,
  CreateBankingIntent,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { PersistenceClient } from "../../persistence/persistence.client";
import {
  FintocClient,
  FintocFailure,
  type FintocLink,
} from "../fintoc/client/fintoc-client";
import { FintocCredentials } from "../fintoc/credentials/fintoc-credentials";

function providerError(error: unknown): never {
  if (error instanceof FintocFailure)
    throw new TRPCError({
      code:
        error.kind === "invalid_exchange"
          ? "BAD_REQUEST"
          : "SERVICE_UNAVAILABLE",
      message:
        error.kind === "invalid_exchange"
          ? "Bank authorization expired or was rejected; start a new connection attempt"
          : "Fintoc could not confirm this operation; check connections before trying again",
    });
  throw error;
}

const statusOf = (link: FintocLink) =>
  !link.active || link.status === "inactive"
    ? ("revoked" as const)
    : link.status === "login_required"
      ? ("expired" as const)
      : ("active" as const);

@Injectable()
export class BankingLinksService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly fintoc: FintocClient,
    private readonly credentials: FintocCredentials,
  ) {}

  configuration() {
    return this.fintoc.configuration();
  }

  list(userId: string) {
    return this.persistence.user(userId).providerLinks.list.query();
  }

  private configured(mode?: string) {
    const config = this.configuration();
    if (!config.enabled || (mode && mode !== config.mode))
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Banking is not configured for this connection's mode",
      });
    return config;
  }

  async createIntent(userId: string, input: CreateBankingIntent) {
    const config = this.configured();
    const store = this.persistence.user(userId).providerLinks;
    const previous = input.connectionId
      ? await store.connection.query({ id: input.connectionId })
      : undefined;
    if (
      previous &&
      (previous.connection.disconnectedAt ||
        previous.connection.mode !== config.mode ||
        previous.connection.holderType !== input.holderType)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Reconnect the same owned connection, mode and holder type",
      });
    try {
      const intent = await this.fintoc.createIntent(input.holderType);
      if (
        intent.mode !== config.mode ||
        intent.holder_type !== input.holderType
      )
        throw new FintocFailure("unavailable");
      const id = randomUUID();
      const saved = await store.createIntent.mutate({
        id,
        providerIntentId: intent.id,
        holderType: input.holderType,
        mode: config.mode,
        connectionId: input.connectionId ?? null,
        expectedVersion: previous?.version ?? null,
      });
      return {
        id,
        publicKey: config.publicKey,
        widgetToken: intent.widget_token,
        mode: config.mode,
        expiresAt: saved.expiresAt,
      };
    } catch (error) {
      return providerError(error);
    }
  }

  async complete(userId: string, input: CompleteBankingIntent) {
    // The provider token encodes its immutable intent ID; bind it to our owned
    // persisted intent before making any exchange request. Never accept link tokens.
    const encoded =
      /^(li_[A-Za-z0-9]+)_(?:exc|exchange_token)_[A-Za-z0-9_-]+$/.exec(
        input.exchangeToken,
      );
    if (!encoded)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Expected a Fintoc exchange token",
      });
    const exchangeTokenHash = createHash("sha256")
      .update(input.exchangeToken)
      .digest("hex");
    const store = this.persistence.user(userId).providerLinks;
    const claim = await store.claim.mutate({
      id: input.id,
      providerIntentId: encoded[1],
      exchangeTokenHash,
    });
    if (claim.state === "completed") return claim.connection;
    try {
      this.configured(claim.mode);
      const link = await this.fintoc.exchange(input.exchangeToken);
      if (
        link.mode !== claim.mode ||
        link.holder_type !== claim.holderType ||
        !link.link_token.startsWith(`${link.id}_token_`)
      )
        throw new FintocFailure("unavailable");
      return await store.complete.mutate({
        id: input.id,
        exchangeTokenHash,
        externalId: link.id,
        status: statusOf(link),
        institution: { id: link.institution.id, name: link.institution.name },
        encryptedCredential: this.credentials.seal(
          link.link_token,
          userId,
          claim.mode,
          link.id,
        ),
      });
    } catch (error) {
      // Do not replay an exchange or uncertain persistence commit. A duplicate
      // callback can recover an actually completed result from the durable claim.
      await store.fail
        .mutate({ id: input.id, exchangeTokenHash })
        .catch(() => undefined);
      return providerError(error);
    }
  }

  async check(userId: string, id: string) {
    const store = this.persistence.user(userId).providerLinks;
    const current = await store.connection.query({ id });
    if (current.connection.disconnectedAt) return current.connection;
    this.configured(current.connection.mode);
    if (!current.encryptedCredential)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reconnect this bank to restore access",
      });
    const token = this.credentials.open(
      current.encryptedCredential,
      userId,
      current.connection.mode,
      current.externalId,
    );
    try {
      const link = await this.fintoc.link(token);
      if (
        link.id !== current.externalId ||
        link.mode !== current.connection.mode ||
        link.holder_type !== current.connection.holderType
      )
        throw new FintocFailure("unavailable");
      return await store.status.mutate({
        id,
        expectedVersion: current.version,
        status: statusOf(link),
      });
    } catch (error) {
      if (error instanceof FintocFailure && error.kind === "revoked")
        return store.status.mutate({
          id,
          expectedVersion: current.version,
          status: "revoked",
        });
      return providerError(error);
    }
  }

  async disconnect(userId: string, id: string) {
    const store = this.persistence.user(userId).providerLinks;
    const previous = await store.connection.query({ id });
    if (
      previous.connection.disconnectedAt &&
      !previous.connection.disconnectPending
    )
      return previous.connection;
    // Disable local synchronization first. Provider failures leave a durable,
    // truthful pending state that can be explicitly reconciled by the owner.
    const current = await store.beginDisconnect.mutate({ id });
    try {
      this.configured(current.connection.mode);
      await this.fintoc.disconnect(current.externalId);
      return await store.finishDisconnect.mutate({
        id,
        expectedVersion: current.version,
      });
    } catch (error) {
      return providerError(error);
    }
  }
}

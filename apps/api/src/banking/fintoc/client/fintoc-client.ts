import type { BankingImportReport } from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { EnvironmentService } from "../../../environment/environment.service";
import {
  FintocRequestAdmission,
  ProviderAdmissionDeferred,
} from "./fintoc-request-admission";
import {
  FintocAccountSchema,
  FintocMovementSchema,
} from "./fintoc-snapshot.schema";

export const FINTOC_FETCH = Symbol("FINTOC_FETCH");
export const FINTOC_PAGE_SIZE = 300;
const API_VERSION = "2026-02-01";

const opaque = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(512);

const intentSchema = z.object({
  id: opaque,
  object: z.literal("link_intent"),
  mode: z.enum(["test", "live"]),
  country: z.literal("cl"),
  holder_type: z.enum(["individual", "business"]),
  product: z.literal("movements"),
  widget_token: opaque,
  status: z.literal("created"),
});

const linkSchema = z.object({
  id: opaque,
  object: z.literal("link"),
  mode: z.enum(["test", "live"]),
  holder_type: z.enum(["individual", "business"]),
  active: z.boolean(),
  status: z.enum(["active", "inactive", "login_required"]),
  institution: z.object({
    id: opaque,
    name: z.string().min(1).max(200),
    country: z.literal("cl"),
  }),
  link_token: opaque.nullable(),
});

export type FintocLink = z.infer<typeof linkSchema>;

/** Never carries upstream response text, URLs, keys or tokens into logs/errors. */
export class FintocFailure extends Error {
  constructor(
    readonly kind:
      | "unavailable"
      | "invalid_exchange"
      | "revoked"
      | "invalid_data",
    readonly retryAfter: string | null = null,
  ) {
    super(`Fintoc ${kind}`);
  }
}

@Injectable()
export class FintocClient {
  constructor(
    private readonly environment: EnvironmentService,
    @Inject(FINTOC_FETCH) private readonly fetch: typeof globalThis.fetch,
    private readonly admission: FintocRequestAdmission,
  ) {}

  configuration() {
    const publicKey = this.environment.get("FINTOC_PUBLIC_KEY");
    if (!publicKey) return { enabled: false as const };
    return {
      enabled: true as const,
      automaticSyncEnabled: this.environment.get(
        "BANKING_AUTOMATIC_SYNC_ENABLED",
      ),
      publicKey,
      mode: publicKey.startsWith("pk_test_")
        ? ("test" as const)
        : ("live" as const),
    };
  }

  async createIntent(holderType: "individual" | "business") {
    const data = await this.request("/v1/link_intents", {
      method: "POST",
      body: JSON.stringify({
        country: "cl",
        holder_type: holderType,
        product: "movements",
      }),
    });
    const parsed = intentSchema.safeParse(data);
    if (!parsed.success) throw new FintocFailure("unavailable");
    return parsed.data;
  }

  async exchange(token: string) {
    const data = await this.request(
      `/v1/links/exchange?${new URLSearchParams({ exchange_token: token })}`,
      undefined,
      "exchange",
    );
    const parsed = linkSchema.extend({ link_token: opaque }).safeParse(data);
    if (!parsed.success) throw new FintocFailure("unavailable");
    return parsed.data;
  }

  async link(
    token: string,
    signal?: AbortSignal,
    purpose: "sync" | "lifecycle" = "lifecycle",
  ) {
    const data = await this.request(
      `/v1/links/${encodeURIComponent(token)}`,
      { signal },
      purpose === "sync" ? "sync-link" : "link",
    );
    const parsed = linkSchema.safeParse(data);
    if (!parsed.success) throw new FintocFailure("unavailable");
    return parsed.data;
  }

  async disconnect(externalId: string) {
    await this.request(
      `/v1/links/${encodeURIComponent(externalId)}`,
      { method: "DELETE" },
      "disconnect",
    );
  }

  accounts(token: string, page: number, signal?: AbortSignal) {
    return this.collection(
      "/v1/accounts",
      token,
      page,
      FintocAccountSchema,
      undefined,
      signal,
    );
  }

  movements(
    token: string,
    accountId: string,
    page: number,
    window: BankingImportReport["requestedHistory"],
    signal?: AbortSignal,
  ) {
    return this.collection(
      `/v1/accounts/${encodeURIComponent(accountId)}/movements`,
      token,
      page,
      FintocMovementSchema,
      window,
      signal,
    );
  }

  private async collection<T>(
    path: string,
    token: string,
    page: number,
    schema: z.ZodType<T>,
    window?: BankingImportReport["requestedHistory"],
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      link_token: token,
      page: String(page),
      per_page: String(FINTOC_PAGE_SIZE),
      ...(path.endsWith("/movements") ? { confirmed_only: "false" } : {}),
      ...(window ? { since: window.from, until: window.through } : {}),
    });
    const { data, headers } = await this.response(
      `${path}?${query}`,
      { signal },
      "snapshot",
    );
    const parsed = z.array(schema).max(FINTOC_PAGE_SIZE).safeParse(data);
    if (!parsed.success) throw new FintocFailure("invalid_data");
    const totalHeader = headers.get("X-Total-Count");
    const total = totalHeader === null ? null : Number(totalHeader);
    if (
      total !== null &&
      totalHeader !== null &&
      (!/^\d+$/.test(totalHeader) ||
        !Number.isSafeInteger(total) ||
        total > 50_000)
    )
      throw new FintocFailure("invalid_data");

    // Inspect pagination only. Never fetch a provider-supplied URL: every next
    // request is reconstructed from our fixed origin/path and integer page.
    let linkedNext = false;
    const links = headers.get("Link");
    if (links) {
      for (const entry of links.split(",")) {
        const match = /^\s*<([^>]+)>\s*;\s*rel="?([a-z]+)"?\s*$/.exec(entry);
        if (!match) throw new FintocFailure("invalid_data");
        if (match[2] !== "next") continue;
        let next: URL;
        try {
          next = new URL(match[1]);
        } catch {
          throw new FintocFailure("invalid_data");
        }
        if (
          linkedNext ||
          next.origin !== "https://api.fintoc.com" ||
          next.pathname !== path ||
          next.username ||
          next.password ||
          next.hash ||
          next.searchParams.get("page") !== String(page + 1) ||
          (next.searchParams.has("per_page") &&
            next.searchParams.get("per_page") !== String(FINTOC_PAGE_SIZE))
        )
          throw new FintocFailure("invalid_data");
        linkedNext = true;
      }
    }
    if (
      total !== null &&
      parsed.data.length !==
        Math.min(
          FINTOC_PAGE_SIZE,
          Math.max(0, total - (page - 1) * FINTOC_PAGE_SIZE),
        )
    )
      throw new FintocFailure("invalid_data");
    const hasMore =
      total !== null
        ? page * FINTOC_PAGE_SIZE < total
        : links !== null
          ? linkedNext
          : parsed.data.length === FINTOC_PAGE_SIZE;
    if ((linkedNext && !hasMore) || (hasMore && parsed.data.length === 0))
      throw new FintocFailure("invalid_data");
    return { items: parsed.data, hasMore, total };
  }

  private async request(
    path: string,
    options?: RequestInit,
    operation?: "exchange" | "link" | "disconnect" | "sync-link",
  ): Promise<unknown> {
    return (await this.response(path, options, operation)).data;
  }

  private async response(
    path: string,
    options?: RequestInit,
    operation?: "exchange" | "link" | "disconnect" | "snapshot" | "sync-link",
  ): Promise<{ data: unknown; headers: Headers }> {
    const key = this.environment.get("FINTOC_SECRET_KEY");
    if (!key) throw new FintocFailure("unavailable");
    const cancellation = AbortSignal.any([
      AbortSignal.timeout(20_000),
      ...(options?.signal ? [options.signal] : []),
    ]);
    let permit: { id: string; expiresAt: string } | undefined;
    try {
      permit = await this.admission.acquire(
        key.startsWith("sk_test_") ? "test" : "live",
        operation === "snapshot" || operation === "sync-link"
          ? "sync"
          : "lifecycle",
        cancellation,
      );
      cancellation.throwIfAborted();
      const remaining = Date.parse(permit.expiresAt) - Date.now();
      if (remaining <= 0) throw new FintocFailure("unavailable");
      const response = await this.fetch(`https://api.fintoc.com${path}`, {
        ...options,
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
          "Fintoc-Version": API_VERSION,
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([
          cancellation,
          AbortSignal.timeout(Math.max(1, Math.min(20_000, remaining))),
          ...(options?.signal ? [options.signal] : []),
        ]),
      });
      if (
        operation === "disconnect" &&
        (response.status === 204 || response.status === 404)
      ) {
        await response.body?.cancel();
        return { data: undefined, headers: response.headers };
      }
      if (!response.ok) {
        await response.body?.cancel();
        // Do not use a 401 server API-key failure as evidence of user revocation.
        if (operation === "exchange" && [400, 403].includes(response.status))
          throw new FintocFailure("invalid_exchange");
        if (
          (operation === "link" || operation === "sync-link") &&
          [403, 404].includes(response.status)
        )
          throw new FintocFailure("revoked");
        const retry = response.headers.get("Retry-After");
        const retryTime =
          retry === null
            ? NaN
            : /^\d+$/.test(retry)
              ? Date.now() + Number(retry) * 1000
              : Date.parse(retry);
        const retryAfter =
          Number.isFinite(retryTime) &&
          retryTime > Date.now() &&
          retryTime <= 253_402_300_799_999
            ? new Date(retryTime).toISOString()
            : null;
        if (retryAfter)
          await this.admission.defer(
            key.startsWith("sk_test_") ? "test" : "live",
            retryAfter,
          );
        throw new FintocFailure("unavailable", retryAfter);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new FintocFailure("unavailable");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 1024 * 1024) {
            await reader.cancel();
            throw new FintocFailure(
              operation === "snapshot" ? "invalid_data" : "unavailable",
            );
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return {
          data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          headers: response.headers,
        };
      } catch {
        throw new FintocFailure(
          operation === "snapshot" ? "invalid_data" : "unavailable",
        );
      }
    } catch (error) {
      if (error instanceof ProviderAdmissionDeferred)
        throw new FintocFailure("unavailable", error.retryAt);
      if (error instanceof FintocFailure) throw error;
      throw new FintocFailure("unavailable");
    } finally {
      if (permit) await this.admission.release(permit.id);
    }
  }
}

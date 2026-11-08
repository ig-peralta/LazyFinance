import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { EnvironmentService } from "../../environment/environment.service";

export const FINTOC_FETCH = Symbol("FINTOC_FETCH");

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
  constructor(readonly kind: "unavailable" | "invalid_exchange" | "revoked") {
    super(`Fintoc ${kind}`);
  }
}

@Injectable()
export class FintocClient {
  constructor(
    private readonly environment: EnvironmentService,
    @Inject(FINTOC_FETCH) private readonly fetch: typeof globalThis.fetch,
  ) {}

  configuration() {
    const publicKey = this.environment.get("FINTOC_PUBLIC_KEY");
    if (!publicKey) return { enabled: false as const };
    return {
      enabled: true as const,
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

  async link(token: string) {
    const data = await this.request(
      `/v1/links/${encodeURIComponent(token)}`,
      undefined,
      "link",
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

  private async request(
    path: string,
    options?: RequestInit,
    operation?: "exchange" | "link" | "disconnect",
  ): Promise<unknown> {
    const key = this.environment.get("FINTOC_SECRET_KEY");
    if (!key) throw new FintocFailure("unavailable");
    try {
      const response = await this.fetch(`https://api.fintoc.com${path}`, {
        ...options,
        headers: { Authorization: key, "Content-Type": "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (
        operation === "disconnect" &&
        (response.status === 204 || response.status === 404)
      ) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok) {
        await response.body?.cancel();
        // Do not use a 401 server API-key failure as evidence of user revocation.
        if (operation === "exchange" && [400, 403].includes(response.status))
          throw new FintocFailure("invalid_exchange");
        if (operation === "link" && [403, 404].includes(response.status))
          throw new FintocFailure("revoked");
        throw new FintocFailure("unavailable");
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
            throw new FintocFailure("unavailable");
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof FintocFailure) throw error;
      throw new FintocFailure("unavailable");
    }
  }
}

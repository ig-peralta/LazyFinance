import { Injectable, InjectionToken, inject } from "@angular/core";
import {
  McpConsentResultSchema,
  McpConsentSchema,
} from "@lazyfinance/contracts";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { API_URL } from "../../tokens/api-url";

export const MCP_AUTH_NAVIGATE = new InjectionToken<(url: string) => void>(
  "MCP_AUTH_NAVIGATE",
  {
    providedIn: "root",
    factory: () => (url) => location.assign(url),
  },
);

/** The cookie-bound OAuth interaction is HTTP, not an external MCP tool or RPC.
 * Cookies are included only on this fixed API path, alongside verified app auth. */
@Injectable({ providedIn: "root" })
export class OAuthInteractionClient {
  private readonly api = inject(API_URL).replace(/\/$/, "");
  private readonly fetch = inject(RPC_FETCH);
  private readonly credentials = inject(AuthCredentials);

  private async request(
    owner: VerifiedCredentials,
    id: string,
    signal: AbortSignal,
    approve?: boolean,
  ) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
      throw new Error("Solicitud de autorización inválida.");
    const response = await this.fetch(
      `${this.api}/oauth/interaction/${encodeURIComponent(id)}/${approve === undefined ? "details" : "decision"}`,
      {
        method: approve === undefined ? "GET" : "POST",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.any([owner.signal, signal]),
        headers: {
          authorization: `Bearer ${owner.token}`,
          ...(approve === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        ...(approve === undefined ? {} : { body: JSON.stringify({ approve }) }),
      },
    );
    if (response.status === 401) this.credentials.expire(owner);
    if (!response.ok)
      throw new Error(
        "No pudimos confirmar la autorización. Puede haber vencido o haber sido atendida. Revisa las aplicaciones conectadas o vuelve a conectar desde tu cliente.",
      );
    const body: unknown = await response.json();
    return body;
  }

  async preview(owner: VerifiedCredentials, id: string, signal: AbortSignal) {
    const consent = McpConsentSchema.parse(
      await this.request(owner, id, signal),
    );
    if (consent.id !== id)
      throw new Error("La autorización no corresponde a esta solicitud.");
    return consent;
  }

  async decide(
    owner: VerifiedCredentials,
    id: string,
    approve: boolean,
    signal: AbortSignal,
  ) {
    const result = McpConsentResultSchema.parse(
      await this.request(owner, id, signal, approve),
    );
    const resume = new URL(result.redirectTo),
      api = new URL(this.api);
    if (
      resume.origin !== api.origin ||
      !!resume.username ||
      !!resume.password ||
      !!resume.hash ||
      !resume.pathname.startsWith("/oauth/authorize/")
    )
      throw new Error("No pudimos validar el destino de autorización.");
    return result;
  }
}

import { McpArtifactModelSchema } from "@lazyfinance/contracts/internal";
import type { Adapter, AdapterPayload } from "oidc-provider";
import { z } from "zod";
import type { PersistenceClient } from "../../persistence/persistence.client";
import { MCP_GRANT_SECONDS, oauthRedirectAllowed } from "./oauth-policy";
import { OAuthStateCrypto, oauthStateHash } from "./oauth-state-crypto";

type ProviderErrors = { replay(): Error; invalidClient(): Error };

export function oauthAdapterFactory(
  persistence: PersistenceClient,
  crypto: OAuthStateCrypto,
  errors: ProviderErrors,
) {
  return (name: string): Adapter => {
    const model = McpArtifactModelSchema.parse(name);
    const client = () => persistence.mcpAuthorization().mcpArtifacts;
    const keyFor = (id: string) => ({ model, key: oauthStateHash(id) });
    const read = async (id: string, byUid = false) => {
      const key = keyFor(id);
      const row = await client().find.query({ ...key, byUid });
      if (!row) return undefined;
      // The authenticated provider owns this extensible payload format. Validate
      // JSON/object shape here; the provider validates each model when loading it.
      const payload = z
        .record(z.string(), z.json())
        .parse(crypto.open(model, row.key, row.ciphertext)) as AdapterPayload;
      return row.consumedAt
        ? {
            ...payload,
            consumed: Math.floor(Date.parse(row.consumedAt) / 1000),
          }
        : payload;
    };
    return {
      async upsert(id, payload, expiresIn) {
        if (
          model === "Client" &&
          (!payload.redirect_uris?.length ||
            payload.redirect_uris.some((uri) => !oauthRedirectAllowed(uri)))
        )
          throw errors.invalidClient();
        const key = keyFor(id);
        const result = await client().save.mutate({
          ...key,
          ciphertext: crypto.seal(model, key.key, payload),
          grantId: model === "Grant" ? id : (payload.grantId ?? null),
          accountId: payload.accountId ?? null,
          clientId: payload.clientId ?? payload.client_id ?? null,
          uidHash: payload.uid ? oauthStateHash(payload.uid) : null,
          expiresIn:
            model === "Client"
              ? null
              : Math.min(expiresIn ?? MCP_GRANT_SECONDS, MCP_GRANT_SECONDS),
        });
        if (!result.saved) throw errors.replay();
      },
      find: (id) => read(id),
      findByUid: (uid) => read(uid, true),
      async findByUserCode() {
        return undefined;
      }, // Device grants are not enabled.
      async consume(id) {
        const result = await client().consume.mutate(keyFor(id));
        if (!result.consumed) throw errors.replay();
      },
      async destroy(id) {
        await client().destroy.mutate(keyFor(id));
      },
      async revokeByGrantId(id) {
        await client().revoke.mutate({ id });
      },
    };
  };
}

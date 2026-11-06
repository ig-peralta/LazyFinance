import { randomUUID } from "node:crypto";
import type { VerifiedExternalIdentity } from "@lazyfinance/contracts";
import type { PersistenceContext } from "@lazyfinance/contracts/context";
import { createContextSigner } from "@lazyfinance/rpc-auth";
import type { PersistenceRouter } from "@lazyfinance/rpc-persistence";
import {
  HttpException,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createTRPCClient,
  httpLink,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { EnvironmentService } from "../environment/environment.service";
import { currentRequestId } from "../rpc/request-context";

export function persistenceException(
  error: unknown,
): HttpException | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;

  const status: number | undefined = error.data?.httpStatus;

  return status && [400, 401, 403, 404, 409, 413, 429].includes(status)
    ? new HttpException(error.message, status)
    : new ServiceUnavailableException("Persistence is unavailable");
}

@Injectable()
export class PersistenceClient implements OnModuleInit {
  private sign?: ReturnType<typeof createContextSigner>;
  private readonly privateKey: string;
  private readonly keyId: string;
  private readonly url: string;

  constructor(environment: EnvironmentService) {
    if (
      ["POSTGRES_URL", "POSTGRES_RUNTIME_URL", "POSTGRES_MIGRATION_URL"].some(
        (key) => process.env[key],
      )
    ) {
      throw new Error(
        "Database credentials must not be present in the API runtime",
      );
    }

    const key = environment.get("PERSISTENCE_RPC_PRIVATE_KEY");
    if (!key) throw new Error("PERSISTENCE_RPC_PRIVATE_KEY is required");

    this.privateKey = key;
    this.keyId = environment.get("PERSISTENCE_RPC_KEY_ID");
    this.url = `${environment.get("PERSISTENCE_RPC_URL").replace(/\/$/, "")}/trpc`;
  }

  private signer() {
    this.sign ??= createContextSigner(this.privateKey, this.keyId);
    return this.sign;
  }

  async onModuleInit() {
    await this.signer();
  }

  /** The immutable identity belongs to this client, never to mutable global state. */
  user(userId: string, requestId = currentRequestId() ?? randomUUID()) {
    return this.client({ kind: "user", userId, requestId });
  }

  resolveExisting(identity: VerifiedExternalIdentity) {
    return this.bootstrap(identity, "existing");
  }

  resolveOrCreate(identity: VerifiedExternalIdentity) {
    return this.bootstrap(identity, "provision");
  }

  private bootstrap(
    identity: VerifiedExternalIdentity,
    mode: "existing" | "provision",
  ) {
    return this.client({
      kind: "identity-bootstrap",
      identity,
      requestId: currentRequestId() ?? randomUUID(),
    }).identity.resolve.mutate({ mode });
  }

  private client(context: PersistenceContext) {
    const privateFetch: typeof fetch = (url, options) =>
      fetch(url, {
        ...options,
        signal: AbortSignal.any([
          ...(options?.signal ? [options.signal] : []),
          AbortSignal.timeout(120000),
        ]),
      });
    const options = {
      url: this.url,
      headers: async () => ({
        authorization: `Bearer ${await (await this.signer())(context)}`,
      }),
      fetch: privateFetch,
    };

    return createTRPCClient<PersistenceRouter>({
      links: [
        splitLink({
          // Scope-key lists can exceed URL limits. Ordinary no-input queries stay GET;
          // Express turns an absent POST body into {}, which is not z.void().
          condition: (operation) => operation.path === "providerSync.facts",
          true: httpLink({ ...options, methodOverride: "POST" }),
          false: httpLink(options),
        }),
      ],
    });
  }
}

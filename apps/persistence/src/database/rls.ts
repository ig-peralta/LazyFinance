import { AsyncLocalStorage } from "node:async_hooks";
import {
  type PersistenceContext,
  PersistenceContextSchema,
} from "@lazyfinance/contracts/context";
import { type Kysely, sql, type Transaction } from "kysely";

export class OutsideRlsSessionError extends Error {
  constructor() {
    super("RLS_DB accessed outside a context-scoped transaction");
  }
}

const transactions = new AsyncLocalStorage<Transaction<unknown>>();

export async function withRequestContext<T, Result>(
  database: Kysely<T>,
  context: PersistenceContext,
  operation: (transaction: Transaction<T>) => Promise<Result>,
  isolation: "read committed" | "repeatable read" = "read committed",
) {
  const ctx = PersistenceContextSchema.parse(context);
  if (transactions.getStore())
    throw new Error("Nested request scopes are not allowed");

  return database
    .transaction()
    .setIsolationLevel(isolation)
    .execute(async (tx) => {
      await sql`select
      set_config('lazyfinance.context_kind', ${ctx.kind}, true),
      set_config('lazyfinance.user_id', ${ctx.kind === "user" ? ctx.userId : ""}, true),
      set_config('lazyfinance.request_id', ${ctx.requestId}, true),
      set_config('statement_timeout', '20s', true),
      set_config('lock_timeout', '5s', true),
      set_config('idle_in_transaction_session_timeout', '10s', true),
      set_config('transaction_timeout', '100s', true)
    `.execute(tx);
      return transactions.run(tx as Transaction<unknown>, () => operation(tx));
    });
}

export function createRlsDbProxy<T>(): Kysely<T> {
  const lifecycle = new Set([
    "then",
    "catch",
    "finally",
    "onModuleInit",
    "onApplicationBootstrap",
    "onModuleDestroy",
    "beforeApplicationShutdown",
    "onApplicationShutdown",
  ]);
  return new Proxy({} as Kysely<T>, {
    get(_target, property) {
      // Nest/tRPC inspects every provider's constructor during discovery.
      if (property === "constructor") return Object;
      if (lifecycle.has(String(property))) return undefined;

      const tx = transactions.getStore();
      if (!tx) throw new OutsideRlsSessionError();
      if (
        property === "destroy" ||
        property === "transaction" ||
        property === "connection"
      ) {
        throw new Error("Repositories must reuse the scoped transaction");
      }

      const value = Reflect.get(tx, property, tx);

      return typeof value === "function" ? value.bind(tx) : value;
    },
  });
}

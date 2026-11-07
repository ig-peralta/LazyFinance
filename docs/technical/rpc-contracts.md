# RPC contracts and generated clients

Both HTTP RPC boundaries use NestJS-tRPC routers and vanilla tRPC clients. This
guide describes their source of truth and change workflow, not a REST API. See
[private RPC/RLS](persistence-security.md) for authorization and transaction details.

## Package boundaries

| Package / export | Contents | Consumers |
| --- | --- | --- |
| `@lazyfinance/contracts` | Public Zod schemas and inferred domain/input/output types | UI, API, persistence |
| `@lazyfinance/contracts/internal` | Private stored facts and named command schemas | API and persistence only |
| `@lazyfinance/contracts/context` | Strict user/bootstrap service contexts | Server-side authentication/transport |
| `@lazyfinance/rpc-api` | Type-only `ApiRouter` facade | UI and server-side tests/clients |
| `@lazyfinance/rpc-persistence` | Type-only `PersistenceRouter` facade | API and private-boundary tests |
| `@lazyfinance/rpc-auth` | Node-only JWT signing/verification | API and persistence, never UI |

Contracts do not import Nest, database implementations or generated RPC packages.
Public exports do not re-export private schemas. Browser code must not import
private/context contracts, signing code, Firebase Admin or server/database modules.
An export boundary and static guard are not authorization: servers still validate
every input, principal and context at runtime.

Each `*.rpc.ts` method declares explicit shared `input`, `output` and policy
`meta` schemas. NestJS discovers the real router providers. Generation produces
`libs/rpc-{api,persistence}/src/generated/server.ts`, containing placeholder
routers for type inference; those placeholders are **not runtime endpoints**.
Import only the facade's type:

```ts
import type { ApiRouter } from "@lazyfinance/rpc-api";
import { createTRPCClient, httpLink } from "@trpc/client";

const client = createTRPCClient<ApiRouter>({
  links: [httpLink({ url: "http://localhost:3000/trpc" })],
});
const config = await client.auth.config.query();
```

Authenticated UI code uses the existing scoped `RpcClient`, not another global
client made from this minimal anonymous example. Queries/mutations return native,
inferred Promises; there is no cross-app source import or HTTP/Observable adapter.

## Public surface

The [generated public router](../../libs/rpc-api/src/generated/server.ts) currently
contains **34 procedures**. Prefix each method below with its router name.

| Router | Methods | Responsibility |
| --- | --- | --- |
| `auth` | `config`, `loginMock`, `principal` | Provider selection, local mock login, verified principal |
| `accounts` | `list` | Active accounts, balances and freshness |
| `transactions` | `recent`, `list` | Ten-movement preview and cursor-paginated history with tag/review provenance |
| `objectives` | `list`, `progress` | Objectives and supported spending-budget progress |
| `summaries` | `monthly`, `comparison` | Financial summary and equivalent-period comparison |
| `income` | `sources`, `source`, `createSource`, `updateSource`, `archiveSource`, `expectations`, `createExpectation`, `updateExpectation`, `removeExpectation`, `expected`, `receipts`, `confirm`, `clear`, `summary` | Declarations, dated expectations, explicit receipts and calculated summaries |
| `tags` | `list`, `create`, `suggestions`, `decide`, `reset` | Single-tag classification and explicit no-tag/reset choices |
| `tagRules` | `list`, `create`, `replace`, `archive`, `apply` | Owned suggestion/approved automation rules and explicit application |

Only `auth.config` and `auth.loginMock` are anonymous. Mock login is available only
in mock mode and is rejected in production. No public procedure accepts a caller's
financial owner scope. Method schemas in the generated file and
[`libs/contracts/src/rpc`](../../libs/contracts/src/rpc/index.ts) define exact input
shapes; counts/tables here are a navigation aid, not a second schema definition.

The API's ordinary `GET /` is a liveness check. `/mcp` is authenticated Streamable
HTTP exposing seven read-only tools through the same services:
`consultar_saldos_cuentas`, `consultar_movimientos_recientes`,
`consultar_presupuestos_y_metas`, `consultar_avance_presupuestos`,
`consultar_resumen_gastos_mensuales`, `comparar_gastos_mensuales`, and
`consultar_ingresos`. External-client OAuth, a first-party agent and write tools
are not implemented by this RPC cutover.

## Private surface

The [generated private router](../../libs/rpc-persistence/src/generated/server.ts)
currently contains **38 procedures**. They expose owned facts and authoritative
commands rather than copying public screen calculations into persistence.

| Router | Methods |
| --- | --- |
| `identity` | `resolve` (bootstrap only) |
| `accounts` | `listActive` |
| `transactions` | `recent`, `list`, `aggregates`, `taggedAggregates` |
| `objectives` | `list` (nested tags), `spending` (signed sums/counts for API-supplied windows) |
| `income` | `sources`, `source`, `createSource`, `updateSource`, `archiveSource`, `expectedFacts`, `receipts`, `facts` |
| `incomeExpectations` | `list`, `create`, `update`, `remove` |
| `incomeReceipts` | `confirm`, `clear` |
| `tags` | `list`, `create` |
| `tagRules` | `list`, `create`, `replace`, `archive`, `facts`, `manual`, `reset`, `candidates`, `commit` |
| `providerSync` | `begin`, `facts`, `commit`, `failure`, `review` |

Every private procedure uses user context except `identity.resolve`. The latter
cannot be called with user context; bootstrap cannot call finance procedures.
`GET /health` is liveness, not a database/admin RPC. Provider synchronization is an
API-internal workflow; these procedures are not public bank-linking endpoints.

Read contracts follow the [purpose-shaped persistence read pattern](persistence-reads.md).
Select the projection actually needed: declarations/expectations, receipt facts,
classification-only aggregates, joined tag aggregates, or a complete snapshot.
Do not reintroduce table-shaped reads for the API to join or aggregate itself.

## Wire semantics and transport

- Money is an exact decimal string, not a floating-point JSON number. Nullable
  balances stay nullable; unknown is not zero. PostgreSQL numeric/int8 parsers
  are not globally changed to `Number`.
- Calendar dates stay date strings; timestamp values cross RPC as ISO strings.
  Santiago calendar/money interpretation lives in the API. Nested JSON keys are
  preserved by the database CamelCasePlugin.
- No-input procedures use `z.void()`, not `{}`. Pass no input (or `undefined` with
  request options). Object inputs are explicitly shaped; do not inject `userId`.
- Both clients use standard non-batched `httpLink`. The public server allows up
  to 10 procedures per batch; this is not a transaction guarantee. Private RPC
  permits one procedure per request. `providerSync.facts` and `objectives.spending`
  use private POST method override because key/window lists may exceed URL limits.
  Empty queries remain GET, avoiding Express turning an absent POST body into `{}`.
- Bounded factual arrays and serialized-byte limits reject overflow rather than
  serving a silently incomplete financial snapshot. See the
  [resource budgets](persistence-security.md#resource-and-error-boundaries).
- UI code consumes tRPC errors through `core/rpc/rpc-error.ts`, not fabricated
  `HttpErrorResponse` objects. Private SQL errors are sanitized before crossing
  boundaries. Ambiguous command failures are never automatically replayed.

## Cursor-paginated browsing

`libs/contracts/src/pagination` owns the reusable `CursorPageInputSchema`,
`CursorPageInfoSchema` and `cursorPageSchema(itemSchema)` factory. Compose named
domain inputs/outputs from these rather than repeating pagination envelopes:

```ts
export const TransactionsInputSchema = CursorPageInputSchema.extend({
  accountId: z.uuid().optional(),
});
export const TransactionsPageSchema = cursorPageSchema(RecentTransactionSchema);
```

Inputs are strict objects; `limit` defaults to 25 and accepts integers from 1 to
100. Omit `cursor` for the first page. Outputs contain `{ items, pageInfo }`, with
`pageInfo: { hasMore, nextCursor }`; the cursor is null exactly when no next page
exists. There is no total-count query or page-number promise.

Both `transactions.list` boundaries use that shape. Persistence filters and orders
before fetching `limit + 1`; its shared `pagination/cursor-page.ts` helper removes
the lookahead and builds metadata from the last returned row. The API maps stored
records to public items without changing metadata. The optional `accountId` is a
selection filter, never an ownership override. Removed movements are excluded;
review-pending movements and archived tag metadata remain visible as in `recent`.

Transaction cursors are versioned base64url boundaries containing both
`bookedAt` and `id`, ordered descending, plus the original account filter. SQL
preserves microsecond precision for cursor timestamps instead of round-tripping
through JavaScript `Date`. Treat tokens as opaque: pass them back with the same
filters, or restart without a cursor. Invalid/unsupported tokens or changed
filters produce `BAD_REQUEST`. Tokens are not encrypted, signed or authorization;
RLS independently scopes every page, even with a forged/foreign cursor.

Pages use separate statement snapshots, not a frozen history. Newer inserts do
not shift unchanged older rows through offset positions, but booking-date
corrections can move rows across boundaries. Restart to reconcile current history.
Do not compute financial totals from a page or paginate complete calculation
snapshots. `transactions.recent` and its MCP tool remain ten-item previews.

## Changing a contract or procedure

1. Put public schemas in the appropriate public contract module/export. Put
   private facts/commands in `/internal`, and keep application implementations out
   of either. Declare precise outputs instead of `unknown`, `any` or an
   implementation-dependent `ReturnType` in the generated boundary.
2. Register the router/provider in its Nest module. Every procedure needs explicit
   input/output schemas and default-deny-compatible metadata. Ordinary class
   dependencies use constructor inference with **runtime class imports**; keep
   `@Inject(RLS_DB)` / `@Inject(RUNTIME_DB)` for symbol tokens.
3. Keep financial orchestration in the API, joined/aggregated stored facts and
   cross-table atomic commands in persistence. Apply the
   [read-contract checklist](persistence-reads.md#change-review-checklist).
   A new table needs migration-time grants, related-owner RLS,
   table-local Kysely types, repository/module wiring and isolation tests.
4. Generate and review both router files from the repository root:

   ```sh
   pnpm rpc:generate
   pnpm rpc:check
   pnpm check:architecture
   pnpm build
   pnpm typecheck
   ```

5. Test business decisions and transformations in the responsible services/helpers,
   and security rules in the middleware/verifiers that implement them. Use
   integration coverage for ownership and atomicity, not unit tests of thin RPC
   forwarding or constructor wiring. Update this inventory and the affected
   domain guide when the exposed surface changes.

`scripts/rpc-generate.mjs` statically generates both libraries. Check mode uses
temporary output, compares it with committed sources and rejects unexpected
imports or implementation-based return inference. It does not start either app.
Biome intentionally excludes generated routers: never hand-format or hand-edit
them to fix drift. Normal builds consume their committed sources and do not run
generation or compile another app's source, including in pruned Docker builds.

The architecture guard checks important source/import/decorator patterns; it is
not a complete semantic security audit. Follow it with the appropriate
[test tier](development-workflow.md#verification-tiers).

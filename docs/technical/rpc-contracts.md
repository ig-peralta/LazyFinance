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
contains **54 procedures**. Prefix each method below with its router name.

| Router | Methods | Responsibility |
| --- | --- | --- |
| `auth` | `config`, `loginMock`, `principal` | Provider selection, local mock login, verified principal |
| `accounts` | `list` | Active accounts, balances and freshness |
| `transactions` | `recent`, `list`, `setInternalMovement`, `expenseAdjustments`, `setExpenseAdjustment`, `removeExpenseAdjustment` | History, owned internal-status corrections and purchase-attributed recoveries |
| `objectives` | `list`, `progress`, `budgetContributions`, `budget`, `budgetHistory`, `createBudget`, `updateBudget`, `archiveBudget`, `savingsGoal`, `savingsGoalHistory`, `createSavingsGoal`, `updateSavingsGoal`, `archiveSavingsGoal`, `savingsProgress`, `savingsContributions` | Revisioned management/history, spending and savings progress/evidence |
| `summaries` | `monthly`, `comparison`, `spendingContributions` | Financial summary, equivalent-period comparison and purchase-level spending evidence |
| `income` | `sources`, `source`, `createSource`, `updateSource`, `archiveSource`, `expectations`, `createExpectation`, `updateExpectation`, `removeExpectation`, `expected`, `receipts`, `confirm`, `clear`, `summary` | Declarations, dated expectations, explicit receipts and calculated summaries |
| `tags` | `list`, `create`, `update`, `archive`, `suggestions`, `decide`, `reset` | Owned tag lifecycle, single-tag classification and explicit no-tag/reset choices |
| `tagRules` | `list`, `create`, `replace`, `archive`, `apply` | Owned suggestion/approved automation rules and explicit application |

Only `auth.config` and `auth.loginMock` are anonymous. Mock login is available only
in mock mode and is rejected in production. No public procedure accepts a caller's
financial owner scope. Method schemas in the generated file and
[`libs/contracts/src/rpc`](../../libs/contracts/src/rpc/index.ts) define exact input
shapes; counts/tables here are a navigation aid, not a second schema definition.

The API's ordinary `GET /` is a liveness check. `/mcp` is authenticated Streamable
HTTP exposing eleven read-only tools through the same services:
`consultar_saldos_cuentas`, `consultar_movimientos_recientes`,
`consultar_presupuestos_y_metas`, `consultar_avance_presupuestos`,
`consultar_resumen_gastos_mensuales`, `comparar_gastos_mensuales`, and
`consultar_ingresos`, `consultar_avance_ahorro`, `consultar_aportes_ahorro`,
`consultar_compras_del_gasto`, and `consultar_compras_presupuesto`.
External-client OAuth, a first-party agent and write tools
are not implemented by this RPC cutover.

## Private surface

The [generated private router](../../libs/rpc-persistence/src/generated/server.ts)
currently contains **59 procedures**. They expose owned facts and authoritative
commands rather than copying public screen calculations into persistence.

| Router | Methods |
| --- | --- |
| `identity` | `resolve` (bootstrap only) |
| `accounts` | `listActive` |
| `transactions` | `recent`, `list`, `setInternalMovement`, `aggregates`, `taggedAggregates`, `spendingEvidence`, `expenseAdjustments`, `setExpenseAdjustment`, `removeExpenseAdjustment` |
| `objectives` | `list` (effective definitions/nested tags), `forPeriod` (optional owned ID selection), `spending` (revision-pinned sums/windows), `budgetEvidence`, `budget`, `budgetHistory`, `createBudget`, `updateBudget`, `archiveBudget`, `savingsGoal`, `savingsGoalHistory`, `createSavingsGoal`, `updateSavingsGoal`, `archiveSavingsGoal`, `savingsFacts`, `savingsEvidence` |
| `income` | `sources`, `source`, `createSource`, `updateSource`, `archiveSource`, `expectedFacts`, `receipts`, `facts` |
| `incomeExpectations` | `list`, `create`, `update`, `remove` |
| `incomeReceipts` | `confirm`, `clear` |
| `tags` | `list`, `create`, `update`, `archive` |
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

`transactions.setInternalMovement({ id, isInternalMovement })` accepts true/false
as a user override and null to return to the stored provider assessment (including
unknown). It changes no bank amount, booking time, source evidence, balance or tag.
Removed movements reject edits. Confirmed internal movements leave spending/budgets
and receipt eligibility; restoring external status re-evaluates retained receipts
and expense allocations against all other eligibility checks. Savings selection is
independent of internal status. Classification acknowledgements resolve only relevant
provider conflicts, preserving unrelated review states. Unchanged provider replays
retain an acknowledged override; materially different assessment evidence may reopen
a disagreement. The acknowledgement is a joined, fingerprinted sync fact. Unknown
status/history does not force manual reconciliation to use savings reads.

Tag names are trimmed, nonempty, case-sensitive and unique per user, including
archived names. Creation of an existing active name is idempotent and does not
recolor it; an archived-name collision is a conflict. Partial `tags.update` accepts
a name and/or nullable hex color without resetting omitted fields. Archive is
idempotent, forbids further edits/new assignments/rule matches, and preserves
historical movement, budget, goal, revision and rule references. Historical tag
labels/colors reflect current metadata; immutable revision selections retain IDs,
not separate copies of tag display metadata. Active `tags.list` remains unchanged.

Savings-target commands support lifetime, calendar-month/year and inclusive fixed
dates. Unlike deferred budget revisions, savings edits restate the current goal
view immediately while keeping immutable configuration/tag revisions. Updates and
archival require an expected version; archived targets cannot be edited. Archival
is server-timed/idempotent and preserves detail/history. History uses the shared
cursor envelope, bound to the goal ID. No command changes bank facts or creates
contributions; measured progress is a separate read capability.

`savingsProgress` reports exact decimal contributions, positive withdrawal totals,
signed net allocations, remaining target and an unclamped decimal-string percentage.
Monthly goals reset each month; yearly goals count January through the selected
month; lifetime/fixed goals are cumulative through that month, clipped to configured
dates and archival. `asOf` is an inclusive booking cutoff, not historical time travel
through edits/provider corrections. Pending-review cash movements are evidence but
not applied allocations. Partial/unknown account history is disclosed, not a gate.
Evidence shares the aggregate predicate, pins the goal write version and binds
continuation to its normalized selection. Continue with the returned `tracking.asOf`.
Pages are live current-fact reads, not a frozen cross-request database snapshot.
Overlapping goal selections are not additive; these amounts are not bank balances,
earned income or new wealth. Credit cards and removed movements never contribute.

Budget creation accepts monthly/yearly calendar-aligned starts or fixed inclusive
local dates. Started recurring edits take effect next month/year; started fixed
budgets and started schedules cannot be edited. Updates/archive require an expected
version. Details separate effective and pending definitions; `budgetHistory` uses
the shared cursor envelope, bound to the budget ID. Archive is server-timed and
idempotent, cancels pending revisions and preserves historical configuration.
Progress includes its revision ID and exact tracking bounds/archival state; late
eligible financial facts and confirmed recoveries can reconcile earlier purchases,
including in archived budgets. No purchase booked at or after archival is admitted.
No MCP write tools or management screen are added by these operations.

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

### Expense recovery semantics

`transactions.setExpenseAdjustment` explicitly confirms an amount and kind
(`refund` or expense `reimbursement`) between an owned external credit and an
owned eligible purchase. Both must be booked, clear and nonremoved; the credit
cannot precede the purchase. A provider reversal hint alone does not allocate it.
Partial recoveries, several credits per purchase and one credit split across
purchases are supported. Total allocation cannot exceed either the credit value
or remaining purchase cost, including retained decisions awaiting review.

- `grossSpending`/`grossSpent` retain purchase cost. `refunds` and `reimbursements`
  reduce `spending`/`spent` in the **original purchase period**, with the purchase's
  current tag and that budget period's revision-specific selection. Retagging the
  purchase moves its cost and recoveries together; the credit's tag does not choose
  attribution. Archived budgets accept corrections to previously tracked purchases,
  not purchases booked at or after the archival cutoff.
- `recoveredExpenseCredits` separately reports applied cash recovered in the
  credit's actual booking period, with distinct credit counts and review counts.
  It is not received income and does not offset unrelated credit-period purchases.
  Example: an October purchase of 100 and a November refund of 30 leave October
  gross 100/net 70; November reports recovered cash 30, not earned income 30.
- Any retained allocation prevents confirming that credit as income, even if part
  remains unallocated or a link needs review. An existing income receipt must be
  cleared before allocating a recovery. Only the unallocated credit remainder is
  unclassified; invalid allocations remain reserved rather than silently becoming
  income/unclassified cash. All links must be removed to confirm the credit as income.
- Corrected amounts or exact booking instants, removed/internal/review-pending
  movements, or invalid combined capacity produce `needs_review` and stop the
  affected reduction. The link remains available for explicit reconfirmation,
  resizing or removal; neither command rewrites bank amounts, dates or balances.
  Repeating an unchanged set preserves its confirmation time; removal is idempotent
  while both selected movements remain owned.
- Summary/progress `adjustmentsAsOf` records the observation cutoff independently
  of the purchase window. Later known refunds can restate closed periods. These
  reads use current stored facts/decisions, not a reconstruction of all previously
  edited/removed decisions or bank corrections. Comparisons use the same recovery
  observation time for both purchase windows. Income keeps its existing `asOf`.

These fields are shared by public summaries, progress and their MCP tools. The
dashboard explains gross/net cost, credit-period recoveries and pending review;
there is no refund-management screen or MCP write tool in this slice.

### Contributing purchases

`summaries.spendingContributions` accepts a month and optional tag selection
(omitted means all; null means untagged). `objectives.budgetContributions` accepts
the reported budget ID, revision ID and month. Both return cursor-paginated owned
purchases with exact gross/refund/reimbursement/net amounts plus **complete**
`totals` independent of page size. `untaggedInSelection` explains the part missing
from a tag breakdown; the overall summary includes it, while tagged/budget slices
do not. `includesUntagged` states the selection rule, not completeness of bank history.

Pass the reported summary/progress `adjustmentsAsOf` to explain its recovery cutoff;
booking `asOf` defaults to that observation time. Monthly/yearly/fixed budget windows,
revision-specific tags, activation/end/archive bounds and normalized eligibility
are shared with progress. Each purchase appears once, including card purchases;
internal, unknown, review-pending and removed movements do not contribute. Separate
recovery joins cannot multiply gross cost. Use `transactions.expenseAdjustments`
with the purchase ID to inspect its individual retained recovery allocations.

Continue using both `tracking.asOf` and `tracking.adjustmentsAsOf`, the same month,
tag/budget/revision and cursor. Changed filters/cutoffs or archived tracking bounds
require a fresh first page; stale budget revisions conflict. PostgreSQL microseconds
are preserved for evidence, boundaries and inclusive observation cutoffs. The private
page, total and coverage reads form one repeatable-read snapshot, not a frozen
snapshot across separate pages. Corrections can restate current-fact totals, even
in archived periods. Do not manufacture a balance or full-history claim from this read.
Read-only MCP tools expose these same services; no drill-down UI is added here.

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
records to public items without changing metadata. Optional history filters are
`accountId`, `bookedFrom` (inclusive Santiago calendar date), `bookedBefore`
(exclusive Santiago calendar date), `tagId` (null means untagged), `type`
(`debit`/`credit`), `isInternalMovement` (true/false/null means unknown), and
`merchant` (trimmed, case-insensitive literal substring; `%`, `_` and backslash
are not wildcards). Omitted tag/internal filters select all states. Dates must be
valid and ordered; nonempty merchant text is bounded to 120 characters.
These are selection filters, never ownership overrides. Removed movements are excluded;
review-pending movements and archived tag metadata remain visible as in `recent`.

Transaction cursors are versioned base64url boundaries containing both
`bookedAt` and `id`, ordered descending, plus a SHA-256 digest of all normalized
selection filters. Page size can change without invalidating a cursor. SQL
preserves microsecond precision for cursor timestamps instead of round-tripping
through JavaScript `Date`. Treat tokens as opaque: pass them back with the same
filters, or restart without a cursor. Invalid/unsupported tokens or changed
filters produce `BAD_REQUEST`. Tokens are not encrypted, signed or authorization;
RLS independently scopes every page, even with a forged/foreign cursor.
Tokens from the earlier account-only cursor format require a fresh first page.

Pages use separate statement snapshots, not a frozen history. Newer inserts do
not shift unchanged older rows through offset positions, but booking-date
corrections can move rows across boundaries. Restart to reconcile current history.
Do not compute financial totals from a page or paginate complete calculation
snapshots. `transactions.recent` and its MCP tool remain ten-item previews; the
dashboard requests only the first page with `limit: 10` and has no continuation UI.

`transactions.expenseAdjustments` uses the same page envelope for either selected
movement, including links awaiting review. Its UUID-ascending cursor is bound to
`transactionId`; ownership is independently checked on each page. This is browsing,
not the source of financial totals, and later inserts/removals are not frozen by a
continuation token. Adjustment timestamps retain SQL microseconds across RPC.

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

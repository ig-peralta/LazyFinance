# LazyFinance API

NestJS financial workflow service exposing public tRPC at `/trpc` and read-only
MCP at `/mcp`. The only ordinary HTTP route is the public `GET /` listening check.
Business REST controllers have been retired; Angular uses vanilla tRPC clients.

Technical references: [architecture](../../docs/technical/architecture.md),
[provider-neutral identity](../../docs/technical/identity.md),
[RPC contracts/code generation](../../docs/technical/rpc-contracts.md),
[private RPC/RLS](../../docs/technical/persistence-security.md) and
[development/verification](../../docs/technical/development-workflow.md).

## Boundaries

- Firebase Admin/mock verification resolves an external identity through private
  `identity.resolve` and returns an internal application UUID.
- Domain services own money/calendar calculations, income schedules, summaries,
  budget progress, tag matching/ranking and provider orchestration.
- Typed clients call `@lazyfinance/rpc-persistence` with a 30-second Ed25519 JWT.
  Context is immutable per client, and public tRPC request IDs propagate privately.
- **No database driver, pool or SQL access in the API.** Owner-only
  migration/seed commands belong to [persistence](../persistence/README.md).
- Provider calls and preparation stay outside SQL transactions. A prepared sync
  commits facts, conflicts, decisions/events and checkpoint atomically. Known
  stale-input rejections may be recomputed; ambiguous network failures are not retried.

## Development

Follow the [root setup](../../README.md#run-locally), copy `.env.example` into the
ignored `apps/api/.env`, and configure:

| Variable | Purpose |
| --- | --- |
| `PERSISTENCE_RPC_URL` | Private service base URL; default `http://127.0.0.1:3001`. |
| `PERSISTENCE_RPC_PRIVATE_KEY` | API-only Ed25519 PKCS8 PEM; generate with `pnpm rpc:keys`. |
| `PERSISTENCE_RPC_KEY_ID` | Matching key identifier; default `primary`. |
| `AUTH_PROVIDER` | `mock` locally, or `firebase`. |
| `NODE_ENV` | Mock authentication is rejected in `production`. |
| `PORT` | Default `3000`. |
| `CORS_ORIGINS` | Allowed browser origins; default local Angular origins. |
| `FIREBASE_PROJECT_ID` | Required in Firebase mode. |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Optional paired Admin credentials. |
| `FINTOC_PUBLIC_KEY`, `FINTOC_SECRET_KEY`, `FINTOC_TOKEN_ENCRYPTION_KEY` | Optional matched-mode Movements keys plus a separate 32-byte hex token-encryption key; API-only. |

The API needs the private RPC URL/signing key, not database configuration.
App-local dotenv files are not the root Compose `.env`.
The authenticated `banking` RPC supports owner-bound Fintoc linking, access checks,
relink, disconnect, `importInitial`, repeatable `refresh` and readonly `syncStatus`.
Refresh pulls the latest available Fintoc snapshot, not a forced bank update.
Movements start at the connection's first-link day in Santiago, with no pre-link
backfill; balances are reported independently. Refresh/relink does not reset that
start. Fintoc cannot reliably distinguish times within a booking day.
The web connection settings consume these commands and statuses separately from
the stored-balance page; authorization/access checks never import implicitly.
See the [linking contract](src/banking/linking/README.md) for Widget/credential
handling and the [first-import guide](src/banking/fintoc/README.md) for conservative
financial mappings, supported products and atomic import limits.

`pnpm --filter api dev` starts watch mode. `build`, `typecheck` and `test` are also
available. Public auth procedures are `auth.config` and `auth.loginMock`; all
others require a verified bearer. Mock login uses `demo@lazyfinance.cl` /
`password` only after an explicit persistence demo seed. The SSR cookie is not
accepted directly as API authentication.

## Contracts and checks

`libs/rpc-api` contains committed generated router types with public schemas from
`libs/contracts`. Run `pnpm rpc:generate` after changing routers and `pnpm rpc:check`
to detect drift. Normal application builds need neither generation nor another
application's source. The browser must never import private contracts/signing code.

`onboarding.state` and `onboarding.finish` persist optional-guide state through
user-scoped private RPC, not the authentication principal or browser storage.
Finish accepts only skip/completion; completion is terminal and retains its first
server timestamp even after delayed skips. It has no financial prerequisites or
automatic setup writes. See the [wire semantics](../../docs/technical/rpc-contracts.md#wire-semantics-and-transport).

Feature services inject the single `PersistenceClient` and call its inferred
`user(userId)` RPC surface directly. There are no per-domain persistence adapters
or database-shaped Date conversions. Financial calculations stay in the owning
service or shared pure domain helpers, not in transport wrappers.

Follow the [persistence read pattern](../../docs/technical/persistence-reads.md):
joined objective/tag reads, SQL sums for API-computed budget windows, narrow
income reads and snapshot-local rule/expectation indexes. Do not fetch full
collections just to join IDs or sum raw movements in a feature service.

Explicit refunds and expense reimbursements reduce the original purchase period's
net spending/budget cost; recovered credit-period cash is separate from earned
income. Bank facts and balances are unchanged. See the shared
[recovery semantics](../../docs/technical/rpc-contracts.md#expense-recovery-semantics)
for partial/split allocations, archived budgets, income conflicts and review states.

`summaries.spendingContributions` and `objectives.budgetContributions` expose
purchase-level evidence with complete aggregate totals, exact cutoffs and explicit
untagged coverage. They reuse the same reporting windows and eligibility as the
reported amounts, including archived budgets and later recoveries. Read-only MCP
tools call those same services. See [contributing purchases](../../docs/technical/rpc-contracts.md#contributing-purchases)
for revision/observation pinning and live-page limitations. The web budget
drill-down consumes these results without summing pages into a financial total.

### Savings contribution policy (LAZ-35)

The executable [eligibility policy](src/objectives/savings-policy.ts) and its
[reconciled fixtures](src/objectives/savings-policy.spec.ts) define **recorded goal
allocations**, not bank balances, new wealth or earned income. LAZ-35 defines and
tests the rule; LAZ-42 adds owned target management below. LAZ-40 connects measured
`objectives.savingsProgress` and paginated `savingsContributions` reads, also exposed
by the read-only MCP tools `consultar_avance_ahorro` / `consultar_aportes_ahorro`.
They share exact eligibility/cutoffs, disclose pending-review counts and cash-account
history coverage, preserve negative net observations and never infer a bank balance.
Monthly/yearly goals reset by calendar period; lifetime/fixed views accumulate
through the requested month. Evidence continuation retains the returned `asOf`;
selection/configuration changes require a fresh page. Current-fact corrections may
restate past views; an observation cutoff is not historical time travel.

Target management uses `objectives.savingsGoal`, `savingsGoalHistory`,
`createSavingsGoal`, `updateSavingsGoal` and `archiveSavingsGoal`. Lifetime,
monthly/yearly and fixed inclusive dates are supported. Edits apply immediately
to the current goal view, retaining immutable configuration/tag revisions rather
than pretending past configurations never existed. Expected versions reject lost
updates. Archived targets cannot be edited and retain their detail/history and
server-timed counting cutoff. Newly selected tags must be owned and active;
retained archived tags can remain selected. These commands never change bank facts
or fabricate a contribution. The web app exposes target management and measured
progress/evidence while retaining these meanings; see the [UI guide](../ui/README.md).

#### Selected tags and direction

- Selecting a goal's tags gives their booked **cash movements** an allocation
  meaning for that goal. A matching credit adds a contribution; a matching debit
  is a withdrawal/use of allocated money. Either an owned checking or savings
  account qualifies: a dedicated savings account is not required. Credit-card
  movements do not represent allocated cash and are excluded.
- A movement counts once per matching goal, regardless of how many tags the goal
  selects. No matching tag means no contribution; neither positive amounts, tag
  names, provider hints nor a balance creates an allocation automatically. Current
  manual/approved-rule assignments are used; historical archived tag metadata does
  not erase a retained assignment. Retagging moves that movement's allocation.
- Goals sharing tags are intentionally overlapping views. The same movement can
  appear in each; their amounts must not be added into a supposedly reserved or
  available savings balance. Selecting a tag neither moves nor locks bank money.
- Internal status is **not** an eligibility gate: both known internal/external and
  unknown transfers follow the same signed rule. Tag the receiving cash leg to
  record an addition. A tagged source debit is a withdrawal, never another positive
  contribution. If both legs belong to the same goal, their signed amounts net to
  zero; if they belong to different goals, they move recorded allocations between
  goals. No counterpart matching or manual reconciliation is required. Untagged
  counterpart legs are not invented or automatically assigned the goal's tag.
- A tagged cash-side card payment can withdraw allocated money, but the card-side
  credit cannot add it again. Ordinary spending/earned-income/internal-transfer
  rules stay unchanged. A cash credit can be both allocated to a goal and confirmed
  as income in that separate view; the views are not additive measures of cash.

#### Periods, withdrawals and corrections

Evaluate only `start <= bookedAt < end` and `bookedAt <= asOf`, preserving exact
booking instants and Santiago calendar boundaries. The policy accepts an explicit
observation window; it does not introduce or edit supported goal schedules.
An amount-only/lifetime goal uses all available matching history through the
report horizon (`start: null` when no start was declared), without resetting every
month or year. Explicit monthly/yearly windows describe those periods; fixed
windows retain their historical result after ending. Do not reuse the spending
budget selector, which intentionally excludes savings goals and expired windows.

Withdrawals and separately booked reversals use their real booking dates and
signed values. A positive provider reversal hint does not become an invented
negative movement. Retractions exclude the removed original; corrections use
current facts. Review-pending matching movements remain pending, not zero-valued
contributions, while other clear movements still count. Do not create a second
synthetic reversal or reuse LAZ-36's original-purchase attribution: a November
refund can add recorded cash to a November savings allocation while correcting
October spending in that other view. Keep exact contribution/withdrawal components
and the signed net, including negative net observations; never infer an opening
balance or clamp away a withdrawal because earlier history is unavailable.

For example, a tagged cash credit of 200 and a tagged withdrawal of 50 produce
observed contributions 200, withdrawals 50 and net 150. A checking-to-savings
transfer with only its receiving credit tagged adds 200; the same transfer with
both legs tagged to the goal has net zero, not 400.

#### Useful results without a completeness gate

An unknown internal classification alone does not affect this signed allocation
rule. Factual `needs_review` status does, so only the affected matching movement
stays pending. Partial/unknown history or an unknown balance must not suppress
known allocations or require users to reconcile every transfer first.

The measured progress read identifies the observation window and available
history separately: "recorded net contributions from imported movements", not
"your entire savings balance". Missing history can contain additions **or**
withdrawals, so observed net is not necessarily a lower bound. A recorded-progress
percentage may be useful with that scope; it is not proof that all historical
funding is known. Relevant retained history may include inactive accounts. No
balance-derived opening amount, confidence engine or reconciliation workflow is
introduced here.

Ownership still belongs to signed persistence/RLS. Measured reads use complete,
purpose-shaped owned aggregates and paginated evidence, not totals of a history
browse page or downloads of every transaction to the API. Real-RPC integration
tests cover ownership, periods, current-fact corrections and evidence reconciliation;
pure policy tests alone do not establish database isolation or live-provider readiness.

Public bodies are limited to 1 MiB and batches to 10 procedures. Private provider
runs are bounded by 100 pages, 50,000 records, 32 MiB normalized JSON and 64 MiB
prepared JSON/results. Oversized runs fail without partial writes/checkpoint
advancement; they are never silently split into independent commits. The private
`providerSync.facts` and `objectives.spending` queries use POST method override
for large key/window lists;
ordinary empty queries remain GET. The private client deadline is 120 seconds.

Unit tests stay beside their implementation in `src/**/*.spec.ts`; run only those
with `pnpm --filter api exec vitest run src`. Integration suites live in
`tests/integration/<feature>/*.integration.spec.ts`, shared fixtures in
`tests/fixtures/`, and app-wide test setup in `tests/setup.ts`. App builds exclude
`tests/`; typechecks and default Vitest discovery include the relocated tests.

Service/helper unit tests can use mocked dependencies without listeners.
HTTP/RPC/MCP integration tests can run without real persistence, but Supertest
can open ephemeral HTTP listeners; the full API suite is **not serverless-only**.
DB/workflow cases skip without the owner fixture URL and a matching private test
service environment. Choose the
[verification tier](../../docs/technical/development-workflow.md#verification-tiers)
appropriate to the session.

For service-starting integration checks, first provide a disposable PostgreSQL 18
database ending in `_test`. From the root (placeholder URL):

```sh
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test pnpm test:integration
```

The runner builds dependencies, migrates/provisions, starts compiled persistence
with restricted runtime credentials and ephemeral keys, runs API tests through
both real HTTP boundaries, then stops that service. Owner SQL is confined to
`apps/api/tests/fixtures` tooling. It is not available to the API application/image.
Live Firebase verification additionally requires `TEST_FIREBASE_ID_TOKEN_A/B` and
optionally `TEST_FIREBASE_PROJECT_ID` / `TEST_FIREBASE_EXPIRED_ID_TOKEN`.

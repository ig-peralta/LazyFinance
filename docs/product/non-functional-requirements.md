# Non-functional requirements

These **product quality requirements** apply to LazyFinance's authenticated dashboard, connected banking, MCP access and first-party text agent. Each requirement sets an acceptance target for the planned product. The [product requirements](product-requirements.md) define the capabilities and the [product vision](product-vision.md) sets their sequence; these targets balance trustworthiness with the time constraints of a capstone project.

Stage B's [2026-11-09 closure](../planning/stage-b/closure.md) records development
evidence and accepted exceptions. It does not certify every target below;
live-provider/model, performance and operational gaps retain their release
implications.

Prioritize **NFR-01 through NFR-05** before exposing real-user or provider data. **NFR-06 through NFR-08** define a practical quality bar for the usable product; revisit their exact thresholds if the chosen agent runtime or deployment environment changes. Voice and additional providers inherit these rules when they enter Sprint C scope.

## NFR-01 — User isolation and access control

**Goal:** A user sees or changes only their own financial records through the UI, HTTP API, MCP tools, first-party agent and bank connections. A third-party MCP client receives only the permissions explicitly authorized for that user.

**Acceptance target:** Missing, invalid or expired credentials cannot access protected operations. Requests referencing another user's account, movement, tag, objective, income source, provider connection, conversation or saved action return an authorization/not-found response **without revealing that user's data**. Every agent/tool call is bound to the server-resolved user, not a model/client-selected owner. First-party action execution requires explicit saved-version approval; MCP execution requires its separately selected scopes and a current grant. Local mock credentials are unavailable in production mode.

## NFR-02 — Confidentiality and session privacy

**Goal:** Banking and identity credentials, financial records and session state do not leak across clients, logs or deployments.

**Acceptance target:** Provider secrets and administrative credentials remain server-side and outside the repository/browser bundles. Only public content is prerendered; private pages use browser-owned verified sessions and CSR, with no protected transfer-state payload. Protected responses are private/non-cacheable, and account changes cannot inherit another user's financial response. Sign-out clears local access; invalid/expired/revoked external-client grants are rejected. Demo fixtures use synthetic data. Model-provider retention and operator chat/receipt/account-deletion policies must be explicit before rollout; expiry must not be advertised as guaranteed physical deletion.

## NFR-03 — Financial integrity and explainability

**Goal:** The same financial question has a consistent, traceable meaning in the dashboard, API, MCP tools and text agent.

**Acceptance target:** CLP amounts use decimal precision to two places and the Santiago calendar for period boundaries. Internal transfers and card payments do not inflate spending or income; each eligible movement counts once per budget; untagged spending remains in overall totals. Expected income, confirmed received income and available balances remain distinct. Savings progress and net-of-refund spending are reported only after their counting rules are defined, with contributing movements or a clear explanation of incomplete data. Equivalent periods return equivalent comparisons across interfaces.

## NFR-04 — Idempotent, recoverable banking synchronization

**Goal:** Retries and provider failures never duplicate transactions, erase user decisions or make stale information look current.

**Acceptance target:** Account identifiers are scoped to a connection, and movement identifiers to an account. Replaying a completed import is idempotent; a failed or incomplete run cannot advance its last confirmed checkpoint or overwrite a newer reported balance. Provider corrections preserve owned tags/receipts or flag incompatible interpretations for review. Users can distinguish unknown, partial and complete history and see last-success, failed, expired and revoked connection states with a useful retry path.

## NFR-05 — Graceful degradation and truthful state

**Goal:** The product remains understandable when a provider, identity service, model or financial read is unavailable.

**Acceptance target:** A failed refresh leaves last-good data labelled with its age. Empty, loading, error and retry states distinguish “no data” from “cannot retrieve data.” The assistant handles unsupported/incomplete claims explicitly; model/tool failure cannot approve or partially execute finance. Explicit approved/MCP commands and receipts commit atomically. Cancellation or a lost response never implies rollback; clients reconcile saved status instead of blindly replaying mutations. Temporary integration outages do not silently change stored financial facts.

## NFR-06 — Interactive performance

**Goal:** Common financial reads remain responsive on a representative CLP demo dataset without requiring production-scale infrastructure for the capstone.

**Acceptance target:** With a warmed local stack, at least 100 requests per route and up to 10 concurrent authenticated requests, p95 server/loopback response time for account balances, recent movements, monthly spending and spending-budget progress is **below 500 ms per route**. The UI shows visible progress within **one second** when an operation waits on a network/model response. Record assistant response/timeout targets separately for the configured runtime/model; this read target does not include model inference or bank synchronization.

The selected assistant runtime has [explicit generation, tool and stream bounds](../technical/financial-assistant.md#streaming-cancellation-and-limits), including a 60-second SDK total and 65-second HTTP signal. These are configured safety limits, not measured answer-latency results. The route-latency/load target above remains unverified at the Stage B gate.

## NFR-07 — Accessible, understandable core workflows

**Goal:** People can navigate, sign in, inspect finances and use delivered management/chat flows without relying on a precise screen size or pointer device.

**Acceptance target:** Core controls have meaningful names, visible focus, keyboard operation and clear validation feedback. Layouts remain usable at **360 px mobile** and **1280 px desktop** widths without hiding essential financial meaning. Amounts identify currency and period; account types, freshness, estimates, unknown values and disabled/not-yet-available features are labelled in Spanish. A user can recover from an error without losing an unrelated completed action.

## NFR-08 — Reproducible setup and maintainable changes

**Goal:** A developer can reproduce the supported application and evolve its financial model without undocumented local state.

**Acceptance target:** From a clean checkout and documented prerequisites, the supported local setup installs dependencies, starts PostgreSQL/API/UI, applies versioned migrations and seeds representative CLP data using documented commands and example configuration containing no real secrets. Financial contract or schema changes include a migration where needed and update the affected interfaces and technical documentation. Every run path documents the initialization steps required for an operational database.

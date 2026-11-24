# Stage C security regression testing — LAZ-109

**Outcome, 2026-11-24 UTC:** the selected application security regressions passed.
The dependency advisory audit is **not clean**. This is evidence for the
[Stage C gate](definition-of-done.md), not a production security acceptance or a
replacement for separately authorized live-provider validation.

## Scope and tested baseline

- Application code and lockfile: [`323f28cf`](https://github.com/ig-peralta/LazyFinance/commit/323f28cfb47d97acce30da6a063adfacf52b59fe), including the simulated bank from [PR #50](https://github.com/ig-peralta/LazyFinance/pull/50), with the LAZ-109 test changes in this branch. No runtime, schema or dependency changes were needed for these application checks.
- Local Node `24.19.0`, pnpm `9.0.0`, PostgreSQL `18.6` (`postgres:18-alpine`). API and persistence used separate disposable `_test` databases on the same isolated loopback container. Test listeners, role credentials and service keys were local and disposable.
- Synthetic owners, records and OAuth clients only. API authentication/provider fixtures were controlled; the public/private HTTP boundary, signature verification, restricted PostgreSQL roles and RLS were real. UI checks used Angular's test runner and jsdom, not a browser session against a deployment.

## What the tests establish

| Boundary | Expected and observed result | Evidence |
| --- | --- | --- |
| Public RPC authentication and response privacy | A batch containing public configuration and a protected query returns the public result and `UNAUTHORIZED` for the protected call; nothing sensitive is cached or returned in that denial. Anonymous requests to all seven public demo procedures return `401`. An authenticated request with demo tools off returns `404` without opening a scoped persistence call. Those error responses have `private, no-store` and no stack. | [HTTP authentication suite](../../../apps/api/tests/integration/auth/http.guard.integration.spec.ts); new cases supplement existing bearer, CORS and input validation |
| Signed private RPC and purpose isolation | Invalid service identity is denied; valid signatures do not expand a context's authority. An unsigned demo read returns `401`; identity-bootstrap, OAuth, banking scheduler and banking transport contexts cannot read preparation or reset demo data. With the persistence flag unset or false, even a user context cannot reach any privileged demo resolver or open its SQL scope. | [Signed-context tests](../../../apps/persistence/src/rpc/context-auth.spec.ts), [middleware tests](../../../apps/persistence/src/rpc/rls.middleware.spec.ts) and [PostgreSQL boundary suite](../../../apps/persistence/tests/integration/persistence.integration.spec.ts) |
| Database grants, owner isolation and atomicity | The normal runtime gets no mock source grant and only `INSERT` on mock sync history. RLS rejects executed entries for a foreign connection, mismatched owner, non-mock connection or scheduler context; generated history cannot be appended by runtime. History is unchanged after rejection. Established cases also cover forced RLS, foreign relationships, pooled context cleanup and rollback. The dedicated demo role cannot read identity or MCP grants. | [PostgreSQL boundary suite](../../../apps/persistence/tests/integration/persistence.integration.spec.ts); new grant and event ownership checks run with the restricted runtime login |
| Mock banking across two owners | The second owner sees no connection and gets `NOT_FOUND` for its selection, sync status and history, as well as access check, discovery, selection, import, refresh, relink and disconnect. The first owner's connection, selection, sync facts, history and source are unchanged. | [Signed mock-bank workflow](../../../apps/api/tests/integration/banking/mock-bank.integration.spec.ts); new cross-owner case alongside owned import, source-only mutations and recovery |
| MCP scope and assistant action authority | First-party and MCP credentials remain separate. Incorrectly scoped or revoked grants do not execute actions; refresh replay is handled by the existing lifecycle checks. Foreign, expired or otherwise invalid assistant approvals do not apply; exact saved-version approval remains distinct from model output. | Existing [OAuth security](../../../apps/api/tests/integration/mcp/oauth-security.integration.spec.ts), [MCP action](../../../apps/api/tests/integration/mcp/mcp-actions.integration.spec.ts) and [assistant approval](../../../apps/api/tests/integration/assistant/assistant-actions.integration.spec.ts) suites rerun |
| Browser session isolation | Protected requests wait for an accepted session, and an obsolete scope cannot adopt a late result for another account. Public prerendering does not initialize identity or transfer protected workspace state. | Existing [scoped transport](../../../apps/ui/src/app/core/rpc/rpc-client.spec.ts), [session](../../../apps/ui/src/app/core/auth/session.service.spec.ts), [workspace boundary](../../../apps/ui/src/app/layout/workspace-boundary.spec.ts) and [rendering](../../../apps/ui/src/app/app.rendering.spec.ts) checks rerun |

## Execution and reproduction

Use the [service-starting verification tier](../../technical/development-workflow.md#service-starting-integration-checks).
Supply owner URLs for separate **disposable** PostgreSQL 18 `_test` databases
through the environment. Tests provision their own runtime/demo roles and
ephemeral keys. Database startup/cleanup is separate from the runners. Do not
use the local development or deployment database.

```sh
pnpm --filter api exec vitest run tests/integration/auth/http.guard.integration.spec.ts
TEST_POSTGRES_OWNER_URL="$API_TEST_OWNER_URL" pnpm test:integration --maxWorkers=2
TEST_POSTGRES_OWNER_URL="$PERSISTENCE_TEST_OWNER_URL" pnpm --filter persistence exec vitest run --maxWorkers=2
pnpm --filter ui exec ng test --watch=false
pnpm audit --prod --json
```

| Run | Observed result |
| --- | --- |
| Focused API HTTP authentication | 20 passed |
| Full API runner (includes signed API-to-PostgreSQL workflows) | 640 passed, 5 conditional live cases skipped |
| Full persistence suite with PostgreSQL | 138 passed (77 unit, 61 integration) |
| Angular one-shot suite | 673 passed |
| Build, typecheck, lint, format, RPC drift, architecture | Passed; cached build output and nonfatal build/lint warnings retained |
| Production dependency advisory audit | Exit 1; findings recorded below |

The skipped live identity/model cases are not security acceptance. No external
bank/model/voice session, real-user data, deployment scan or penetration test
was used. No application security failure was observed in the selected checks.

## Advisory findings and disposition

`pnpm audit --prod --json` against the npm registry reported **32 advisories**:
**1 critical, 9 high, 18 moderate, 4 low**. This is a dated package-graph result;
it does not establish deployed reachability or equivalence to image scanning.
The critical finding is on `proxy-addr` (`2.0.7`). The high findings cover
`@grpc/grpc-js`, `@nestjs/microservices`, `body-parser`, `multer` (four),
`source-map-js` and `zod`. The lockfile was not changed. Rerun the audit for the
current set and triage/report a disposition instead of relying on these counts
as a standing waiver.

| Carryover | Stage / release implication |
| --- | --- |
| Unresolved critical/high dependencies | LAZ-99 records the risk. Before public-release approval, assess reachable paths in the candidate images, prioritize compatible patched dependencies and rerun the affected regressions and image/advisory checks. Any exception requires an explicit release decision. |
| Deployment and service trust | The suite does not establish ingress hardening, deployment headers or TLS, credential rotation, rate limits or recovery behavior in the deployed configuration. Keep private RPC inaccessible to browsers, restrict demo tools to development data, and verify those controls on the reviewed deployment. The short-lived [service assertion](../../technical/persistence-security.md#signed-service-contexts) is not a one-time request token. |
| Privacy, retention and live-provider boundaries | Authorization and user isolation tests do not verify remote-provider retention/deletion, costs, live token and device behavior or broader operational abuse controls. Retain these in the gate and the separate [product release review](../product-definition-of-done.md). |

The controlled test deliverable meets LAZ-109. The Stage C review and any
production release decision remain separate.

# Agent guide

Use this index to find the relevant project guidance before changing code. Keep
implementation rules in their owning documents instead of duplicating them here.

## Documentation index

| Working on | Start here |
| --- | --- |
| Project overview, workspace commands and complete documentation index | [Root README](README.md) |
| Current implementation versus historical evidence | [Technical documentation index](docs/technical/README.md) |
| Runtime boundaries and responsibility split | [Architecture](docs/technical/architecture.md) |
| API/persistence read shapes, joins, aggregates and in-memory indexes | [Persistence read pattern](docs/technical/persistence-reads.md) |
| Public/private schemas, generated clients and procedure changes | [RPC contracts](docs/technical/rpc-contracts.md) |
| Signing, scoped transactions, RLS, atomic commands and resource limits | [Persistence security](docs/technical/persistence-security.md) |
| Tables, relationships, exact representations and migrations | [Database model](docs/technical/database-model.md) |
| Authentication, providers and internal user identity | [Identity](docs/technical/identity.md) |
| External MCP authorization, OAuth/client compatibility and grant ownership | [MCP authorization](docs/technical/mcp-authorization.md) |
| First-party chat, model providers, grounding, history, streaming and evaluation | [Financial assistant](docs/technical/financial-assistant.md) |
| UI resources, cancellation, browser sessions and public/private rendering | [UI data lifecycle](docs/technical/ui-data-lifecycle.md) |
| Installation, environments, Compose and troubleshooting | [Technical manual](docs/technical/technical-manual.md) |
| Build, formatting, injection, type safety, test layout and verification tiers | [Development workflow](docs/technical/development-workflow.md) |
| File placement, helper extraction and reuse | [File ownership and extraction](docs/technical/development-workflow.md#file-ownership-and-extraction) |
| App-specific development | [API](apps/api/README.md), [persistence](apps/persistence/README.md), [UI](apps/ui/README.md) |
| Provider contracts and prepared banking synchronization | [Banking guide](apps/api/src/banking/README.md) |
| Manual tag decisions, matching and approved automation | [Tagging guide](apps/api/src/transactions/tagging/README.md) |
| Product direction, interoperability and requirements | [Vision](docs/product/product-vision.md), [innovation](docs/product/innovation.md), [requirements](docs/product/product-requirements.md) |
| User outcomes and quality targets | [User journeys](docs/product/user-journeys.md), [non-functional requirements](docs/product/non-functional-requirements.md) |
| Planning, stage milestones and backlog evidence | [Planning index](docs/planning/README.md), [project method](docs/planning/project-method.md), [backlog](docs/planning/backlog.md) |
| Product and stage completion criteria | [Product Definition of Done](docs/planning/product-definition-of-done.md), [stage gates](docs/planning/README.md#stage-gates) |
| Academic material and conceptual diagrams | [Submissions](docs/submissions/README.md), [diagram inventory](docs/diagrams/README.md) |

Source/configuration and migrations take precedence over stale prose. Update the
affected guides and generated contracts alongside implementation changes. Do not
rewrite dated evidence as a claim about the current implementation.

Choose checks using the development workflow's verification tiers and the user's
constraints: integration tests may open listeners even with mocked persistence.
Do not start services or serviceful tests during a static-only task.

## Commit conventions

- Use Conventional Commit subjects: `type(scope): description`, with scope optional.
  Types include `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `chore`,
  and `style`.
- Keep subjects short, imperative and specific, for example
  `refactor(api): use purpose-shaped persistence reads`.
- Use subject-only messages; no commit body.
- Aim for the smallest coherent, atomic commits the work naturally supports.
  Treat atomicity as a judgment criterion, not a quota: do not force artificial
  splits when changes are tightly coupled. Keep dependent code, contracts, tests
  and generated output together; include their relevant documentation where practical.
- Stage only the intended work. Do not discard unrelated changes or amend/rewrite
  existing commits unless explicitly requested.

## Pull request conventions

- Use the same Conventional Commit format for the title; describe the overall
  outcome, not a list of implementation steps.
- Keep each PR focused on a coherent outcome. Summarize what changed and why,
  including material contract/schema changes or operational risks when applicable.
- Include concise **Summary** and **Validation** sections. State which checks ran,
  their results, and which tests/checks were not run. Do not imply that static
  checks prove database behavior, load performance or live-provider readiness.
- Link relevant issues when available; do not invent issue references or claim
  unrelated work is complete.
- Push, create a PR, or merge only when requested. Creating commits does not
  authorize any of those actions.

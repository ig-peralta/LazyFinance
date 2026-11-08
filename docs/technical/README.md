# Technical documentation

These guides describe **implemented behavior**, its operating constraints and the
remaining gaps. They complement the [product vision](../product/product-vision.md)
and [innovation direction](../product/innovation.md) alongside
[requirements](../product/product-requirements.md); a planned issue or quality
target is not evidence of a delivered capability.

## Architecture and implementation references

| Guide | Read it for |
| --- | --- |
| [Architecture](architecture.md) | Runtime/dependency boundaries, responsibility split and product scope |
| [Private RPC, transactions and RLS](persistence-security.md) | Signed contexts, bootstrap, roles/grants, related ownership, rollback, atomic commands and limits |
| [Implemented database model and ERD](database-model.md) | All 22 application tables, actual relationships/keys, financial representation and fresh migrations |
| [RPC contracts and clients](rpc-contracts.md) | Public/private exports, 49/54 procedure inventories, MCP, code generation and wire semantics |
| [Persistence read pattern](persistence-reads.md) | Purpose-shaped joins/aggregates, bounded projections, cardinality, snapshots and review checklist |
| [UI/session/SSR lifetimes](ui-data-lifecycle.md) | Accepted credentials, candidate verification, cancellation, page resources, command/read races and hydration isolation |
| [Provider-neutral identity](identity.md) | Provider/issuer/subject namespaces, internal principals, verifier selection, provisioning and session boundaries |
| [Tag decisions and rules](../../apps/api/src/transactions/tagging/README.md) | Manual no-tag versus reset, matching, approved automation and atomic decision/event writes |
| [Banking connector and ingestion](../../apps/api/src/banking/README.md) | Provider normalization, prepared sync, preserved user decisions, tombstones and review |

## Setup, development and verification

- [Technical manual](technical-manual.md): process/environment separation, local
  setup, Compose topology, browser-versus-SSR configuration and troubleshooting.
- [Development and verification](development-workflow.md): builds, Biome/editor/DI
  conventions, [file ownership and extraction](development-workflow.md#file-ownership-and-extraction),
  [type safety and boundaries](development-workflow.md#type-safety-and-boundary-types),
  serverless versus listener/DB/live-Firebase checks and change review.
- App entry points: [API](../../apps/api/README.md),
  [persistence](../../apps/persistence/README.md), [UI](../../apps/ui/README.md).
- Environment examples: [root Compose](../../.env.example),
  [API](../../apps/api/.env.example),
  [persistence runtime](../../apps/persistence/.env.example). These contain public
  placeholders/demo defaults, never real keys or passwords.

## Evidence, targets and interpretation limits

- [Non-functional requirements](../product/non-functional-requirements.md):
  quality targets, not proof of production readiness or maximum-size load tests.
- [Conceptual UML PNGs](../diagrams/README.md): historical product sketches with
  explicit inaccuracies. Use the implemented ERD above for the actual data model.
- [Dated backlog](../planning/snapshots/backlog-2026-11-02.md) and
  [Stage A closure](../planning/stage-a/closure.md): historical delivery
  evidence; references to the then-current Drizzle stack are intentionally dated.
- [Stage-organized planning](../planning/README.md) separates stage scope, gates
  and evidence. The [platform-evolution rationale](../planning/stage-b/platform-evolution.md)
  explains how PRs #26–#28 support the product while Stage B was being built;
  it is not a stage-completion or live-provider readiness claim.

Current source/configuration and migrations take precedence when a guide becomes
stale. Update the corresponding references, generated contracts and tests together;
do not erase historical evidence or relabel planned work as shipped.

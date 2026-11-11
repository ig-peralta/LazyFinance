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
| [Implemented ER and 4+1 views](../diagrams/README.md) | Dated Stage B PlantUML/PNG baseline: ER, logical, development, process, planned physical and scenarios views; deployment pending |
| [Private RPC, transactions and RLS](persistence-security.md) | Signed contexts, bootstrap, roles/grants, related ownership, rollback, atomic commands and limits |
| [Implemented database model and ERD](database-model.md) | All 32 application tables, actual relationships/keys, financial representation, migrations and diagram baseline limits |
| [RPC contracts and clients](rpc-contracts.md) | Public/private exports, 82/103 procedure inventories, MCP, code generation and wire semantics |
| [First-party financial assistant](financial-assistant.md) | Provider-neutral models, grounded reads, explicit action approval, durable receipts, streaming, privacy, limits and evaluation gates |
| [Live voice contract](assistant-live-voice.md) | Opt-in WebRTC, processing disclosure, microphone/session lifetimes, client-policy limits and live release gates |
| [External MCP authorization](mcp-authorization.md) | Standards-first OAuth, client interoperability/evidence, independent grants, consent, revocation and operations |
| [Persistence read pattern](persistence-reads.md) | Purpose-shaped joins/aggregates, bounded projections, cardinality, snapshots and review checklist |
| [UI/session/rendering lifetimes](ui-data-lifecycle.md) | Accepted credentials, candidate verification, cancellation, page resources, command/read races and public-only hydration |
| [Provider-neutral identity](identity.md) | Provider/issuer/subject namespaces, internal principals, verifier selection, provisioning and session boundaries |
| [Tag decisions and rules](../../apps/api/src/transactions/tagging/README.md) | Manual no-tag versus reset, matching, approved automation and atomic decision/event writes |
| [Banking connector and ingestion](../../apps/api/src/banking/README.md) | Explicit selection, isolated/headless scheduling, shared prepared sync, preserved history and truthful source freshness |

## Setup, development and verification

- [Technical manual](technical-manual.md): process/environment separation, local
  setup, Compose topology, environment-specific browser/static hosting and troubleshooting.
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
- [Diagram inventory](../diagrams/README.md): dated Stage B ER/4+1 sources and PNGs,
  with that baseline's use cases, components and focused message sequences. The physical
  view is planned configuration, not deployment evidence.
- [Stage C delivery evidence](../planning/stage-c/experience-delivery.md) records
  the integrated feature checks and remaining release gates. The dated
  [November 9 backlog](../planning/snapshots/backlog-2026-11-09.md) and
  [Stage B closure](../planning/stage-b/closure.md): completed development-stage
  inventory, evidence and accepted carryovers. The [earlier checkpoint](../planning/snapshots/backlog-2026-11-02.md)
  and [Stage A closure](../planning/stage-a/closure.md) retain their original
  issue states and financial-model scope.
- [Stage-organized planning](../planning/README.md) separates stage scope, gates
  and evidence. The [platform-evolution rationale](../planning/stage-b/platform-evolution.md)
  explains how PRs #26–#28 support the product while Stage B was being built;
  it concerns that earlier implementation, not the final private-CSR/action
  baseline or a live-provider readiness claim. Stage B's [retrospective](../planning/stage-b/retrospective.md)
  records the review and Stage C improvements.

Current source/configuration and migrations take precedence when a guide becomes
stale. Update the corresponding references, generated contracts and tests together;
do not erase historical evidence or relabel planned work as shipped.

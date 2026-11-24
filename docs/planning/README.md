# Planning and stage records

Planning follows the stages in the [product vision](../product/product-vision.md#development-sequence-and-decision-gates)
and the milestone structure reproduced from Linear in the
[original Stage C planning snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md),
extended by the [November 11](stage-c/planning.md#required-scope-additions--2026-11-11)
and [November 24](stage-c/planning.md#required-scope-addition--2026-11-24) scope additions.
**One stage milestone equals one sprint**; its assigned issues are the Sprint
Backlog. These folders do not
introduce separate Linear cycles or additional stages.

## Read by stage

| Stage | Purpose | Start here |
| --- | --- | --- |
| A — financial-core validation | Establish financial meaning with controlled data before provider integration | [Scope and evidence](stage-a/README.md), [closure](stage-a/closure.md), [documentary retrospective](stage-a/retrospective.md) |
| B — parallel product tracks | Closed 2026-11-09 with accepted development-stage limitations; GO to Stage C planning | [Delivered scope](stage-b/README.md), [closure](stage-b/closure.md), [retrospective](stage-b/retrospective.md) |
| C — expanded experience | GO for development closure on 2026-11-24; production release remains separate | [Delivered scope](stage-c/README.md), [closure](stage-c/closure.md), [retrospective](stage-c/retrospective.md) |

The Stage B platform-evolution record explains the intentions behind PRs
[#26](https://github.com/ig-peralta/LazyFinance/pull/26),
[#27](https://github.com/ig-peralta/LazyFinance/pull/27) and
[#28](https://github.com/ig-peralta/LazyFinance/pull/28). It is not a Stage B closure
record or a replacement for the technical implementation guides. The
[Stage B closure](stage-b/closure.md) covers the final stage baseline through PR #36.

## Stage gates

Each stage owns its own completion criteria:

- [Stage A Definition of Done](stage-a/definition-of-done.md).
- [Stage B Definition of Done](stage-b/definition-of-done.md).
- [Stage C Definition of Done](stage-c/definition-of-done.md).

Issue acceptance, stage completion and product release are different decisions.
An issue marked Done does not close its stage, and a completed stage does not
replace the [product Definition of Done](product-definition-of-done.md). Record
scope changes and deferrals explicitly at the relevant gate.

## Shared planning references

| Reference | Responsibility |
| --- | --- |
| [Project method](project-method.md) | How increments are selected, verified and reviewed |
| [Backlog and evidence](backlog.md) | Linear ownership, snapshot provenance and how to publish stage records |
| [Product Definition of Done](product-definition-of-done.md) | Release-wide exit criteria |
| [Stage record template](stage-sprint-record-template.md) | Fields for future planning, closure and retrospective records |
| [Stage C gate snapshot — November 24 UTC](snapshots/backlog-2026-11-24-stage-c-gate.md) | 104 issues as recorded at the development gate, before publication of the closure |
| [Stage C planning snapshot — November 10 UTC](snapshots/backlog-2026-11-10-stage-c-planning.md) | All 99 issues: 65 prior Done, 29 required Todo and 5 Optional Backlog; local scope decision November 9 |
| [Stage C scope addition — November 11](stage-c/planning.md#required-scope-additions--2026-11-11) | Four mandatory children bring Stage C to 33 required and 5 optional records; deployment/performance approaches remain undecided until issue work |
| [Stage C scope addition — November 24](stage-c/planning.md#required-scope-addition--2026-11-24) | Required security regression tests bring Stage C to 34 required and 5 optional records |
| [Stage B closure snapshot — November 9](snapshots/backlog-2026-11-09.md) | Historical 65-issue inventory, hierarchy and recorded fields before Stage C selection |
| [Earlier checkpoint — November 2](snapshots/backlog-2026-11-02.md) | Historical cross-stage inventory and individual completion summaries while Stage B was active |

## Where new material belongs

- Keep stage-specific scope, completion criteria, decisions and evidence in the
  relevant stage folder. The Stage B and C closure and retrospective records live
  separately in their respective stage folders.
- Keep shared methodology, release criteria and the reusable template here.
  `snapshots/` holds cross-stage tracker exports, not a second live board.
- Keep product intentions and acceptance targets in [product documentation](../product/product-vision.md);
  keep current runtime behavior, configuration and verification procedures in
  [technical documentation](../technical/README.md). Link to those owners rather
  than maintaining parallel specifications in planning records.
- Preserve historical timestamps, issue states and limitations. Record the source,
  review date and baseline of each new decision; distinguish recorded verification
  from informal checks and remaining release work.

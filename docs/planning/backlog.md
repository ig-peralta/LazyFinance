# Backlog and stage evidence

The team **tracks issues in Linear** during development. The [planning index](README.md)
organizes repository material by stage; it does not replace the tracker. Reviewers
do not need access to that workspace: the [November 9 backlog snapshot](snapshots/backlog-2026-11-09.md)
reproduces all 65 project issues with their titles, stage, parent, status, priority,
assignee, due dates and completion timestamps. The
[November 2 checkpoint](snapshots/backlog-2026-11-02.md) retains its individual
**Done when** summaries. The [product vision](../product/product-vision.md),
[requirements](../product/product-requirements.md) and
[user journeys](../product/user-journeys.md) explain the intended outcomes.

These repository documents are **reflections of the team's Linear planning at
their stated dates**, not a second live tracker. Issue IDs identify work in the
snapshot and in Git history. The November 9 inventory records 19 Stage A and 46
Stage B issues Done, with no Stage C issues. The
[Stage B closure](stage-b/closure.md) separately records GO to Stage C planning,
the reviewed baseline and accepted limitations. The earlier checkpoint retains
its November 2 issue states.

## Stage milestones are sprints

| Stage | Recorded issue scope | Stage-owned guidance and evidence |
| --- | --- | --- |
| [A — financial core](stage-a/README.md) | 19 issues, all Done | [Closure](stage-a/closure.md), [documentary retrospective](stage-a/retrospective.md) and [gate criteria](stage-a/definition-of-done.md) |
| [B — parallel product tracks](stage-b/README.md) | 46 issues across six workstreams, all Done | [Workstream map](stage-b/README.md#workstreams-from-linear), [closure](stage-b/closure.md), [retrospective](stage-b/retrospective.md) and [gate assessment](stage-b/definition-of-done.md) |
| [C — expanded experience](stage-c/README.md) | No issues at the November 9 extraction | [Selection rules](stage-c/README.md#direction-is-not-a-selected-backlog) and [gate criteria](stage-c/definition-of-done.md); broader MCP management is an identified follow-up |

The [all-issue snapshot](snapshots/backlog-2026-11-09.md) contains every parent,
child and recorded field at extraction. Stage folders reference that inventory
instead of copying mutable issue lists into separate backlog files.

**One milestone equals one sprint; the milestone's assigned issues are its Sprint Backlog.** Sprint durations differ by stage. See the [methodology](project-method.md), [stage definitions of done](README.md#stage-gates), and [product Definition of Done](product-definition-of-done.md) for the broader exit criteria.

## Producing future snapshots

For a reviewer-visible checkpoint or stage closure, retrieve **all project issues** from Linear, including every page of results and archived items. Record the extraction date and each issue's ID, stage, parent, title, status, priority, assignee, and due/completion dates, preserving unset values. Include the stage gate's outcome, Git baseline, and retrospective when the stage has closed. The [November 9 snapshot](snapshots/backlog-2026-11-09.md) records Stage B's completed inventory; the [November 2 checkpoint](snapshots/backlog-2026-11-02.md) remains historical evidence. Keep cross-stage exports in `snapshots/` and a stage's closure/retrospective in its own folder.

Live fields can change after extraction. Later snapshots should identify their own extraction dates and never be presented as earlier planning records. Internal Linear identifiers may be kept as plain text, while reviewer-facing links point to **local documentation or public Git commits/PRs**. At the start of each future stage sprint, record its goal and selected milestone issues internally using the [stage-sprint record fields](stage-sprint-record-template.md), then summarize the outcomes in its stage-closure record.

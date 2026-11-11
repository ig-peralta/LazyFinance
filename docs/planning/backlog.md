# Backlog and stage evidence

The team **tracks issues in Linear** during development. The [planning index](README.md)
organizes repository material by stage; it does not replace the tracker. Reviewers
do not need access to that workspace: the [original Stage C planning snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md)
reproduces all 99 project issues with their titles, stage, parent, status, priority,
assignee, due dates and completion timestamps. Its UTC extraction on November 10
records the November 9 local scope decision. The
[November 2 checkpoint](snapshots/backlog-2026-11-02.md) retains its individual
**Done when** summaries. The [product vision](../product/product-vision.md),
[requirements](../product/product-requirements.md) and
[user journeys](../product/user-journeys.md) explain the intended outcomes.

These repository documents are **reflections of the team's Linear planning at
their stated dates**, not a second live tracker. Issue IDs identify work in the
snapshot and in Git history. The [November 9 closure inventory](snapshots/backlog-2026-11-09.md)
records 19 Stage A and 46 Stage B issues Done, with no Stage C issues at that
extraction; it remains unchanged. The later planning snapshot adds 34 Stage C
records: 29 required Todo and 5 Optional Backlog. The
[November 11 addition](stage-c/planning.md#required-scope-additions--2026-11-11)
adds four required children for deployment, performance testing, mock banking and
substantial seed improvement. Stage C now selects **38 records: 33 required and
5 optional**; the project contains 103 records. The dated snapshots retain their
original counts and states. The
[Stage B closure](stage-b/closure.md) separately records GO to Stage C planning,
the reviewed baseline and accepted limitations. The earlier checkpoint retains
its November 2 issue states.

## Stage milestones are sprints

| Stage | Recorded issue scope | Stage-owned guidance and evidence |
| --- | --- | --- |
| [A — financial core](stage-a/README.md) | 19 issues, all Done | [Closure](stage-a/closure.md), [documentary retrospective](stage-a/retrospective.md) and [gate criteria](stage-a/definition-of-done.md) |
| [B — parallel product tracks](stage-b/README.md) | 46 issues across six workstreams, all Done | [Workstream map](stage-b/README.md#workstreams-from-linear), [closure](stage-b/closure.md), [retrospective](stage-b/retrospective.md) and [gate assessment](stage-b/definition-of-done.md) |
| [C — expanded experience](stage-c/README.md) | 38 selected records after November 11: 33 required (5 parents/28 children), 5 optional (1 parent/4 candidates) | [Selected scope](stage-c/planning.md), [validation plan](stage-c/validation-plan.md) and [gate criteria](stage-c/definition-of-done.md); broader MCP management remains an unselected follow-up |

The [all-issue snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md) contains every parent,
child and recorded field at extraction. Stage folders reference that inventory
instead of copying mutable issue lists into separate backlog files.

Stage C optional records stay visibly labelled **Optional** in the same milestone;
they do not block the required gate unless explicitly promoted. Initial priorities
are relative ordering only. Owners, estimates and individual due dates were unset
at initial selection; Linear owns their live values. The November 20 milestone
target is tentative, not a capacity commitment.

LAZ-106 (deployment), LAZ-108 (performance testing), LAZ-107 (mock banking provider)
and LAZ-105 (richer seed) are mandatory children of LAZ-76 and each blocks LAZ-99.
They were added as Todo/High without owners, estimates, due dates or cycles.
Deployment and performance-testing approaches are selected when their issues
start. A plan, skipped check or carryover-risk note is not completion evidence.
The optional banking-action demo remains separate and optional.

**One milestone equals one sprint; the milestone's assigned issues are its Sprint Backlog.** Sprint durations differ by stage. See the [methodology](project-method.md), [stage definitions of done](README.md#stage-gates), and [product Definition of Done](product-definition-of-done.md) for the broader exit criteria.

## Producing future snapshots

For a reviewer-visible checkpoint or stage closure, retrieve **all project issues** from Linear, including every page of results and archived items. Record the extraction date and each issue's ID, stage, parent, title, status, priority, assignee, and due/completion dates, preserving unset values. Include the stage gate's outcome, Git baseline, and retrospective when the stage has closed. The [November 9 snapshot](snapshots/backlog-2026-11-09.md) records Stage B's completed inventory; the [November 10 UTC planning snapshot](snapshots/backlog-2026-11-10-stage-c-planning.md) records Stage C selection, not closure; the [November 2 checkpoint](snapshots/backlog-2026-11-02.md) remains historical evidence. Keep cross-stage exports in `snapshots/` and a stage's closure/retrospective in its own folder.

Live fields can change after extraction. Later snapshots should identify their own extraction dates and never be presented as earlier planning records. Internal Linear identifiers may be kept as plain text, while reviewer-facing links point to **local documentation or public Git commits/PRs**. At the start of each future stage sprint, record its goal and selected milestone issues internally using the [stage-sprint record fields](stage-sprint-record-template.md), then summarize the outcomes in its stage-closure record.

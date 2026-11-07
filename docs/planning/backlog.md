# Backlog and stage evidence

The team **tracks issues in Linear** during development. The [planning index](README.md)
organizes repository material by stage; it does not replace the tracker. Reviewers
do not need access to that workspace: the [dated all-issue backlog snapshot](snapshots/backlog-2026-11-02.md)
reproduces the 65 project issues with their titles, stage, status, due dates,
ownership/priority exceptions, and **individual Done when conditions** distilled
from the issue criteria. The [product vision](../product/product-vision.md),
[requirements](../product/product-requirements.md) and
[user journeys](../product/user-journeys.md) explain the intended outcomes.

These repository documents are **reflections of the team's Linear planning at
their stated dates**, not a second live tracker. Issue IDs identify work in the
snapshot and in Git history. The snapshot records Stage B in progress: it is an
**interim planning view**, not a claim that Stage B is complete. Merged PRs can
provide additional implementation evidence without rewriting the captured issue
states or proving every issue's acceptance criteria.

## Stage milestones are sprints

| Stage | Recorded issue scope | Stage-owned guidance and evidence |
| --- | --- | --- |
| [A — financial core](stage-a/README.md) | 19 issues, all Done at capture | [Closure](stage-a/closure.md), [documentary retrospective](stage-a/retrospective.md) and [gate criteria](stage-a/definition-of-done.md); not a reconstructed start-of-sprint selection |
| [B — parallel product tracks](stage-b/README.md) | 46 issues across six workstreams in the snapshot | [Workstream map](stage-b/README.md#workstreams-from-linear), [platform-evolution rationale](stage-b/platform-evolution.md) and [gate criteria](stage-b/definition-of-done.md); closure/retrospective follow the gate |
| [C — expanded experience](stage-c/README.md) | No issues in the snapshot | [Selection rules](stage-c/README.md#direction-is-not-a-selected-backlog) and [gate criteria](stage-c/definition-of-done.md); commitments are selected only after the Stage B review |

The [all-issue snapshot](snapshots/backlog-2026-11-02.md) contains every parent,
child, status and due date at extraction. Many source issues had no priority or
assignee set. Stage folders reference that inventory instead of copying mutable
issue lists into separate backlog files.

**One milestone equals one sprint; the milestone's assigned issues are its Sprint Backlog.** Sprint durations differ by stage, and this naming does not claim all Scrum ceremonies took place. The repository's Sprint A worklist records its completed scope; it cannot prove exactly what was selected at the beginning. See the [methodology](project-method.md), [stage definitions of done](README.md#stage-gates), and [product Definition of Done](product-definition-of-done.md) for the broader exit criteria.

## Producing future snapshots

For a reviewer-visible checkpoint or stage closure, retrieve **all project issues** from Linear, including every page of results. Record the extraction date and each issue's ID, stage, parent, title, status, priority, assignee, and due/completion dates, preserving unset values. Include the stage gate's outcome, Git baseline, and retrospective when the stage has closed. The [November 2 backlog snapshot](snapshots/backlog-2026-11-02.md) is the preserved cross-stage checkpoint; the [Stage A closure record](stage-a/closure.md) documents the completed-stage evidence and its provenance. Keep subsequent cross-stage exports in `snapshots/` and a stage's closure/retrospective in its own folder.

Live fields can change after extraction. Later snapshots should identify their own extraction dates and never be presented as earlier planning records. Internal Linear identifiers may be kept as plain text, while reviewer-facing links point to **local documentation or public Git commits/PRs**. At the start of each future stage sprint, record its goal and selected milestone issues internally using the [stage-sprint record fields](stage-sprint-record-template.md), then summarize the outcomes in its stage-closure record.

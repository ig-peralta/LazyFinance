# Product backlog — Stage C planning snapshot, 2026-11-10 UTC

**Source:** Linear workspace **LazyFinance**, project **P-LAZ-1 — LazyFinance
product development**. Inventory and relation audit began at
**2026-11-10T01:28:15.327Z** and completed at **2026-11-10T01:28:19.781Z**.
The complete query included archived items, returned **99 unique issues** and
reported `hasNextPage: false`; no archived issues were returned.

This records the scope selected on **2026-11-09 in America/Santiago**, published
that evening / November 10 UTC. It is a dated planning baseline, not a live board
or a Stage C closure. The [earlier November 9 extraction](backlog-2026-11-09.md)
remains the unmodified Stage B closure inventory.

| Stage milestone | Target | Records | Status at extraction |
| --- | --- | --- | --- |
| Stage A - Financial core validation | 2026-10-20 | 19 | 19 Done |
| Stage B - Parallel product tracks | 2026-11-13 | 46 | 46 Done |
| Stage C - Expanded experience | 2026-11-20, tentative | 34 | 29 required Todo; 5 Optional Backlog |
| **Total** | | **99** | **65 Done, 29 Todo, 5 Backlog** |

The project remains In Progress. Each stage milestone is one sprint; no cycle was
created. The [scope record](../stage-c/planning.md) and
[validation plan](../stage-c/validation-plan.md) define the selected outcome,
dependencies, exclusions and planned evidence. The [Stage B closure](../stage-b/closure.md)
retains its accepted limitations; no implementation/live verification or release
approval follows from creating the Stage C issues.

## Reading the inventory

- Fields below reproduce the fresh extraction. **— means unset**; completion
  timestamps are UTC. `No priority` is the tracker value, not an inferred priority.
- Stage C has 6 parents and 28 children: 5 required parents/24 children plus
  1 optional parent/4 candidates. **Optional** labels apply to LAZ-73 and
  LAZ-101–LAZ-104 only. They are not required gate blockers without promotion.
- All 34 new issues explicitly belong to the project and Stage C milestone.
  Assignees, estimates, individual due dates and cycles were left unset; initial
  priorities do not imply capacity or a guaranteed November 20 delivery.
- Stage A/B issue titles retain their recorded historical wording, including
  Drizzle and SSR-safe sessions. Use current technical guides for implementation.
- Existing Stage A/B issues were not reopened or rewritten. The onboarding,
  classification, manual banking and assistant requests create follow-up work,
  not duplicate claims that the delivered foundation is missing.

## Sprint A (Stage A) — financial core

| Issue | Title | Parent | Status | Priority | Assignee | Due | Completed (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LAZ-6 | Establish the NestJS API and MCP transport foundation | — | Done | No priority | — | — | 2026-10-17T02:15:06.427Z |
| LAZ-7 | Deliver an authenticated demo financial dashboard | — | Done | No priority | — | — | 2026-10-17T02:15:06.959Z |
| LAZ-8 | Seed representative Chilean financial history for core validation | — | Done | No priority | — | — | 2026-10-17T02:15:07.214Z |
| LAZ-9 | Expose user-scoped financial reads through MCP | — | Done | No priority | — | — | 2026-10-17T02:15:07.436Z |
| LAZ-10 | Define the core-first product requirements and validation gate | — | Done | No priority | — | — | 2026-10-17T02:15:07.740Z |
| LAZ-11 | Implement the first PostgreSQL financial schema with Drizzle | — | Done | No priority | — | — | 2026-10-17T02:15:07.971Z |
| LAZ-12 | Scaffold the Angular web application and landing page | — | Done | No priority | — | — | 2026-10-17T02:15:08.390Z |
| LAZ-13 | Make local development and deployment reproducible | — | Done | No priority | — | — | 2026-10-17T02:15:08.604Z |
| LAZ-14 | Secure demo API and MCP access with shared principal contracts | — | Done | No priority | — | — | 2026-10-17T02:15:08.943Z |
| LAZ-15 | Identify and implement the minimum missing core financial flows | — | Done | Medium | — | 2026-10-21 | 2026-10-21T08:46:41.973Z |
| LAZ-16 | Define savings-goal contributions and objective progress | — | Done | High | — | 2026-10-20 | 2026-10-21T01:20:17.460Z |
| LAZ-17 | Review account balances, transfers, and transaction classification semantics | — | Done | High | — | 2026-10-20 | 2026-10-21T00:25:51.943Z |
| LAZ-18 | Validate the financial-core model and record the Stage A gate decision | — | Done | High | — | 2026-10-20 | 2026-10-21T06:16:50.206Z |
| LAZ-19 | As a user, understand what each account balance means | LAZ-17 | Done | No priority | ALVARO JOAQUIN DIAZ BALCAZAR | 2026-10-20 | 2026-10-21T00:19:35.225Z |
| LAZ-20 | As a user, distinguish savings-goal progress from budget spending | LAZ-16 | Done | No priority | — | 2026-10-20 | 2026-10-21T01:20:17.829Z |
| LAZ-21 | As a user, see spending without internal transfers counted as expenses | LAZ-17 | Done | No priority | ALVARO JOAQUIN DIAZ BALCAZAR | 2026-10-20 | 2026-10-20T23:50:59.347Z |
| LAZ-22 | As a user, trace spending against my budget | LAZ-15 | Done | No priority | — | 2026-10-20 | 2026-10-21T01:31:11.926Z |
| LAZ-23 | As a user, classify each transaction with at most one tag | LAZ-17 | Done | High | — | 2026-10-20 | 2026-10-21T01:07:24.833Z |
| LAZ-25 | As a user, define income sources and payment schedules | LAZ-15 | Done | High | — | — | 2026-10-21T05:34:17.315Z |

## Sprint B (Stage B) — connected product tracks

| Issue | Title | Parent | Status | Priority | Assignee | Due | Completed (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LAZ-24 | As a user, navigate the dashboard and financial management sections | LAZ-30 | Done | Medium | ALVARO JOAQUIN DIAZ BALCAZAR | 2026-10-26 | 2026-10-23T09:56:39.592Z |
| LAZ-26 | Build the first-party text financial assistant | — | Done | No priority | — | 2026-11-13 | 2026-11-09T12:58:51.898Z |
| LAZ-27 | Define and implement authorization for external MCP clients | — | Done | No priority | — | 2026-11-13 | 2026-11-09T02:21:51.902Z |
| LAZ-28 | Build provider-neutral banking connectivity with a Fintoc adapter | — | Done | No priority | — | 2026-11-13 | 2026-11-08T22:44:33.067Z |
| LAZ-29 | Replace demo authentication with Firebase user identity | — | Done | No priority | — | 2026-11-13 | 2026-10-31T14:12:59.907Z |
| LAZ-30 | Deliver financial management workflows in the web app | — | Done | No priority | — | 2026-11-13 | 2026-11-08T22:44:39.237Z |
| LAZ-31 | Implement financial management APIs and refine financial semantics | — | Done | No priority | — | 2026-11-13 | 2026-11-08T00:50:05.443Z |
| LAZ-32 | Trace budget and summary amounts to contributing transactions | LAZ-31 | Done | No priority | — | 2026-11-06 | 2026-11-08T00:50:04.903Z |
| LAZ-33 | Assign or clear a transaction's single tag | LAZ-31 | Done | No priority | — | 2026-10-28 | 2026-11-08T00:50:05.305Z |
| LAZ-34 | Implement spending-budget creation, editing, and archival APIs | LAZ-31 | Done | No priority | — | 2026-11-02 | 2026-11-08T00:50:04.750Z |
| LAZ-35 | Define tag-driven savings contribution eligibility | LAZ-31 | Done | No priority | — | 2026-11-02 | 2026-11-08T00:50:04.530Z |
| LAZ-36 | Define and implement refund and reimbursement treatment | LAZ-31 | Done | No priority | — | 2026-11-02 | 2026-11-08T00:50:05.162Z |
| LAZ-37 | Expose paginated and filtered transaction history | LAZ-31 | Done | No priority | — | 2026-10-30 | 2026-11-08T00:50:05.595Z |
| LAZ-38 | Define budget edit history and supported period semantics | LAZ-31 | Done | No priority | — | 2026-10-26 | 2026-11-08T00:50:05.023Z |
| LAZ-39 | Implement user-scoped tag management APIs | LAZ-31 | Done | No priority | — | 2026-10-28 | 2026-11-08T00:50:05.831Z |
| LAZ-40 | Implement measured tag-driven savings-goal progress | LAZ-31 | Done | No priority | — | 2026-11-09 | 2026-11-08T00:50:05.687Z |
| LAZ-41 | Correct a transaction's internal-movement classification | LAZ-31 | Done | No priority | — | 2026-10-28 | 2026-11-08T00:50:04.625Z |
| LAZ-42 | Implement savings-target management APIs | LAZ-31 | Done | No priority | — | 2026-10-30 | 2026-11-08T00:50:05.774Z |
| LAZ-43 | Integrate Firebase sign-in and SSR-safe session lifecycle | LAZ-29 | Done | No priority | — | 2026-10-30 | 2026-10-31T12:42:07.284Z |
| LAZ-44 | Provision application users from verified Firebase identities | LAZ-29 | Done | No priority | — | 2026-10-28 | 2026-10-31T09:45:49.869Z |
| LAZ-45 | Verify Firebase onboarding, sessions, and ownership end to end | LAZ-29 | Done | No priority | — | 2026-11-02 | 2026-10-31T13:37:18.323Z |
| LAZ-46 | Define Firebase identity contracts and configure token verification | LAZ-29 | Done | No priority | — | 2026-10-23 | 2026-10-31T08:24:38.268Z |
| LAZ-47 | Define the normalized banking connector contract | LAZ-28 | Done | No priority | — | 2026-10-26 | 2026-10-23T12:15:50.144Z |
| LAZ-48 | Implement banking refresh, recovery, and sync-state reporting | LAZ-28 | Done | No priority | — | 2026-11-06 | 2026-11-08T22:44:13.640Z |
| LAZ-49 | Implement Fintoc connection linking and lifecycle | LAZ-28 | Done | No priority | — | 2026-11-02 | 2026-11-08T18:57:07.803Z |
| LAZ-50 | Implement idempotent normalized banking-data ingestion | LAZ-28 | Done | No priority | — | 2026-10-30 | 2026-10-28T22:11:47.263Z |
| LAZ-51 | Normalize and import the first Fintoc account snapshot | LAZ-28 | Done | No priority | — | 2026-11-04 | 2026-11-08T22:44:13.705Z |
| LAZ-52 | Choose the external MCP authorization scheme and identity contract | LAZ-27 | Done | No priority | — | 2026-10-23 | 2026-11-09T02:21:51.740Z |
| LAZ-53 | Validate external MCP access with a reference client | LAZ-27 | Done | No priority | — | 2026-11-06 | 2026-11-09T02:21:51.954Z |
| LAZ-54 | Implement the chosen MCP authorization and discovery flow | LAZ-27 | Done | No priority | — | 2026-10-30 | 2026-11-09T02:21:51.822Z |
| LAZ-55 | Enforce MCP token permissions, expiry, and revocation | LAZ-27 | Done | No priority | — | 2026-11-04 | 2026-11-09T02:21:51.680Z |
| LAZ-56 | Implement server-side text-agent orchestration | LAZ-26 | Done | No priority | — | 2026-11-01 | 2026-11-09T12:58:51.620Z |
| LAZ-57 | Add the authenticated multi-turn text chat experience | LAZ-26 | Done | No priority | — | 2026-11-06 | 2026-11-09T12:58:51.758Z |
| LAZ-58 | Evaluate grounded financial answers and agent failure handling | LAZ-26 | Done | No priority | — | 2026-11-11 | 2026-11-09T12:58:51.700Z |
| LAZ-59 | Connect read-only financial capabilities to the text agent | LAZ-26 | Done | No priority | — | 2026-11-02 | 2026-11-09T12:58:51.822Z |
| LAZ-60 | Display measured tag-driven savings progress | LAZ-30 | Done | No priority | — | 2026-11-11 | 2026-11-08T16:36:48.266Z |
| LAZ-61 | Configure income sources and payment schedules in the web app | LAZ-30 | Done | No priority | — | 2026-10-30 | 2026-11-08T16:36:48.168Z |
| LAZ-62 | Connect bank accounts and display refresh status | LAZ-30 | Done | No priority | — | 2026-11-09 | 2026-11-08T22:44:13.577Z |
| LAZ-63 | Configure savings targets in the web app | LAZ-30 | Done | No priority | — | 2026-11-02 | 2026-11-08T16:36:48.127Z |
| LAZ-64 | Review expected income and confirm received payments | LAZ-30 | Done | No priority | — | 2026-11-04 | 2026-11-08T16:36:48.225Z |
| LAZ-65 | Build the tag-management page | LAZ-30 | Done | No priority | — | 2026-10-30 | 2026-11-08T16:36:48.006Z |
| LAZ-66 | Browse and filter the full transaction history | LAZ-30 | Done | No priority | — | 2026-11-02 | 2026-11-08T16:36:48.038Z |
| LAZ-67 | Correct transaction tags and internal-movement status | LAZ-30 | Done | No priority | — | 2026-11-04 | 2026-11-08T16:36:48.063Z |
| LAZ-68 | Configure spending budgets in the web app | LAZ-30 | Done | No priority | — | 2026-11-06 | 2026-11-08T16:36:47.959Z |
| LAZ-69 | Drill down from a budget total to its contributing transactions | LAZ-30 | Done | No priority | — | 2026-11-09 | 2026-11-08T16:36:48.197Z |
| LAZ-70 | Implement the new-user onboarding flow | LAZ-30 | Done | No priority | — | 2026-11-11 | 2026-11-08T16:36:48.087Z |

## Sprint C (Stage C) — selected experience

| Issue | Title | Parent | Status | Priority | Assignee | Due | Completed (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LAZ-71 | Make connected applications recognizable and understandable | — | Todo | Medium | — | — | — |
| LAZ-72 | Make the assistant persistent, readable and voice-enabled | — | Todo | High | — | — | — |
| LAZ-73 | Explore optional Stage C extensions | — | Backlog | Low | — | — | — |
| LAZ-74 | Simplify bank setup and automate selected-account synchronization | — | Todo | High | — | — | — |
| LAZ-75 | Make the financial workspace clearer and customizable | — | Todo | High | — | — | — |
| LAZ-76 | Validate the Stage C experience and record its gate decision | — | Todo | High | — | — | — |
| LAZ-77 | Simplify transaction tagging and internal-movement classification | LAZ-75 | Todo | High | — | — | — |
| LAZ-78 | Reduce visual noise and clarify everyday financial actions | LAZ-75 | Todo | High | — | — | — |
| LAZ-79 | Add a discoverable keyboard shortcut for the assistant | LAZ-75 | Todo | Medium | — | — | — |
| LAZ-80 | Redesign connected-app permissions and revocation views | LAZ-71 | Todo | Medium | — | — | — |
| LAZ-81 | Make tag creation, editing and archival easier to manage | LAZ-75 | Todo | High | — | — | — |
| LAZ-82 | Add accessible text-size and light-mode preferences | LAZ-75 | Todo | Medium | — | — | — |
| LAZ-83 | Display safe connected-application logos with accessible fallbacks | LAZ-71 | Todo | Medium | — | — | — |
| LAZ-84 | Add a compact icon-only sidebar with accessible navigation | LAZ-75 | Todo | Medium | — | — | — |
| LAZ-85 | Let users set, change and clear an account alias | LAZ-74 | Todo | Medium | — | — | — |
| LAZ-86 | Persist and enforce the bank accounts selected for tracking | LAZ-74 | Todo | High | — | — | — |
| LAZ-87 | Show automatic-sync freshness and actionable recovery | LAZ-74 | Todo | High | — | — | — |
| LAZ-88 | Unify Fintoc authorization, account selection and first synchronization | LAZ-74 | Todo | High | — | — | — |
| LAZ-89 | Define selected-account and automatic bank-sync behavior | LAZ-74 | Todo | High | — | — | — |
| LAZ-90 | Run automatic bank synchronization with bounded durable recovery | LAZ-74 | Todo | High | — | — | — |
| LAZ-91 | Keep streamed assistant replies anchored at their beginning | LAZ-72 | Todo | High | — | — | — |
| LAZ-92 | Collapse assistant financial references behind an accessible disclosure | LAZ-72 | Todo | High | — | — | — |
| LAZ-93 | Keep a minimizable assistant available across workspace navigation | LAZ-72 | Todo | High | — | — | — |
| LAZ-94 | Deliver live voice conversation with interruption and text fallback | LAZ-72 | Todo | High | — | — | — |
| LAZ-95 | Define the live-voice session, privacy and cost contract | LAZ-72 | Todo | High | — | — | — |
| LAZ-96 | Remove model and provider labels from the assistant conversation | LAZ-72 | Todo | High | — | — | — |
| LAZ-97 | Guide optional onboarding through the improved bank-connection flow | LAZ-74 | Todo | High | — | — | — |
| LAZ-98 | Validate Stage C core journeys, responsiveness and accessibility | LAZ-76 | Todo | High | — | — | — |
| LAZ-99 | Record Stage C outcomes, limitations and the stage gate review | LAZ-76 | Todo | High | — | — | — |
| LAZ-100 | Validate selected live voice, model, identity and banking flows | LAZ-76 | Todo | High | — | — | — |
| LAZ-101 | Explore privacy-preserving external price comparison | LAZ-73 | Backlog | Medium | — | — | — |
| LAZ-102 | Add actionable in-app alerts for classification and financial plans | LAZ-73 | Backlog | Low | — | — | — |
| LAZ-103 | Prototype an isolated agent-assisted banking-transaction demo | LAZ-73 | Backlog | Low | — | — | — |
| LAZ-104 | Explore explicitly authorized WhatsApp access to the assistant | LAZ-73 | Backlog | Low | — | — | — |

## Stage C dependency checkpoint

All 34 Stage C issue relations were retrieved after creation. Required blockers
below are the new-work dependencies; completed Stage B references remain related
predecessor evidence. The audit found no unresolved blocker IDs or dependency
cycle, including child-to-parent completion dependencies.

| Issue | Blocked by |
| --- | --- |
| LAZ-79 | LAZ-93 |
| LAZ-86 | LAZ-89 |
| LAZ-87 | LAZ-90 |
| LAZ-88 | LAZ-86, LAZ-90 |
| LAZ-90 | LAZ-89, LAZ-86 |
| LAZ-91 | LAZ-93 |
| LAZ-94 | LAZ-95, LAZ-93, LAZ-96 |
| LAZ-97 | LAZ-88 |
| LAZ-98 | LAZ-75, LAZ-74, LAZ-72, LAZ-71 |
| LAZ-99 | LAZ-98, LAZ-100 |
| LAZ-100 | LAZ-94, LAZ-90, LAZ-88 |

Required/optional labels, parent membership, project/milestone, initial states and
unset owner/date/cycle/completion fields were checked against the plan. Exactly
one onboarding follow-up, LAZ-97, is present. These are tracker-consistency checks,
not validation of the planned application features.

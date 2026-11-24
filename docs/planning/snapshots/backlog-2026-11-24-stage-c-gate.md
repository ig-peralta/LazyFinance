# Product backlog — Stage C gate snapshot, 2026-11-24 UTC

**Source:** Linear workspace **LazyFinance**, project **P-LAZ-1 — LazyFinance
product development**. The extraction ran from **2026-11-24T16:38:17.973Z** to
**2026-11-24T16:38:19.438Z**. The query included archived issues and returned all
**104 unique issues** on one page; none were archived.

The [Stage C gate](../stage-c/closure.md) records **GO for development closure**
at `main` / `7ae34761`. The [retrospective](../stage-c/retrospective.md) records
lessons and follow-ups. This snapshot preserves tracker states at review, before
the closure record was published; it is not a live board or a release approval.

| Stage milestone | Records | Status at extraction |
| --- | ---: | --- |
| Stage A - Financial core validation | 19 | 19 Done |
| Stage B - Parallel product tracks | 46 | 46 Done |
| Stage C - Expanded experience | 39 | 32 Done, 2 Todo, 5 Backlog |
| **Total** | **104** | **97 Done, 2 Todo, 5 Backlog** |

**— means unset**; completion timestamps are UTC. LAZ-76 and LAZ-99 were Todo at
extraction. LAZ-73 and LAZ-101–LAZ-104 retain the **Optional** label and Backlog
status. No required issue is in Backlog. The
[November 10 planning snapshot](backlog-2026-11-10-stage-c-planning.md) retains the
original 99-issue inventory and selection states.

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

## Sprint C (Stage C) — expanded experience

| Issue | Title | Parent | Status | Priority | Assignee | Due | Completed (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LAZ-71 | Make connected applications recognizable and understandable | — | Done | Medium | — | — | 2026-11-11T03:12:18.335Z |
| LAZ-72 | Make the assistant persistent, readable and voice-enabled | — | Done | High | Ignacio Peralta | — | 2026-11-11T20:55:16.506Z |
| LAZ-73 | Explore optional Stage C extensions | — | Backlog | Low | — | — | — |
| LAZ-74 | Simplify bank setup and automate selected-account synchronization | — | Done | High | Ignacio Peralta | — | 2026-11-11T03:29:41.599Z |
| LAZ-75 | Make the financial workspace clearer and customizable | — | Done | High | — | — | 2026-11-11T03:32:05.164Z |
| LAZ-76 | Validate the Stage C experience and record its gate decision | — | Todo | High | — | — | — |
| LAZ-77 | Simplify transaction tagging and internal-movement classification | LAZ-75 | Done | High | — | — | 2026-11-11T04:07:27.748Z |
| LAZ-78 | Reduce visual noise and clarify everyday financial actions | LAZ-75 | Done | High | — | — | 2026-11-11T04:07:27.807Z |
| LAZ-79 | Add a discoverable keyboard shortcut for the assistant | LAZ-75 | Done | Medium | — | — | 2026-11-11T04:07:27.373Z |
| LAZ-80 | Redesign connected-app permissions and revocation views | LAZ-71 | Done | Medium | — | — | 2026-11-11T03:12:18.243Z |
| LAZ-81 | Make tag creation, editing and archival easier to manage | LAZ-75 | Done | High | — | — | 2026-11-11T04:07:27.909Z |
| LAZ-82 | Add accessible text-size and light-mode preferences | LAZ-75 | Done | Medium | — | — | 2026-11-11T04:07:27.039Z |
| LAZ-83 | Display safe connected-application logos with accessible fallbacks | LAZ-71 | Done | Medium | — | — | 2026-11-11T03:12:18.150Z |
| LAZ-84 | Add a compact icon-only sidebar with accessible navigation | LAZ-75 | Done | Medium | — | — | 2026-11-11T04:07:29.383Z |
| LAZ-85 | Let users set, change and clear an account alias | LAZ-74 | Done | Medium | Ignacio Peralta | — | 2026-11-11T03:29:41.651Z |
| LAZ-86 | Persist and enforce the bank accounts selected for tracking | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:29.157Z |
| LAZ-87 | Show automatic-sync freshness and actionable recovery | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:27.498Z |
| LAZ-88 | Unify Fintoc authorization, account selection and first synchronization | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:28.907Z |
| LAZ-89 | Define selected-account and automatic bank-sync behavior | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:08:25.699Z |
| LAZ-90 | Run automatic bank synchronization with bounded durable recovery | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:28.758Z |
| LAZ-91 | Keep streamed assistant replies anchored at their beginning | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:27.122Z |
| LAZ-92 | Collapse assistant financial references behind an accessible disclosure | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:28.180Z |
| LAZ-93 | Keep a minimizable assistant available across workspace navigation | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:27.202Z |
| LAZ-94 | Deliver live voice conversation with interruption and text fallback | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T21:03:02.507Z |
| LAZ-95 | Define the live-voice session, privacy and cost contract | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:28.651Z |
| LAZ-96 | Remove model and provider labels from the assistant conversation | LAZ-72 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:28.476Z |
| LAZ-97 | Guide optional onboarding through the improved bank-connection flow | LAZ-74 | Done | High | Ignacio Peralta | — | 2026-11-11T04:07:26.923Z |
| LAZ-98 | Validate Stage C core journeys, responsiveness and accessibility | LAZ-76 | Done | High | — | — | 2026-11-22T22:53:37.102Z |
| LAZ-99 | Record Stage C outcomes, limitations and the stage gate review | LAZ-76 | Todo | High | — | — | — |
| LAZ-100 | Validate selected live voice, model, identity and banking flows | LAZ-76 | Done | High | — | — | 2026-11-22T22:53:07.533Z |
| LAZ-101 | Explore privacy-preserving external price comparison | LAZ-73 | Backlog | Medium | — | — | — |
| LAZ-102 | Add actionable in-app alerts for classification and financial plans | LAZ-73 | Backlog | Low | — | — | — |
| LAZ-103 | Prototype an isolated agent-assisted banking-transaction demo | LAZ-73 | Backlog | Low | — | — | — |
| LAZ-104 | Explore explicitly authorized WhatsApp access to the assistant | LAZ-73 | Backlog | Low | — | — | — |
| LAZ-105 | Substantially enrich the synthetic financial seed | LAZ-76 | Done | High | — | — | 2026-11-22T22:53:24.584Z |
| LAZ-106 | Deploy LazyFinance for Stage C | LAZ-76 | Done | High | — | — | 2026-11-22T22:53:13.035Z |
| LAZ-107 | Create a mock banking provider for development and validation | LAZ-76 | Done | High | Ignacio Peralta | — | 2026-11-24T15:50:00.463Z |
| LAZ-108 | Execute and document Stage C performance testing | LAZ-76 | Done | High | Ignacio Peralta | — | 2026-11-23T04:36:01.929Z |
| LAZ-109 | Verify Stage C security boundaries with regression tests | LAZ-76 | Done | High | Ignacio Peralta | — | 2026-11-24T16:25:09.777Z |

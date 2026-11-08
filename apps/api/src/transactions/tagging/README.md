# Tag decisions and rules

This guide describes the current public/private tRPC implementation. Business
REST routes have been retired. Shared inputs/outputs live in
[`libs/contracts`](../../../../../libs/contracts/src/tags/tag-rule.schema.ts);
the [RPC reference](../../../../../docs/technical/rpc-contracts.md) describes
generation and authentication.

## One tag, three decision origins

Each movement has at most one optional tag. `finance.transaction` records why:

| Origin | Tag / rule | Meaning |
| --- | --- | --- |
| `unreviewed` | Both null | No current decision; eligible for suggestions/approved automation |
| `manual` | Tag or intentional null; rule null | User chose a tag **or deliberately no tag** |
| `rule` | Tag and rule required | An approved rule owns the current assignment |

Resetting differs from choosing no tag: reset returns to `unreviewed`; manual
null protects the deliberate choice from automation. Decision changes append a
`tag_decision_event` in the **same** persistence transaction. Repeating an identical
manual choice or resetting an already-unreviewed movement does not add a duplicate
change event. This is a fresh schema, not a migration/backfill of legacy rows.
Explicit demo seeding initializes tagged fixtures as manual and preserves existing
transaction decisions on rerun.

## Public procedures

All procedures are under `/trpc` and require the verified principal. Owner UUIDs
are not client inputs. The exact schemas are in
[`contracts/src/rpc`](../../../../../libs/contracts/src/rpc/index.ts).

| Kind | Procedure | Input / behavior |
| --- | --- | --- |
| Query | `tags.list` | No input; active owned tags |
| Mutation | `tags.create` | `{ name, color? }`; create owned tag |
| Mutation | `tags.update` | `{ id, name?, color? }`; rename/recolor an active owned tag |
| Mutation | `tags.archive` | `{ id }`; idempotent archival preserving history |
| Query | `tags.suggestions` | `{ id }` movement; owned rule suggestions with reason/confidence |
| Mutation | `tags.decide` | `{ transactionId, tagId }`; UUID or null is a manual decision |
| Mutation | `tags.reset` | `{ id }` movement; clear the decision, not intentional no-tag |
| Query | `tagRules.list` | No input; owned rules, including inactive records |
| Mutation | `tagRules.create` | Rule input; suggestion-only unless explicitly approved |
| Mutation | `tagRules.replace` | `{ id, rule }`; full replacement |
| Mutation | `tagRules.archive` | `{ id }`; disable future matching, retain historical assignments |
| Mutation | `tagRules.apply` | `{ id, after? }`; explicitly process an existing candidate page |

Tagging does not confirm income, change bank amounts/balances, or establish that
a transfer is internal. Those are separate financial interpretations.

Names are trimmed, case-sensitive and unique per owner, including archived names.
Creating an existing active name returns that tag without changing its color;
creating a reserved archived name conflicts. Updates require at least one field;
omitted fields are retained and null clears a color. Archived tags are not editable
or newly selectable and no longer match active rules. They remain on historical
movements, selected goals/budgets, configuration revisions and rule records. Display
metadata follows a rename/recolor; stored selected tag IDs and financial facts do
not change. The UI's `/etiquetas` page exposes these tag-management operations.

## Matching and approved automation

Rule input includes target tag, optional account scope, debit/credit direction,
`merchant` or `description`, exact match text, priority (0–100), and `autoApply`
(default false). Normalization uses Unicode NFKC, trimming, collapsed whitespace
and `es-CL` lowercase. These are exact normalized matches, not fuzzy or substring
matches.

The API builds a normalized-key lookup once per immutable rule snapshot and
merges preordered merchant/description and global/account buckets. It does not
scan and sort the entire rule list for every movement. Ordering and ambiguity
rules remain identical; SQL does not implement a second text normalizer.

The API ranks matching active rules with active tags by descending priority,
then account specificity, then stable creation-time/ID order. Equal top
priority/specificity pointing at different tags is ambiguous, so no automatic
tag is selected. Description matches remain suggestions only: the input schema
rejects `autoApply: true` for descriptions.

Automatic application requires an explicitly approved merchant rule, a clear,
nonremoved movement with `isInternalMovement === false`, and no manual decision.
Unknown internal status is not confirmed external. Suggestion confidence/reasons
describe matching evidence, not a guarantee that an automatic assignment will
occur. Replacing/archiving a rule does not immediately rewrite history.

## API computation, authoritative persistence

`TaggingService` owns normalization, suggestions and candidate matching/ranking.
Private `tagRules.manual` / `reset` check owned records and atomically write the
decision/event. Private rule commands validate owned active tag/account targets;
RLS independently rejects cross-user links.

Explicit `tagRules.apply` reads private `tagRules.candidates`: an approved active
rule, current matching rules and up to 1,001 UUID-ordered candidates. The API
computes decisions for at most 1,000, then calls private `tagRules.commit` with
the factual fingerprint. Persistence re-reads under the common user write lock,
rejects a stale fingerprint, checks approval/ownership/eligibility and commits
decisions/events together. The public result is `{ changed, nextCursor }`; pass
the returned cursor as `after` to process another page. These pages are explicit
separate commands, not a legacy-data adoption operation or one all-history
transaction. Only known rolled-back conflicts are recomputed; ambiguous failures
are not automatically retried.

During provider ingestion, manual tag/no-tag always wins. Relevant provider
corrections can revalidate a rule-owned tag; when it no longer qualifies, the
assignment is cleared with a history event. Removed or unresolved movements are
not automatically tagged. Rule decisions, conflicts, provider facts and checkpoint
commit together through the named sync command, rather than a sequence of public
tag calls. See the [banking guide](../../banking/README.md).

## UI and verification

The dashboard uses page-local confirmed decisions, targeted summary/budget
invalidation, component cancellation and guards against an older read erasing a
saved choice. Optional rule creation is separate from saving the tag; failure
reports partial success without replaying the saved decision. Full
rule-management destinations remain placeholders; `/etiquetas` now provides owned
tag create/rename/recolor/archive with retained-history explanations. See the
[UI lifecycle reference](../../../../../docs/technical/ui-data-lifecycle.md).

Unit matching tests, serverless UI race tests and real-PostgreSQL integration
tests cover different layers. Use the
[verification tiers](../../../../../docs/technical/development-workflow.md#verification-tiers)
to choose a command without accidentally starting listeners or using a real database.

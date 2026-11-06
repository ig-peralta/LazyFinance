# Income sources, expectations, and receipts

LAZ-25, listed in the [Stage A closure record](../planning/snapshots/stage-a-closure.md), defines the backend income model. Amounts are net CLP decimal strings; calendar dates use America/Santiago.

## Financial meanings

- **Income source:** a user declaration describing a source of earnings, its timing, and its amount behavior.
- **Expected payment:** a date and an exact, estimated, or unknown amount derived from a regular schedule or a dated one-off expectation.
- **Received income:** the amount of an existing, booked, non-internal credit transaction explicitly linked to a user-owned income source.
- **Unclassified credits:** non-internal credits without a valid user-owned receipt link. A refund or reimbursement does not become income just because it is positive.
- **Account balance:** the account's separate recorded balance. Source declarations, expectations, confirmation, and clearing a receipt do not change bank movements or balances.

Expected and received income are separate measures. A declared CLP 1,500,000 payday on the 25th can coexist with a CLP 1,480,000 receipt booked on the 26th. The backend never adds those figures together as two receipts.

## Source declarations

Payment timing (`regular` / `irregular`) is independent of amount behavior (`fixed` / `variable`). A regular commission can have a variable amount; an irregular invoice can have an exact known payment.

Fixed sources require a positive `expectedAmount`. Variable sources may supply an estimate or leave the amount unknown. Regular sources require a schedule; irregular sources use explicit dated expectations. A nominal amount on an irregular source does not generate payments by itself. Each dated expectation supplies its own amount and estimate flag.

Sources have inclusive `startDate` and optional `endDate` boundaries for planning. Archiving limits expected payments to the Santiago calendar date on which the source was archived, preserving earlier expectations and all receipt links. Archived sources are read-only; historical or late receipts can still be attributed to them.

Source replacement changes the current planning declaration. Historical expected figures are recalculated from that declaration and its effective dates; Stage A does not maintain versions of past plans. Recorded receipt amounts and dates always come from the transaction and are unaffected by source edits. Source dates bound expectations, not the dates on which actual payments are allowed to arrive.

## Calendar rules

| Schedule          | Rule                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `weekly`          | Every seven calendar days beginning at `anchorDate`                                     |
| `every_two_weeks` | Every fourteen calendar days beginning at `anchorDate`; some months have three payments |
| `twice_monthly`   | Two ordered payment days, each month                                                    |
| `monthly`         | One payment day, each month                                                             |

Monthly payment days accept 1–31 or `last`. Days beyond a month's length clamp to its last day, including February and leap years. For twice-monthly schedules, the first day must be 1–27 and precede the second; this prevents two declared payments from collapsing onto the same short-month date. For example, `[15, 30]` produces February 15 and February 28 in 2026.

Schedules use calendar dates, without bank-holiday or business-day adjustments. Receipt dates remain the actual booked timestamps. Expectations are calculated on demand and never post transactions automatically.

## Totals and periods

`expectedIncome` contains:

- `amount`: sum of all **known** expected amounts, including estimates.
- `estimatedAmount`: estimated portion already included in `amount`.
- `unknownAmountCount`: number of scheduled payments with unknown amounts, excluded from the numeric sum.
- `paymentCount`: all expected payments, including those with unknown amounts.

`amount: "0.00"` with unknown payments does not mean expected earnings are known to be zero. An irregular source with no dated expectations has no scheduled payments for the period, rather than an assumed recurring forecast.

Expected totals always cover the requested calendar month. Received income and unclassified credits cover booked movements through `asOf`. Future income months are allowed and can have expectations while received amounts remain zero as of the current time. Monthly financial summaries expose `expectedIncome`, `receivedIncome`, and `unclassifiedCredits` separately; the former ambiguous `income` field is removed.

Monthly comparisons expose `receivedIncome` and spending. Current-month comparisons use equivalent observed Santiago periods in both months. They do not compare full-month planned earnings against partially received earnings.

## Receipt confirmation

One `income_receipt` row links a transaction to a source, with the transaction ID as its primary key. Confirmation validates both owners, a credit direction, the internal-movement flag, and a booked date no later than confirmation time. Repeating the same confirmation is idempotent; replacing the source reclassifies the single receipt. Clearing a receipt returns that credit to the unclassified group.

Receipts attach to sources, not individual expected occurrences. Stage A does not automatically match deposits to paydays or mark expectations paid, overdue, or partially fulfilled. The period totals and explicit transaction links provide the initial reconciliation evidence.

## Public tRPC procedures

All operations require the authenticated principal. Financial reads use `Cache-Control: private, no-store`.

| Kind | Procedure | Purpose |
| --- | --- | --- |
| Query / mutation | `income.sources` / `income.createSource` | List / create owned sources |
| Query / mutation | `income.source` / `income.updateSource` | Read / fully replace an owned declaration |
| Mutation | `income.archiveSource` | Archive a source idempotently |
| Query / mutation | `income.expectations` / `income.createExpectation` | List / create dated irregular expectations |
| Mutation | `income.updateExpectation` / `income.removeExpectation` | Replace / remove an owned expectation |
| Query | `income.expected` | Expected payments and totals |
| Query | `income.receipts` | Confirmed receipts with source and transaction references |
| Mutation | `income.confirm` / `income.clear` | Confirm/reassign / clear an owned receipt |
| Query | `income.summary` | Full-month expectations, observed receipts and unclassified credits |

Procedures live under `/trpc`; the old REST paths are retired. Month queries accept `{ month?: "YYYY-MM" }`, default to the current Santiago month and allow future months. Writes use shared Zod contracts. The API owns calendar/money calculations; private persistence commands enforce owned source/expectation/receipt invariants atomically under the user write lock. Expected-payment and summary calculations consume a repeatable-read factual snapshot so their component facts describe the same state. The read-only MCP tool `consultar_ingresos` returns the same summary service result.

Example source input:

```json
{
  "name": "Trabajo principal",
  "currency": "CLP",
  "regularity": "regular",
  "amountKind": "fixed",
  "expectedAmount": "1500000.00",
  "schedule": { "frequency": "monthly", "day": 25 },
  "startDate": "2026-01-01",
  "endDate": null
}
```

## Demo and verification

The repeatable seed declares a monthly salary, estimated month-end commissions, irregular freelance work, and bonuses. It explicitly confirms the fabricated salary, freelance, and bonus movements; tax-refund credits remain unclassified. No receipt is inferred from the credit sign or a user-editable tag.

Calendar and contract cases run in the normal API test suite. PostgreSQL cases require a disposable database ending in `_test`. The root runner applies fresh migrations, provisions a restricted runtime login, starts compiled persistence with ephemeral signing keys, and exercises both real RPC boundaries:

```bash
TEST_POSTGRES_OWNER_URL=postgresql://owner:password@localhost:5432/lazyfinance_test \
  pnpm test:integration
```

These cases verify mutations, ownership, idempotent receipts, unclassified refunds, transfers, late/different-amount receipts, archived history, equivalent-period comparisons, balance preservation, and tRPC/MCP agreement. Owner-only fixture SQL is confined to test tooling; the API runtime has no database driver or credentials.

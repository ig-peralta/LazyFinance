# User Journeys

This is a **living, incremental document**. It starts with the journeys needed to validate the financial core and grows as each stage of the [product requirements](product-requirements.md) begins. It is not an exhaustive description of the finished product or a commitment to design every future feature upfront.

Each journey describes a user's situation, the experience they need, and an observable outcome. Stage A journeys are detailed enough to test with controlled CLP demo data and link to acceptance stories in Linear. Stage B and C journeys are intentionally brief until their work is planned; we will expand them with examples, acceptance criteria, and issue links as we learn more. Keep validated journeys here as a record, and revise assumptions explicitly when the financial model changes.

## Stage A - Core financial understanding

### J1 - Understand my account balances

**Situation:** I have checking, savings and credit-card accounts. I want to know what is available now without confusing a card balance, recorded income or a stale balance with cash I can spend.

**Journey:** Open the overview, inspect each account's balance and type, and compare the balance with recent movements. If freshness or the meaning of a balance is uncertain, the system says so rather than inventing an available-to-spend total.

**Observable outcome:** The amounts can be explained per account, remain scoped to the signed-in user, and reconcile with the representative demo history. A month's recorded income is not presented as current available cash.

**Stage A check:** Reconcile checking, savings and credit-card examples and decide how balance freshness and card liability are expressed. See the account/transaction semantics review in [LAZ-17](https://linear.app/lazyfinance/issue/LAZ-17).

### J2 - Understand actual spending without double-counting money movements

**Situation:** I want to know how much I spent this month and whether it is more than the comparable part of last month. I have transferred money between my accounts and paid a credit-card bill.

**Journey:** View monthly spending and the comparison; inspect transactions and tag breakdowns when something seems surprising.

**Observable outcome:** Internal transfers and payments that merely move money between my own accounts do not inflate spending or income. Debit spending is counted once in the overall total; overlapping tags can each show the same movement and are not presented as mutually exclusive categories. A partial month is compared with a comparable prior period, not a full month.

**Stage A check:** Use transfer, card-payment, tagged and untagged examples to agree the rules before changing the model or calculations. See [LAZ-17](https://linear.app/lazyfinance/issue/LAZ-17).

### J3 - Know how I am doing against a spending budget

**Situation:** I set a grocery spending limit and want to see what has been spent, what remains, and which movements count during its period.

**Journey:** Inspect the budget alongside the period and relevant spending. Check whether the result still makes sense when a movement has more than one tag or no tag.

**Observable outcome:** Spent and remaining amounts can be traced to eligible user-owned movements and a clearly defined period. A multi-tagged movement counts once per budget, not twice within that budget; excluded internal movements do not consume the limit. Where untagged spending cannot be attributed, the presentation does not imply complete category coverage.

**Stage A check:** Exercise representative monthly and recurring-budget scenarios, and identify any minimum classification or budget workflow needed to make the result trustworthy. See [LAZ-15](https://linear.app/lazyfinance/issue/LAZ-15) and [LAZ-17](https://linear.app/lazyfinance/issue/LAZ-17).

### J4 - Distinguish a savings target from a spending limit

**Situation:** I have a savings goal and a spending budget. I want to know whether I have made progress toward the savings goal, rather than seeing a misleading figure based only on tagged spending.

**Journey:** Inspect the goal, its target and any progress or contribution information. Compare it with a spending budget without treating them as the same measure.

**Observable outcome:** The system distinguishes a target from measured contributions; it only shows quantified savings progress after defining and substantiating what counts as a contribution. A transfer or tag alone is not assumed to be a contribution without an agreed rule. If no reliable progress can be measured yet, the system shows the goal without an invented percentage.

**Stage A check:** Decide contribution semantics and objective period/recurrence behavior against representative examples. See [LAZ-16](https://linear.app/lazyfinance/issue/LAZ-16).

## Later journeys - Detail shortly before implementation

### Stage B - Ask our own text agent

I ask a question about balances, spending or budgets and get an answer grounded in my data, with the period, relevant assumptions and uncertainty made clear. The agent uses the same financial logic as the dashboard and MCP tools. Write detailed stories when the text experience is taken up in Stage B.

### Stage C - Continue the conversation by voice

I ask the same types of questions by voice after the text flow is reliable. The voice channel retains the meaning and access boundaries of the text experience. Detail this journey when voice work is planned.

## Using this document

Keep acceptance criteria and implementation work in Linear issues. For Stage A, the corresponding user stories are child issues of the existing model-review and missing-flows issues; completing a story means its outcome was demonstrated, not merely that a screen or schema field exists. Use the Stage A gate in [LAZ-18](https://linear.app/lazyfinance/issue/LAZ-18) to record which journeys passed and which nonblocking limitations remain.

## Stage A user stories

| Journey | User story                                                                                       | Parent decision                                       |
| ------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| J1      | [LAZ-19 - Interpret account balances](https://linear.app/lazyfinance/issue/LAZ-19)               | [LAZ-17](https://linear.app/lazyfinance/issue/LAZ-17) |
| J2      | [LAZ-21 - Exclude internal movements from spending](https://linear.app/lazyfinance/issue/LAZ-21) | [LAZ-17](https://linear.app/lazyfinance/issue/LAZ-17) |
| J3      | [LAZ-22 - Trace budget spending](https://linear.app/lazyfinance/issue/LAZ-22)                    | [LAZ-15](https://linear.app/lazyfinance/issue/LAZ-15) |
| J4      | [LAZ-20 - Measure savings-goal progress honestly](https://linear.app/lazyfinance/issue/LAZ-20)   | [LAZ-16](https://linear.app/lazyfinance/issue/LAZ-16) |

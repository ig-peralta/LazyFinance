# LazyFinance — Product Requirements Document

> **Product:** LazyFinance (referred to as *Critical Finance* in the repository).
> **Status:** draft vision and scope. Written as if no prior code existed.
> **Document type:** product requirements and tentative roadmap.

---

## 1. Purpose

Define, in product terms, what LazyFinance is, what problem it solves, what it aims to achieve, what its functional capabilities are, and how its future stages are envisioned. The document avoids implementation details and focuses on what the system must allow its users to do.

---

## 2. Problem and Context

People often do not understand their banking situation beyond how much money is in the account and the movements of the last few days. Questions arise that a balance alone cannot answer:

- Will I make it to the end of the month?
- Am I spending more or less than last month?
- Is there any strange or duplicate charge?
- Where should I cut back to meet my savings goal?

The project's value lies in the difference between **having financial information** and **being able to interpret it**. The user does not want to review lists of movements and do the math by hand: they want an understandable answer.

---

## 3. Project Description

LazyFinance is a **conversational AI agent focused on personal finance analysis**. The user interacts through written questions and, in later stages, through voice commands.

Examples of interaction:

> "With what I've spent this week, will I make it to the end of the month?"

> "How much did I spend on groceries and food delivery this month compared to last month?"

> "Analyze my account and tell me if there is any unusual charge or duplicate purchase."

> "I want to save a certain amount in three months, what should I cut back on?"

The system analyzes the user's financial movements, applies domain financial logic, and returns an answer in natural language. **The value is not in showing banking data, but in interpreting it and turning it into useful information for making decisions.**

---

## 4. What It Aims to Achieve (Value Proposition)

1. **Understand the current financial situation:** answer questions about balances, spending, and movements without forcing the user to review them manually.
2. **Control and monitor budgets and savings goals:** help the user track spending limits and savings targets.
3. **Personalized recommendations:** suggestions based on the user's banking behavior, not generic advice.
4. **A seamless interface:** query by text or voice naturally, complemented by a web control dashboard.
5. **Flexibility and integration:** use LazyFinance from different applications and tools the user already uses daily, not only from its own screen.

The conceptual value flow is:

```
User asks a question
  → LazyFinance obtains the banking information
  → analyzes the data
  → applies the relevant financial logic
  → returns an answer in natural language
```

---

## 5. How It Will Work (Conceptual Vision)

### 5.1 Banking Data Ingestion

Layer responsible for obtaining accounts, balances, and banking movements. During development the **sandbox/simulated Fintoc environment** is used, so initially no real third-party accounts are involved, while leaving the architecture prepared to do so in the future.

The project envisions **integration with multiple banking providers**, so a single user can connect more than one source and the system does not become coupled to a single provider.

### 5.2 Financial Processing and Domain Logic

Layer of domain logic that interprets raw data. It is responsible for the analysis functions described in the capabilities section (balance, spending summary, categorization, period comparison, projection, anomaly detection, budgets and savings goals).

### 5.3 Tool Server (MCP)

LazyFinance exposes its financial capabilities through a **tool server based on MCP (Model Context Protocol)**. This separates the responsibilities of the AI agent (which converses and reasons) from those of the backend (which accesses data and executes financial logic).

MCP is also a **core feature of the product**: it enables flexibility of use and integration with tools people use in their daily lives. Different assistants, applications, or interfaces can connect to the same LazyFinance backend without the financial logic depending on a specific agent.

### 5.4 Interaction Layer

First by text (written conversation), then by voice, complemented by a **dashboard or web control center** to monitor budgets, goals, and financial situation visually.

---

## 6. Actors

- **End user:** person with personal financial information who wants to understand and manage it.
- **AI agent:** language model that interprets the question, decides which tools to invoke, and writes the answer.
- **LazyFinance backend:** exposes tools via MCP, accesses banking data, and executes financial logic.
- **Banking providers:** data sources (Fintoc in sandbox initially, other providers in the future).
- **External tools:** daily-use applications and assistants that integrate via MCP.

---

## 7. Agent Scope and Limits

LazyFinance is an **advisor**, not an autonomous financial actor:

- The agent **reads, analyzes, explains, and suggests** (nudges).
- The user **confirms** any relevant action.
- The initial scope is limited to **query and analysis**, without executing transactions: the agent does not move money on its own.

---

## 8. Functional Capabilities

### 8.1 Understand the Current Financial Situation

- Obtain the **current balance** of the user's accounts.
- **Summarize spending** for a period.
- Analyze spending **by category or tag** (flexible classification of movements, without rigid system-imposed hierarchies).

### 8.2 Monitor and Compare Over Time

- **Compare periods** (for example, this month against last month).
- **Project month-end cash flow**, estimating whether the user will make it or not with current spending.

### 8.3 Detect Patterns and Anomalies

- Detect **unusual charges**.
- Identify **duplicate purchases**.
- Detect **price increases** (for example, in recurring subscriptions).

### 8.4 Budgets and Savings Goals

- **Control and monitor spending budgets.**
- Define and monitor **savings goals.**
- **Simulate savings goals** (for example, "I want to save X in N months, what should I cut back on?").
- Organize spending and goals through **tags**, so a single movement can contribute to several budgets or goals.

### 8.5 Personalized Recommendations

- Generate **recommendations based on the user's banking behavior** (spending patterns, habits, and evolution over time).

### 8.6 Interaction and Interface

- **Text-based conversational interface** as the first stage of interaction.
- **Voice prompts** as the second stage.
- **Dashboard / web control center** to monitor budgets, goals, and financial situation.
- **Seamless** experience: the user queries naturally, without friction between channels.

### 8.7 Integrations

- **Integration with multiple banking providers** (Fintoc in sandbox initially, extensible to others and to real data).
- **Integration into other daily-use applications**, enabled by the MCP server.

### 8.8 MCP Tool Server (Core Feature)

- Expose the backend's financial functions as tools consumable by an AI agent.
- Separate the agent's responsibility (conversation and reasoning) from the backend's (data and logic).
- Provide **flexibility of use**: different agents and tools can connect to the same backend.
- Facilitate **integration with tools people use in their daily lives**.

---

## 9. Objectives

### 9.1 Main Objective

Develop an AI-based agent that allows users to query and understand their personal financial information in natural language, integrating banking data through the Fintoc API.

### 9.2 Specific Objectives

1. Integrate Fintoc (accounts, balances, and movements).
2. Build the domain financial logic.
3. Implement the MCP tool server.
4. Build the text-based conversational interface.
5. Add voice interaction.
6. Validate the system with sandbox data and representative use cases.

---

## 10. Roadmap (Tentative Stages)

The stages are ordered incrementally and are tentative; they may be reordered based on what is validated in each phase.

1. **Banking connectivity.** Integrate Fintoc (sandbox) to obtain accounts, balances, and movements, with an architecture extensible to multiple providers and to real data.
2. **Domain financial logic.** Implement the analysis functions: balance, spending summary, tag-based categorization, period comparison, month-end projection, anomaly and price-increase detection, and budgets/goals with savings simulation.
3. **MCP tool server.** Expose the above functions to the agent, enabling flexibility of use and integration with daily-use tools.
4. **Text-based conversational agent.** First interaction interface with the agent.
5. **Dashboard / web control center.** Visual panel to monitor budgets, goals, and financial situation.
6. **Voice interaction.** Second interaction stage, once the text-based flow is validated.
7. **Validation.** Testing with sandbox data and representative use cases, within a scope limited to query and analysis (without executing transactions).

---

## 11. Out of Scope Initially (Explicitly Deferred)

- **Transaction execution:** the agent does not move money in the initial scope.
- **Real third-party banking data:** initially sandbox/simulated environment only.
- **Full user authentication:** a temporary mechanism is initially considered; real authentication is defined later.
- **Multi-currency and FX conversion:** initially a single currency.
- **Sharing accounts or budgets between people:** the initial scope is individual.
- **Detailed history of goal evolution:** deferred until the required behavior is understood.

---

## 12. Risks and Open Questions

- **Banking provider dependency:** moving from sandbox to real data may change integration assumptions.
- **Definition of "contribution" to a savings goal:** summing movements is not enough; what counts as a contribution must be specified.
- **Goal history:** the evolution data needed for analysis and recommendations is still undefined.
- **Multi-provider:** define how to normalize differences between providers without coupling to any single one.
- **Privacy and security:** banking data is sensitive; the design must protect it from the start.

---

## 13. Success Criteria (Proposed)

- A user can ask a question in natural language and receive a correct and understandable financial answer.
- The system answers queries about balance, spending by category, period comparison, and month-end projection.
- The system detects unusual charges, duplicates, and price increases.
- The user can define and monitor budgets and savings goals, with simulation.
- The agent suggests and the user confirms; no transactions are executed without consent.
- The capabilities are consumable via MCP by different agents and daily-use tools.
- The system works validated on sandbox data with representative use cases.

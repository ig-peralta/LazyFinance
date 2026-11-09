# Conceptual UML diagrams

These selected PNGs are **unchanged visual sketches of possible LazyFinance interactions and structure**, not diagrams of the currently shipped implementation or a verified database model. They can help discuss the product direction described in the [product vision](../product/product-vision.md); the [current architecture](../technical/architecture.md) and [implemented database model/ERD](../technical/database-model.md) describe what actually exists.

| Diagram                                               | What it illustrates                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Use-case overview](conceptual-use-cases.png)         | Potential user, banking-provider and external-MCP-client interactions.                                     |
| [Component overview](conceptual-components.png)       | Intended separation between interfaces, financial services, identity, ingestion and external integrations. |
| [Agent query sequence](conceptual-agent-sequence.png) | A possible text/voice-agent conversation using financial context and a bank adapter.                       |

**Interpretation limits:** The sketches contain an older **many-to-many transaction-tag** assumption. The current model gives each transaction at most one optional tag; a spending budget can select multiple tags. They depict text/voice, Fintoc and external authorization as proposed interactions; the images do not establish their implementation or verification. Use the [Stage B closure](../planning/stage-b/closure.md) for delivered text/banking/MCP outcomes and limitations; voice remains a candidate. The class-diagram candidate was not selected as a data-model diagram because it differs from the migrations. The separate [source-verified Mermaid ERD](../technical/database-model.md#implemented-relationship-diagram) covers the current **28-table identity/finance/assistant model**; the historical PNGs remain unchanged.

![Conceptual use-case overview](conceptual-use-cases.png)

![Conceptual component overview](conceptual-components.png)

![Conceptual agent query sequence](conceptual-agent-sequence.png)

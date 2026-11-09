import type {
  AssistantSource,
  AssistantTurn,
  FinancialAction,
} from "@lazyfinance/contracts";
import { account, movement } from "./rpc";

export const assistantAccount = {
  ...account(movement.account.id),
  alias: "Cuenta principal",
  balance: "500000.00",
};

export const assistantSource = (
  overrides: Partial<AssistantSource> = {},
): AssistantSource => ({
  id: "F1",
  tool: "consultar_saldos_cuentas",
  title: "Cuentas y saldos",
  status: "available",
  queriedAt: "2026-11-09T15:00:00.000Z",
  month: null,
  recordId: null,
  path: "/cuentas",
  note: "Datos guardados. La consulta no es una sincronización bancaria.",
  data: { accounts: [assistantAccount] },
  ...overrides,
});

export const assistantReply: AssistantTurn = {
  id: "00000000-0000-4000-8000-000000000003",
  question: "¿Qué saldo tengo?",
  text: "Tu saldo reportado es **$500.000** [F1].",
  status: "complete",
  sources: [assistantSource()],
  actions: [],
  createdAt: "2026-11-09T15:00:00.000Z",
};

export const assistantAction = (
  overrides: Partial<FinancialAction> = {},
): FinancialAction => ({
  id: "00000000-0000-4000-8000-000000000009",
  version: 1,
  conversationId: "00000000-0000-4000-8000-000000000001",
  turnId: assistantReply.id,
  origin: "assistant",
  request: { kind: "create_tag", tag: { name: "Supermercado", color: null } },
  context: { tags: [], movement: null },
  status: "proposed",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  results: [],
  ...overrides,
});

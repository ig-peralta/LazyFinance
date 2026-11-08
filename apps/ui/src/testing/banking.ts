import type { RpcOutput } from "./rpc";

export const bankingConfiguration = {
  enabled: true,
  publicKey: "pk_test_ui_fixture",
  mode: "test",
} satisfies RpcOutput<"banking.configuration">;

export const bankingIntent = {
  id: "00000000-0000-4000-8000-000000000091",
  publicKey: "pk_test_ui_fixture",
  widgetToken: "li_ui_sec_fixture",
  mode: "test",
  expiresAt: "2026-11-08T18:00:00.000Z",
} satisfies RpcOutput<"banking.createLinkIntent">;

export const bankingConnection = {
  id: "00000000-0000-4000-8000-000000000092",
  provider: "fintoc",
  mode: "test",
  holderType: "individual",
  institution: { id: "cl_banco_bci", name: "Bci de prueba" },
  status: "active",
  disconnectedAt: null,
  disconnectPending: false,
  createdAt: "2026-11-08T17:00:00.000Z",
  updatedAt: "2026-11-08T17:00:00.000Z",
} satisfies RpcOutput<"banking.connections">[number];

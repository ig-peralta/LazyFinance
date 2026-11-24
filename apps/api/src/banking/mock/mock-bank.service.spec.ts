import { DemoBankSourceSchema } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { ConnectorResultSchema } from "../connector/normalized-banking.schema";
import { demoBankConnector } from "./mock-bank.service";

const account = (externalId: string) => ({
  externalId,
  type: "checking" as const,
  number: externalId,
  holderName: "Persona Demo",
  balance: "100000.00",
});

const source = DemoBankSourceSchema.parse({
  connectionId: "00000000-0000-4000-8000-000000000001",
  updatedAt: "2026-11-24T10:00:00.000Z",
  accounts: [
    account("demo-main-checking"),
    account("demo-main-savings"),
    account("demo-main-creditCard"),
    account("demo-extra-checking"),
    account("demo-extra-savings"),
    account("demo-extra-credit-card"),
  ],
  movements: [
    {
      accountExternalId: "demo-main-checking",
      externalId: "movement-1",
      bookedAt: "2026-11-23T15:00:00.000Z",
      amount: "-12000.00",
      merchant: "Feria",
      description: "Compra",
      relatedMovement: null,
      removed: false,
    },
    {
      accountExternalId: "demo-extra-savings",
      externalId: "movement-2",
      bookedAt: "2026-11-23T15:00:00.000Z",
      amount: "4000.00",
      merchant: "Banco",
      description: "Abono",
      relatedMovement: null,
      removed: false,
    },
  ],
  failure: null,
  prepared: true,
});

describe("simulated bank connector", () => {
  it("returns only selected financial facts and replays stable identities", async () => {
    const selected = [
      "demo-main-checking",
      "demo-main-savings",
      "demo-main-creditCard",
    ];
    const connector = demoBankConnector(source, selected);
    const input = {
      connectionId: source.connectionId,
      checkpoint: null,
      pageCursor: null,
    };
    const first = ConnectorResultSchema.parse(await connector.fetchPage(input));
    const replay = ConnectorResultSchema.parse(
      await connector.fetchPage({ ...input, checkpoint: source.updatedAt }),
    );
    expect(replay).toEqual(first);
    expect(first.kind).toBe("page");
    if (first.kind !== "page") throw new Error("Expected page");
    expect(first.accounts.map((row) => row.externalId)).toEqual(selected);
    expect(first.movements.map((row) => row.externalId)).toEqual([
      "movement-1",
    ]);
    expect(first.checkpoint).toBe(source.updatedAt);
  });

  it("reports failure without delivering any financial page", async () => {
    const connector = demoBankConnector({ ...source, failure: "retryable" }, [
      "demo-main-checking",
    ]);
    const response = await connector.fetchPage({
      connectionId: source.connectionId,
      checkpoint: null,
      pageCursor: null,
    });
    expect(response).toMatchObject({ kind: "failure", reason: "retryable" });
  });

  it("tombstones removed movements instead of silently omitting them", async () => {
    const changed = {
      ...source,
      movements: [{ ...source.movements[0], removed: true }],
    };
    const connector = demoBankConnector(changed, ["demo-main-checking"]);
    const page = ConnectorResultSchema.parse(
      await connector.fetchPage({
        connectionId: source.connectionId,
        checkpoint: null,
        pageCursor: null,
      }),
    );
    if (page.kind !== "page") throw new Error("Expected page");
    expect(page.movements).toEqual([]);
    expect(page.removedMovements).toEqual([
      expect.objectContaining({ externalId: "movement-1" }),
    ]);
  });
});

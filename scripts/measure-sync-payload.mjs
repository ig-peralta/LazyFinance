import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  prepareSync,
  syncScope,
} = require("../apps/api/dist/src/banking/ingestion/prepare-sync.js");

for (const maximumText of [false, true]) {
  const text = (length) => (maximumText ? "界".repeat(length) : "fixture");
  const page = {
    kind: "page",
    observedAt: "2026-10-15T18:00:00.000Z",
    checkpoint: "complete",
    complete: true,
    nextCursor: null,
    removedMovements: [],
    accounts: [
      {
        externalId: "account",
        type: "checking",
        currency: "CLP",
        number: null,
        holderName: null,
        reportedBalance: null,
        historyCoverage: { completeness: "unknown", from: null, through: null },
      },
    ],
    movements: Array.from({ length: 49999 }, (_, i) => ({
      accountExternalId: "account",
      externalId: maximumText ? `${i}`.padEnd(512, "界") : `movement-${i}`,
      amount: "-10.00",
      booked: { precision: "instant", at: "2026-10-14T12:00:00.000Z" },
      description: text(240),
      merchant: text(120),
      providerUpdatedAt: null,
      providerKind: "other",
      relatedMovement: null,
      counterpartyHolder: null,
    })),
  };
  const scope = syncScope(randomUUID(), 0, [page]);
  const facts = {
    state: { lastProviderObservedAt: null },
    accounts: [],
    movements: [],
    removals: [],
    rules: [],
    fingerprint: "0".repeat(64),
  };
  const command = prepareSync(scope, facts, [page]);
  const mib = (value) =>
    (Buffer.byteLength(JSON.stringify(value)) / 1024 / 1024).toFixed(2);
  console.log(
    `${maximumText ? "maximal UTF-8 text" : "ordinary text"} / 50,000 records: normalized ${mib(page)} MiB, prepared ${mib(command)} MiB`,
  );
}

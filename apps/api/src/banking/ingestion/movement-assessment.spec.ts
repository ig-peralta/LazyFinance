import type { PreparedProviderAccount } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { initialPage } from "../../../tests/fixtures/banking/normalized-pages";
import type { NormalizedMovement } from "../connector/normalized-banking.schema";
import { assessMovement } from "./movement-assessment";
import { movementKey } from "./normalized-movement";

function account(
  externalId: string,
  type: PreparedProviderAccount["type"] = "checking",
): PreparedProviderAccount {
  return {
    id: externalId,
    externalId,
    type,
    currency: "CLP",
    number: null,
    holderName: null,
    balance: null,
    lastSyncedAt: null,
    providerObservedAt: initialPage.observedAt,
    historyCompleteness: "unknown",
    historyFrom: null,
    historyThrough: null,
  };
}

function pair() {
  const outgoing: NormalizedMovement = { ...initialPage.movements[2] };
  const incoming: NormalizedMovement = { ...initialPage.movements[3] };
  const owner = account(outgoing.accountExternalId);
  const other = account(incoming.accountExternalId, "savings");
  const accounts = new Map([
    [owner.externalId, owner],
    [other.externalId, other],
  ]);
  const movements = new Map(
    [outgoing, incoming].map((row) => [
      movementKey(row.accountExternalId, row.externalId),
      row,
    ]),
  );
  const removed = new Map<string, unknown>();
  return { outgoing, incoming, owner, other, accounts, movements, removed };
}

describe("provider movement assessment", () => {
  it("requires reciprocal owned-account evidence and exactly opposite amounts", () => {
    const f = pair();
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("internal");
    f.movements.set(
      movementKey(f.incoming.accountExternalId, f.incoming.externalId),
      { ...f.incoming, amount: "199.99" },
    );
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
    f.accounts.delete(f.other.externalId);
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
  });

  it("retains verified pair evidence across omitted movements, but not a removal", () => {
    const f = pair();
    const otherKey = movementKey(
      f.incoming.accountExternalId,
      f.incoming.externalId,
    );
    f.movements.delete(otherKey);
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        true,
      ),
    ).toBe("internal");
    f.removed.set(otherKey, {});
    expect(
      assessMovement(
        f.outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        true,
      ),
    ).toBe("unknown");
  });

  it("requires exactly one credit-card account for a card-payment pair", () => {
    const f = pair();
    const outgoing: NormalizedMovement = {
      ...f.outgoing,
      relatedMovement: {
        kind: "card_payment_pair",
        accountExternalId: f.other.externalId,
        movementExternalId: f.incoming.externalId,
      },
    };
    f.movements.set(
      movementKey(f.incoming.accountExternalId, f.incoming.externalId),
      {
        ...f.incoming,
        relatedMovement: {
          kind: "card_payment_pair",
          accountExternalId: f.owner.externalId,
          movementExternalId: f.outgoing.externalId,
        },
      },
    );
    expect(
      assessMovement(
        outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
    f.accounts.set(f.other.externalId, { ...f.other, type: "credit_card" });
    expect(
      assessMovement(
        outgoing,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("internal");
  });

  it("treats ordinary purchases as external without treating transfer hints or card credits as proof", () => {
    const f = pair();
    const purchase: NormalizedMovement = { ...initialPage.movements[1] };
    expect(
      assessMovement(
        purchase,
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("external");
    expect(
      assessMovement(
        { ...purchase, providerKind: "transfer" },
        f.owner,
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
    expect(
      assessMovement(
        { ...purchase, amount: "10.00" },
        { ...f.owner, type: "credit_card" },
        f.movements,
        f.accounts,
        f.removed,
        false,
      ),
    ).toBe("unknown");
  });
});

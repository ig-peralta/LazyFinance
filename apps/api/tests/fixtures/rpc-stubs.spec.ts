import { describe, expectTypeOf, it, vi } from "vitest";
import type { PersistenceClient } from "../../src/persistence/persistence.client";
import type { AsyncStub, RpcStubs } from "./rpc-stubs";

type IncomeClient = ReturnType<PersistenceClient["user"]>["income"];
type ExpectedFactsQuery = IncomeClient["expectedFacts"]["query"];

describe("RPC method stub types", () => {
  it("keeps procedure arguments and awaited output without requiring branded promises", () => {
    type Query = RpcStubs<IncomeClient>["expectedFacts"]["query"];
    const query = vi.fn<Query>(async () => ({ sources: [], expectations: [] }));
    const check = () => {
      // Compile-time regression probes only; never invoke these invalid calls.
      // @ts-expect-error A period has named start/end fields, not an arbitrary month.
      void query({ month: "2026-09" });
      // @ts-expect-error The expected-facts output requires expectations as well as sources.
      query.mockResolvedValue({ sources: [] });
    };

    expectTypeOf(check).returns.toBeVoid();
    expectTypeOf<Parameters<Query>>().toEqualTypeOf<
      Parameters<ExpectedFactsQuery>
    >();
    expectTypeOf<ReturnType<Query>>().toEqualTypeOf<
      Promise<Awaited<ReturnType<ExpectedFactsQuery>>>
    >();
    expectTypeOf<Query>().toEqualTypeOf<AsyncStub<ExpectedFactsQuery>>();
  });
});

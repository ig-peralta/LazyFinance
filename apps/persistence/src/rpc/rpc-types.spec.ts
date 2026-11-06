import type { PersistenceRouter } from "@lazyfinance/rpc-persistence";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { expectTypeOf } from "vitest";

it("exports precise client types without importing the persistence application", () => {
  type Output = inferRouterOutputs<PersistenceRouter>;
  type Input = inferRouterInputs<PersistenceRouter>;
  expectTypeOf<
    Output["accounts"]["listActive"][number]["balance"]
  >().toEqualTypeOf<string | null>();
  expectTypeOf<Input["identity"]["resolve"]["mode"]>().toEqualTypeOf<
    "existing" | "provision"
  >();
  expectTypeOf<
    Output["identity"]["resolve"]["userId"]
  >().toEqualTypeOf<string>();
});

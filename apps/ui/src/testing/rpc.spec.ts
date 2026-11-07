import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createRpcFetch,
  type RpcHandlers,
  type RpcInput,
  type RpcOutput,
  rpcFailure,
  rpcResponse,
  tag,
} from "./rpc";

describe("typed RPC test transport", () => {
  it("decodes and records a mutation with its procedure-specific input", async () => {
    const mock = createRpcFetch({
      "tags.create": (input) => ({ ...tag, name: input.name }),
    });
    const response = await mock.fetch("http://api.test/trpc/tags.create", {
      method: "POST",
      headers: { authorization: "Bearer owner" },
      body: JSON.stringify({ name: "Comida" }),
    });
    const payload: unknown = await response.json();

    expect(payload).toEqual({ result: { data: tag } });
    expect(mock.callsTo("tags.create")[0]).toMatchObject({
      input: { name: "Comida" },
      authorization: "Bearer owner",
    });
    expectTypeOf(mock.callsTo("tags.create")[0].input).toEqualTypeOf<
      RpcInput<"tags.create">
    >();
  });

  it("keeps an absent query input undefined rather than inventing null", async () => {
    const mock = createRpcFetch();
    await mock.fetch("http://api.test/trpc/auth.config");

    expect(mock.callsTo("auth.config")[0].input).toBeUndefined();
    expectTypeOf(mock.callsTo("auth.config")[0].input).toEqualTypeOf<void>();
  });

  it("passes deliberate raw/error responses through and rejects unknown routes", async () => {
    const failure = rpcFailure("UNAUTHORIZED", 401);
    const malformed = rpcResponse({ deliberately: "not an account list" });
    const mock = createRpcFetch({
      "auth.principal": () => failure,
      "accounts.list": () => malformed,
    });

    expect(await mock.fetch("http://api.test/trpc/auth.principal")).toBe(
      failure,
    );
    expect(await mock.fetch("http://api.test/trpc/accounts.list")).toBe(
      malformed,
    );
    await expect(
      mock.fetch("http://api.test/trpc/accounts.typo"),
    ).rejects.toThrow("Unexpected test RPC: accounts.typo");
  });

  it("requires known procedures, matching input fields and complete output shapes", () => {
    const check = (handlers: RpcHandlers) => {
      // Compile-time regression probes only: never invoke invalid handlers.
      // @ts-expect-error Procedure names come from the generated router.
      handlers["tags.typo"] = () => tag;
      // @ts-expect-error A successful tag response needs id, name and color.
      handlers["tags.create"] = () => ({ name: "Missing fields" });
      handlers["tags.create"] = (input) => {
        // @ts-expect-error Creation input is not an ID-based command.
        const id = input.id;
        void id;
        return tag;
      };
    };

    expectTypeOf(check).parameter(0).toEqualTypeOf<RpcHandlers>();
    expectTypeOf(tag).toExtend<RpcOutput<"tags.create">>();
  });
});

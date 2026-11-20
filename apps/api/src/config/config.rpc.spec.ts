import { describe, expect, it } from "vitest";
import { testEnvironment } from "../../tests/fixtures/environment";
import { ConfigRpc } from "./config.rpc";

describe("public application configuration", () => {
  it("groups auth and demo-tools availability without exposing secrets", () => {
    expect(new ConfigRpc(testEnvironment()).get()).toEqual({
      auth: { provider: "mock" },
      demoTools: { enabled: false },
    });
    expect(
      new ConfigRpc(testEnvironment({ DEMO_TOOLS_ENABLED: true })).get(),
    ).toEqual({ auth: { provider: "mock" }, demoTools: { enabled: true } });
  });
});

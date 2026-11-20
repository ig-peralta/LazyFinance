import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoToolsDatabase } from "./demo-tools.database";

describe("conditional demo tools connection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates no connection when the flag is absent", async () => {
    vi.stubEnv("DEMO_TOOLS_ENABLED", undefined);
    vi.stubEnv("DEMO_TOOLS_DATABASE_URL", undefined);
    const tools = new DemoToolsDatabase();
    await tools.onModuleInit();
    expect(tools.connection()).toBeUndefined();
    await tools.onModuleDestroy();
  });

  it("refuses a privileged URL without the flag and incomplete enabled settings", async () => {
    vi.stubEnv("DEMO_TOOLS_ENABLED", undefined);
    vi.stubEnv(
      "DEMO_TOOLS_DATABASE_URL",
      "postgresql://privileged@localhost/demo_test",
    );
    await expect(new DemoToolsDatabase().onModuleInit()).rejects.toThrow(
      "credentials require DEMO_TOOLS_ENABLED=true",
    );

    vi.stubEnv("DEMO_TOOLS_ENABLED", "true");
    vi.stubEnv("DEMO_TOOLS_DATABASE_URL", undefined);
    await expect(new DemoToolsDatabase().onModuleInit()).rejects.toThrow(
      "require a dedicated database connection",
    );
  });

  it("rejects mismatched database/login and passwordless connections before opening a pool", async () => {
    vi.stubEnv("DEMO_TOOLS_ENABLED", "true");
    vi.stubEnv("DEMO_TOOLS_DATABASE_NAME", "demo_test");
    vi.stubEnv("DEMO_TOOLS_DATABASE_USER", "lazyfinance_demo_tools");
    for (const connection of [
      "postgresql://lazyfinance_demo_tools@localhost/demo_test",
      "postgresql://some_other_role:secret@localhost/demo_test",
      "postgresql://lazyfinance_demo_tools:secret@localhost/production",
    ]) {
      vi.stubEnv("DEMO_TOOLS_DATABASE_URL", connection);
      await expect(new DemoToolsDatabase().onModuleInit()).rejects.toThrow(
        "Invalid demo tools database boundary configuration",
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import { fintocEnvironment } from "../../../../tests/fixtures/banking/fintoc";
import { FintocCredentials } from "./fintoc-credentials";

describe("provider link-token encryption", () => {
  it("uses fresh authenticated encryption and binds ciphertext to owner, mode and provider identity", () => {
    const vault = new FintocCredentials(fintocEnvironment());
    const token = "link_fixture_token_private";
    const encrypted = vault.seal(token, "alice", "test", "link_fixture");
    expect(encrypted).not.toContain(token);
    expect(vault.seal(token, "alice", "test", "link_fixture")).not.toBe(
      encrypted,
    );
    expect(vault.open(encrypted, "alice", "test", "link_fixture")).toBe(token);
    for (const [owner, mode, id] of [
      ["bob", "test", "link_fixture"],
      ["alice", "live", "link_fixture"],
      ["alice", "test", "link_other"],
    ])
      expect(() => vault.open(encrypted, owner, mode, id)).toThrow(
        "Banking credentials cannot be opened",
      );
    expect(() =>
      vault.open(encrypted.slice(0, -3), "alice", "test", "link_fixture"),
    ).toThrow();
  });

  it("rejects shortened authentication tags rather than accepting weaker GCM authentication", () => {
    const vault = new FintocCredentials(fintocEnvironment());
    const parts = vault
      .seal("link_fixture_token_private", "alice", "test", "link_fixture")
      .split(".");
    parts[2] = Buffer.from(parts[2], "base64url")
      .subarray(0, 4)
      .toString("base64url");
    expect(() =>
      vault.open(parts.join("."), "alice", "test", "link_fixture"),
    ).toThrow("Banking credentials cannot be opened");
  });
});

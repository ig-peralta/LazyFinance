import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseInput } from "./parse-input";

describe("parseInput", () => {
  it("returns schema-transformed values and defaults, not the raw input", () => {
    const schema = z.object({
      name: z.string().trim(),
      active: z.boolean().default(true),
    });
    expect(
      parseInput(schema, { name: "  Salary  " }, "Invalid income input"),
    ).toEqual({ name: "Salary", active: true });
  });

  it.each([
    "Invalid income input",
    "Invalid tag input",
  ])("preserves the caller's error context: %s", (message) => {
    try {
      parseInput(z.object({ name: z.string().min(1) }), { name: "" }, message);
      throw new Error("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message,
        issues: [{ path: ["name"], code: "too_small" }],
      });
    }
  });
});

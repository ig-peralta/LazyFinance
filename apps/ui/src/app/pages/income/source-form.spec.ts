import { describe, expect, it } from "vitest";
import { incomeSource } from "../../../testing/rpc";
import { sourceFields, sourceInput } from "./source-form";

describe("income declaration form", () => {
  it.each([
    "weekly",
    "every_two_weeks",
    "monthly",
    "twice_monthly",
  ] as const)("round-trips %s with exact decimal amounts", (frequency) => {
    const fields = sourceFields(incomeSource);
    fields.frequency = frequency;
    fields.amount = "9007199254740,99";
    const parsed = sourceInput(fields);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.expectedAmount).toBe("9007199254740.99");
      expect(parsed.data.schedule?.frequency).toBe(frequency);
    }
  });

  it("keeps variable unknown distinct, omits irregular recurrence and validates day/date rules", () => {
    const fields = sourceFields(incomeSource);
    fields.amountKind = "variable";
    fields.amount = "";
    expect(sourceInput(fields).data?.expectedAmount).toBeNull();
    fields.regularity = "irregular";
    expect(sourceInput(fields).data?.schedule).toBeNull();
    fields.regularity = "regular";
    fields.frequency = "twice_monthly";
    fields.firstDay = "28";
    expect(sourceInput(fields).success).toBe(false);
    fields.firstDay = "15";
    fields.secondDay = "15";
    expect(sourceInput(fields).success).toBe(false);
    fields.frequency = "monthly";
    fields.end = "2025-12-31";
    expect(sourceInput(fields).success).toBe(false);
    fields.end = "";
    fields.amountKind = "fixed";
    expect(sourceInput(fields).success).toBe(false);
  });
});

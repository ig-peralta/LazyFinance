import { describe, expect, it } from "vitest";
import { formatClp, moneyCents, progressWidth } from "./currency";

describe("exact financial presentation", () => {
  it("preserves cents and large decimal strings without rounding through Number", () => {
    expect(formatClp("9007199254740.99")).toBe("$9.007.199.254.740,99");
    expect(formatClp("-15000.00")).toBe("-$15.000");
    expect(formatClp("0.01")).toBe("$0,01");
    expect(formatClp("unknown")).toBe("—");
    expect(moneyCents("100.10")).toBe(10010n);
    expect(progressWidth("-1.00", "100.00")).toBe(0);
    expect(progressWidth("150.00", "100.00")).toBe(100);
  });
});

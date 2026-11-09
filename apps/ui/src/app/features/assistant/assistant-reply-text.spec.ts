import { describe, expect, it } from "vitest";
import { assistantReplyText } from "./assistant-reply-text";

describe("references outside assistant prose", () => {
  it("hides model-generated single/grouped codes without disturbing amounts or Markdown", () => {
    expect(
      assistantReplyText(
        "Tu saldo es **$500.000** [F1].\n\n- Gasto: $10.000 [F2, F3]\n- Plan: $20.000 [F4][F5]",
      ),
    ).toBe("Tu saldo es **$500.000**.\n\n- Gasto: $10.000\n- Plan: $20.000");
    expect(assistantReplyText("En [noviembre] no hubo cambios.")).toBe(
      "En [noviembre] no hubo cambios.",
    );
  });

  it.each([
    "[",
    "[F",
    "[F1",
    "[F1]",
    "[F1, F",
    "[F1, F2]",
  ])("does not flash a fragmented citation %s while streaming", (fragment) => {
    expect(assistantReplyText(`Saldo consultado ${fragment}`, true)).toBe(
      "Saldo consultado",
    );
  });

  it("also hides incomplete codes in interrupted answers without altering ordinary bracket text", () => {
    expect(assistantReplyText("Saldo [F2")).toBe("Saldo");
    expect(assistantReplyText("Una lista [")).toBe("Una lista [");
  });
});

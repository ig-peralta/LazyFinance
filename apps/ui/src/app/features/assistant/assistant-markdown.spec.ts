import { describe, expect, it } from "vitest";
import { assistantMarkdown } from "./assistant-markdown";

describe("untrusted assistant formatting", () => {
  it("renders useful text formatting without fetching images or activating model links/HTML", () => {
    const html = assistantMarkdown(
      '**Dato** [F1]\n\n<img src="https://evil.test/pixel" onerror="alert(1)">\n\n![image](https://evil.test/image) [go](javascript:alert(1))\n\n<script>alert(1)</script>',
    );
    expect(html).toContain("<strong>Dato</strong>");
    expect(html).not.toMatch(/<(?:img|script|iframe|a\s)/i);
    expect(html).toContain("[F1]");
  });

  it("bounds formatting work to the server answer limit", () => {
    expect(assistantMarkdown("a".repeat(17000))).not.toContain(
      "a".repeat(16001),
    );
  });
});

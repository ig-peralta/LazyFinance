import { afterEach, describe, expect, it, vi } from "vitest";
import { bindAssistantShortcut } from "./assistant-shortcut";

describe("assistant shortcut binding", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("opens the existing instance without moving focus itself and detaches on teardown", () => {
    const open = vi.fn();
    const unbind = bindAssistantShortcut(document, open);
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const event = new KeyboardEvent("keydown", {
      key: "?",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
    expect(event.defaultPrevented).toBe(true);
    unbind();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", bubbles: true }),
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("ignores typing, IME, repeats, modifiers, consumed keys and modal overlays", () => {
    const open = vi.fn();
    const unbind = bindAssistantShortcut(document, open);
    for (const markup of [
      "<input>",
      "<textarea></textarea>",
      "<select></select>",
      '<div contenteditable="true"><span>edit</span></div>',
      '<div role="textbox"></div>',
    ]) {
      document.body.innerHTML = markup;
      document.body.firstElementChild?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "?", bubbles: true }),
      );
    }
    document.body.replaceChildren();
    for (const options of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { repeat: true },
      { isComposing: true },
      { key: "a" },
    ]) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "?", ...options }),
      );
    }
    const consumed = new KeyboardEvent("keydown", {
      key: "?",
      cancelable: true,
    });
    consumed.preventDefault();
    document.dispatchEvent(consumed);
    document.body.innerHTML = "<dialog open></dialog>";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    expect(open).not.toHaveBeenCalled();
    unbind();
  });
});

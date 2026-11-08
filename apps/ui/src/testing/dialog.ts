import { afterEach, beforeEach } from "vitest";

/** jsdom lacks native dialog methods; keyboard/modal behavior is browser-tested. */
export function useDialogStub() {
  let restore: () => void;
  beforeEach(() => {
    const prototype = Object.getPrototypeOf(document.createElement("dialog"));
    const original = ["showModal", "close"].map(
      (name) =>
        [name, Object.getOwnPropertyDescriptor(prototype, name)] as const,
    );
    Object.defineProperties(prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = true;
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = false;
        },
      },
    });
    restore = () => {
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(prototype, name, descriptor);
        else Reflect.deleteProperty(prototype, name);
      }
    };
  });
  afterEach(() => restore());
}

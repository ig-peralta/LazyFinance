/** Bind only within the authenticated host lifetime. The callback opens the existing workspace. */
export function bindAssistantShortcut(
  document: Document,
  open: () => void,
): () => void {
  const listener = (event: KeyboardEvent) => {
    // '?' is a discoverable, unmodified command outside editing; no browser chord is claimed.
    if (
      event.key !== "?" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat ||
      event.isComposing ||
      event.defaultPrevented
    )
      return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      )
    )
      return;
    if (
      document.querySelector(
        'dialog[open], [aria-modal="true"]:not([hidden]), [role="dialog"]:not([hidden]):not([aria-modal="false"]), details.workspace-appearance[open]',
      )
    )
      return;
    event.preventDefault();
    open();
  };
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}

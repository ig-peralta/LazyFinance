import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import { Icon } from "./icon";

/** Mount only while editing: native modal focus/inertness, no hidden live forms. */
@Component({
  selector: "editor-drawer",
  imports: [Icon],
  template: `
    <dialog #panel class="editor-drawer" [attr.aria-label]="title()" aria-modal="true"
      (cancel)="cancel($event)" (keydown)="containFocus($event)" (pointerdown)="backdropStart($event)" (click)="backdropEnd($event)">
      <header class="editor-drawer-header">
        <div><p class="eyebrow">{{ eyebrow() }}</p><h2>{{ title() }}</h2></div>
        <button class="icon-button" type="button" aria-label="Cerrar panel" autofocus (click)="dismissed.emit()"><app-icon name="close" /></button>
      </header>
      <div class="editor-drawer-body"><ng-content /></div>
    </dialog>
  `,
})
export class EditorDrawer {
  readonly title = input.required<string>();
  readonly eyebrow = input("A TU MEDIDA");
  readonly dismissed = output<void>();
  private readonly panel =
    viewChild.required<ElementRef<HTMLDialogElement>>("panel");
  private backdropPressed = false;
  private opener: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      const dialog = this.panel().nativeElement,
        active = dialog.ownerDocument.activeElement;
      this.opener = active instanceof HTMLElement ? active : null;
      dialog.showModal();
    });
    inject(DestroyRef).onDestroy(() => {
      const dialog = this.panel().nativeElement;
      if (dialog.open) dialog.close();
      // Angular can remove the focused subtree after native close restores it.
      // Restore after removal, but never steal focus from a new modal/workflow.
      queueMicrotask(() => {
        const document = dialog.ownerDocument;
        if (
          document.querySelector("dialog[open]") ||
          (document.activeElement !== document.body &&
            !dialog.contains(document.activeElement))
        )
          return;
        const target =
          this.opener?.isConnected && !this.opener.matches(":disabled")
            ? this.opener
            : document.querySelector<HTMLElement>("main[tabindex]");
        target?.focus({ preventScroll: true });
      });
    });
  }

  protected cancel(event: Event) {
    event.preventDefault();
    this.dismissed.emit();
  }

  protected containFocus(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const dialog = this.panel().nativeElement;
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden",
    );
    const first = stops[0],
      last = stops.at(-1),
      active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !dialog.contains(active))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  private outside(event: MouseEvent) {
    const dialog = this.panel().nativeElement,
      bounds = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    );
  }

  protected backdropStart(event: PointerEvent) {
    this.backdropPressed = this.outside(event);
  }

  protected backdropEnd(event: MouseEvent) {
    if (this.backdropPressed && this.outside(event)) this.dismissed.emit();
    this.backdropPressed = false;
  }
}

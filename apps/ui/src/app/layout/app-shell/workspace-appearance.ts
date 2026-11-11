import { Component, ElementRef, inject, viewChild } from "@angular/core";
import { Icon } from "../../shared/ui/icon";
import { WorkspacePreferences } from "./workspace-preferences";

@Component({
  selector: "workspace-appearance",
  imports: [Icon],
  host: {
    "(document:pointerdown)": "outside($event)",
    "(keydown.escape)": "dismiss($event)",
    "(focusout)": "leave($event)",
  },
  template: `
    <details #panel class="workspace-appearance">
      <summary #trigger><app-icon name="appearance" /> Apariencia</summary>
      <div class="appearance-options">
        <div class="panel-heading"><strong>Tu espacio, a tu medida</strong><button type="button" class="icon-button" aria-label="Cerrar apariencia" (click)="dismiss()"><app-icon name="close" /></button></div>
        <fieldset><legend>Tema</legend><div class="button-row">
          @for (choice of themes; track choice.value) {
            <button type="button" class="button small" [attr.aria-pressed]="preferences.value().theme === choice.value" (click)="preferences.update({ theme: choice.value })">{{ choice.label }}</button>
          }
        </div></fieldset>
        <fieldset><legend>Tamaño de texto</legend><div class="button-row">
          @for (choice of sizes; track choice.value) {
            <button type="button" class="button small" [attr.aria-pressed]="preferences.value().textSize === choice.value" (click)="preferences.update({ textSize: choice.value })">{{ choice.label }}</button>
          }
        </div></fieldset>
        <p class="field-hint">Solo se guarda la apariencia en este dispositivo.</p>
        @if (preferences.storageUnavailable()) { <p role="status">La apariencia se aplicó, pero no se pudo guardar en este dispositivo.</p> }
      </div>
    </details>`,
})
export class WorkspaceAppearance {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panel = viewChild<ElementRef<HTMLDetailsElement>>("panel");
  private readonly trigger = viewChild<ElementRef<HTMLElement>>("trigger");
  protected readonly preferences = inject(WorkspacePreferences);
  protected readonly themes = [
    { value: "system", label: "Sistema" },
    { value: "light", label: "Claro" },
    { value: "dark", label: "Oscuro" },
  ] as const;
  protected readonly sizes = [
    { value: "standard", label: "Normal" },
    { value: "large", label: "Grande" },
    { value: "largest", label: "Muy grande" },
  ] as const;

  protected dismiss(event?: Event) {
    const panel = this.panel()?.nativeElement;
    if (!panel?.open) return;
    panel.open = false;
    event?.preventDefault();
    event?.stopPropagation();
    this.trigger()?.nativeElement.focus();
  }

  protected outside(event: PointerEvent) {
    if (
      event.target instanceof Node &&
      !this.host.nativeElement.contains(event.target)
    ) {
      const panel = this.panel()?.nativeElement;
      if (panel) panel.open = false;
    }
  }

  protected leave(event: FocusEvent) {
    if (
      event.relatedTarget instanceof Node &&
      !this.host.nativeElement.contains(event.relatedTarget)
    ) {
      const panel = this.panel()?.nativeElement;
      if (panel) panel.open = false;
    }
  }
}

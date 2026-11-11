import { Component, inject } from "@angular/core";
import { WorkspacePreferences } from "./workspace-preferences";

@Component({
  selector: "workspace-appearance",
  template: `
    <details class="workspace-appearance">
      <summary>Apariencia</summary>
      <div class="appearance-options">
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
}

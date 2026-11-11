import { Component, effect, inject, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";

/** Deep links select history; ordinary navigation restores the existing session. */
@Component({
  selector: "assistant-entry",
  template: `<section><h1>Tu asistente financiero</h1><p>Continúa sin perder de vista tus finanzas.</p><button type="button" class="button" (click)="workspace.open()">Abrir asistente</button></section>`,
})
export class AssistantEntry {
  protected readonly workspace = inject(AssistantWorkspace);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  constructor() {
    reportWorkspaceReadiness(() => true);
    effect(() => {
      const query = this.query();
      if (!query) return;
      untracked(() => {
        if (query.has("conversacion"))
          this.workspace.selection.set(query.get("conversacion") ?? undefined);
        this.workspace.open();
      });
    });
  }
}

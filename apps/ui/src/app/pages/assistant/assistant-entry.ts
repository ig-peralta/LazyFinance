import { Component, effect, inject, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";

/** Deep links select history; ordinary navigation restores the existing session. */
@Component({
  selector: "assistant-entry",
  imports: [RouterLink],
  template: `<header class="page-header"><div><p class="eyebrow">UNA CONVERSACIÓN, MÁS CLARIDAD</p><h1>Tu asistente financiero</h1><p class="page-description">Consulta tus datos y revisa cada propuesta antes de aprobar cambios.</p></div></header><section class="panel"><h2 class="record-title">Tu conversación, a mano</h2><p class="record-meta">Minimiza el panel para seguir mirando tus finanzas sin perder el borrador. Puedes volver desde la barra superior o con la tecla ?.</p><div class="row-actions"><button type="button" class="button primary" (click)="workspace.open()">Abrir asistente</button><a class="button" routerLink="/dashboard">Ver mi resumen</a></div></section>`,
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

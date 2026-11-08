import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { IncomeSource } from "@lazyfinance/contracts";
import { formatClp } from "../../../../utils/currency";
import { AuthCredentials } from "../../../core/auth/auth-credentials";
import { reportWorkspaceReadiness } from "../../../core/rendering/workspace-preparation";
import { RpcClient } from "../../../core/rpc/rpc-client";
import { createScopedCommand } from "../../../core/rpc/scoped-command";
import { EditorDrawer } from "../../../shared/ui/editor-drawer";
import { Icon } from "../../../shared/ui/icon";
import { Expectations } from "./expectations/expectations";
import { SourceEditor } from "./source-editor/source-editor";
import { scheduleLabel } from "./source-form";

@Component({
  selector: "income-sources-page",
  imports: [RouterLink, Icon, SourceEditor, Expectations, EditorDrawer],
  templateUrl: "./sources.page.html",
})
export class SourcesPage {
  private readonly rpc = inject(RpcClient);
  protected readonly sources = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.income.sources.query(undefined, { signal: abortSignal }),
    defaultValue: [],
  });
  protected readonly command = createScopedCommand();
  protected readonly editing = signal<IncomeSource | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly planningId = signal<string | null>(null);
  protected readonly archiving = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly schedule = scheduleLabel;

  constructor() {
    reportWorkspaceReadiness(this.sources);
    const credentials = inject(AuthCredentials);
    const owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.closeEditor();
      this.planningId.set(null);
      this.archiving.set(null);
      this.message.set(null);
    });
  }

  protected fresh() {
    this.command.clear();
    this.editing.set(null);
    this.message.set(null);
    this.editorOpen.set(true);
  }

  protected edit(source: IncomeSource) {
    this.command.clear();
    this.editing.set(source);
    this.message.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor() {
    this.editorOpen.set(false);
    this.editing.set(null);
  }

  protected saved(source: IncomeSource) {
    this.closeEditor();
    this.message.set(
      "Fuente guardada. Los ingresos recibidos no se modificaron.",
    );
    this.planningId.set(source.regularity === "irregular" ? source.id : null);
    this.sources.reload();
  }

  protected archive() {
    const id = this.archiving();
    if (!id) return;
    this.message.set(null);
    void this.command.run(
      (scope, signal) =>
        scope.client.income.archiveSource.mutate({ id }, { signal }),
      () => {
        this.archiving.set(null);
        this.closeEditor();
        this.sources.reload();
      },
      "Fuente archivada. Los ingresos recibidos y el historial anterior se conservan.",
    );
  }
}

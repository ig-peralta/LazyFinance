import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatClp } from "../../../utils/currency";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { RpcClient } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { Icon } from "../../shared/ui/icon";
import { Expectations } from "./expectations";
import { SourceEditor } from "./source-editor";
import { scheduleLabel } from "./source-form";

@Component({
  selector: "income-sources-page",
  imports: [RouterLink, Icon, SourceEditor, Expectations],
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
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() =>
    this.sources.hasValue()
      ? (this.sources
          .value()
          .find((source) => source.id === this.selectedId()) ?? null)
      : null,
  );
  protected readonly archiving = signal<string | null>(null);
  protected readonly editorKey = signal(0);
  protected readonly message = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly schedule = scheduleLabel;

  constructor() {
    const credentials = inject(AuthCredentials);
    const owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.selectedId.set(null);
      this.archiving.set(null);
      this.message.set(null);
      this.editorKey.update((key) => key + 1);
    });
  }

  protected fresh() {
    this.selectedId.set(null);
    this.editorKey.update((key) => key + 1);
  }

  protected archive() {
    const id = this.archiving();
    if (!id) return;
    void this.command.run(
      (scope, signal) =>
        scope.client.income.archiveSource.mutate({ id }, { signal }),
      () => {
        this.archiving.set(null);
        this.fresh();
        this.sources.reload();
      },
      "Fuente archivada. Los cobros e historial anteriores se conservan.",
    );
  }
}

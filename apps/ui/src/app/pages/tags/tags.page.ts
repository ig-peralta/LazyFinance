import { Component, computed, effect, inject, signal } from "@angular/core";
import type { TagSummary } from "@lazyfinance/contracts";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { TagsData } from "../../features/tags/tags.data";
import { EditorDrawer } from "../../shared/ui/editor-drawer";
import { Icon } from "../../shared/ui/icon";
import { TagEditor } from "./tag-editor";

@Component({
  selector: "tags-page",
  imports: [Icon, EditorDrawer, TagEditor],
  providers: [TagsData],
  templateUrl: "./tags.page.html",
})
export class TagsPage {
  protected readonly data = inject(TagsData);
  protected readonly command = createScopedCommand();
  protected readonly editing = signal<TagSummary | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly archiving = signal<TagSummary | null>(null);
  protected readonly search = signal("");
  protected readonly items = computed(() =>
    (this.data.tags.hasValue() ? this.data.tags.value() : []).filter((tag) =>
      tag.name
        .toLocaleLowerCase("es-CL")
        .includes(this.search().toLocaleLowerCase("es-CL")),
    ),
  );

  constructor() {
    reportWorkspaceReadiness(this.data.tags);
    const credentials = inject(AuthCredentials);
    const owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.reset();
      this.message.set(null);
      this.archiving.set(null);
      this.search.set("");
    });
  }

  protected reset() {
    this.editing.set(null);
    this.editorOpen.set(false);
  }

  protected fresh() {
    this.editing.set(null);
    this.message.set(null);
    this.command.clear();
    this.editorOpen.set(true);
  }

  protected edit(tag: TagSummary) {
    this.command.clear();
    this.message.set(null);
    this.editing.set(tag);
    this.editorOpen.set(true);
  }

  protected saved(message: string) {
    this.message.set(message);
    this.reset();
    this.data.tags.reload();
  }

  protected archive() {
    const tag = this.archiving();
    if (!tag) return;
    this.message.set(null);
    void this.command.run(
      (scope, signal) =>
        scope.client.tags.archive.mutate({ id: tag.id }, { signal }),
      () => {
        this.archiving.set(null);
        if (this.editing()?.id === tag.id) this.reset();
        this.data.tags.reload();
      },
      "Etiqueta archivada. Los movimientos y objetivos anteriores mantienen su referencia.",
    );
  }
}

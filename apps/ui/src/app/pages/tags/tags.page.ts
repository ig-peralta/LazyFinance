import { Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TagCreateInputSchema, type TagSummary } from "@lazyfinance/contracts";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { TagsData } from "../../features/tags/tags.data";
import { Icon } from "../../shared/ui/icon";

@Component({
  selector: "tags-page",
  imports: [FormsModule, Icon],
  providers: [TagsData],
  templateUrl: "./tags.page.html",
})
export class TagsPage {
  protected readonly data = inject(TagsData);
  protected readonly command = createScopedCommand();
  protected readonly editing = signal<TagSummary | null>(null);
  protected readonly archiving = signal<TagSummary | null>(null);
  protected readonly search = signal("");
  protected readonly formError = signal<string | null>(null);
  protected name = "";
  protected color = "#78966a";
  protected noColor = false;
  protected readonly items = computed(() =>
    (this.data.tags.hasValue() ? this.data.tags.value() : []).filter((tag) =>
      tag.name
        .toLocaleLowerCase("es-CL")
        .includes(this.search().toLocaleLowerCase("es-CL")),
    ),
  );

  constructor() {
    const credentials = inject(AuthCredentials);
    const owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.reset();
      this.archiving.set(null);
      this.search.set("");
    });
  }

  protected reset() {
    this.editing.set(null);
    this.name = "";
    this.color = "#78966a";
    this.noColor = false;
    this.formError.set(null);
  }

  protected edit(tag: TagSummary) {
    this.command.clear();
    this.editing.set(tag);
    this.name = tag.name;
    this.color = tag.color ?? "#78966a";
    this.noColor = tag.color === null;
    this.formError.set(null);
  }

  protected save() {
    const parsed = TagCreateInputSchema.safeParse({
      name: this.name,
      color: this.noColor ? null : this.color,
    });
    if (!parsed.success) {
      this.formError.set(
        "Escribe un nombre de 1 a 80 caracteres y elige un color válido.",
      );
      return;
    }
    this.formError.set(null);
    const existing = this.editing();
    void this.command.run(
      (scope, signal) =>
        existing
          ? scope.client.tags.update.mutate(
              { id: existing.id, ...parsed.data },
              { signal },
            )
          : scope.client.tags.create.mutate(parsed.data, { signal }),
      () => {
        this.reset();
        this.data.tags.reload();
      },
      existing
        ? "Etiqueta actualizada. Su historial se conserva."
        : "Etiqueta creada. Ya puedes usarla en tus movimientos y objetivos.",
    );
  }

  protected archive() {
    const tag = this.archiving();
    if (!tag) return;
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

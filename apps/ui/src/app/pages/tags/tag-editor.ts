import { Component, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TagCreateInputSchema, type TagSummary } from "@lazyfinance/contracts";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { TagsData } from "../../features/tags/tags.data";

@Component({
  selector: "tag-editor",
  imports: [FormsModule],
  templateUrl: "./tag-editor.html",
})
export class TagEditor {
  private readonly catalog = inject(TagsData);
  readonly tag = input<TagSummary | null>(null);
  readonly saved = output<string>();
  readonly cancelled = output<void>();
  protected readonly command = createScopedCommand();
  protected readonly formError = signal<string | null>(null);
  protected readonly needsCheck = signal(false);
  protected readonly checked = signal(false);
  protected name = "";
  protected color = "#78966a";
  protected noColor = false;

  ngOnInit() {
    const tag = this.tag();
    this.name = tag?.name ?? "";
    this.color = tag?.color ?? "#78966a";
    this.noColor = !!tag && tag.color === null;
  }

  protected async checkCatalog() {
    await this.command.run(
      (scope, signal) => scope.client.tags.list.query(undefined, { signal }),
      (tags) => {
        this.catalog.tags.reload();
        this.needsCheck.set(false);
        this.checked.set(true);
        if (
          tags.some(
            (tag) => tag.name === this.name && tag.id !== this.tag()?.id,
          )
        ) {
          this.formError.set(
            "Ese nombre ya existe. Revisa el catálogo antes de crear otra etiqueta.",
          );
        }
      },
    );
  }

  protected async save() {
    if (this.needsCheck()) return;
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
    const existing = this.tag();
    if (
      this.catalog.tags.hasValue() &&
      this.catalog.tags
        .value()
        .some((tag) => tag.name === parsed.data.name && tag.id !== existing?.id)
    ) {
      this.formError.set(
        "Ese nombre ya existe. Elige otro nombre para esta etiqueta.",
      );
      return;
    }
    this.checked.set(false);
    const confirmed = await this.command.run(
      (scope, signal) =>
        existing
          ? scope.client.tags.update.mutate(
              { id: existing.id, ...parsed.data },
              { signal },
            )
          : scope.client.tags.create.mutate(parsed.data, { signal }),
      () =>
        this.saved.emit(
          existing
            ? "Etiqueta actualizada. Su historial se conserva."
            : "Etiqueta creada. Ya puedes usarla en tus movimientos y objetivos.",
        ),
    );
    if (!confirmed && this.command.error()?.startsWith("No pudimos confirmar"))
      this.needsCheck.set(true);
  }
}

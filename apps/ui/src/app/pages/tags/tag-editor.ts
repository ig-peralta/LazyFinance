import { Component, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TagCreateInputSchema, type TagSummary } from "@lazyfinance/contracts";
import { createScopedCommand } from "../../core/rpc/scoped-command";

@Component({
  selector: "tag-editor",
  imports: [FormsModule],
  templateUrl: "./tag-editor.html",
})
export class TagEditor {
  readonly tag = input<TagSummary | null>(null);
  readonly saved = output<string>();
  readonly cancelled = output<void>();
  protected readonly command = createScopedCommand();
  protected readonly formError = signal<string | null>(null);
  protected name = "";
  protected color = "#78966a";
  protected noColor = false;

  ngOnInit() {
    const tag = this.tag();
    this.name = tag?.name ?? "";
    this.color = tag?.color ?? "#78966a";
    this.noColor = !!tag && tag.color === null;
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
    const existing = this.tag();
    void this.command.run(
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
  }
}

import { Component, computed, inject, input } from "@angular/core";
import { ControlContainer, FormsModule, NgForm } from "@angular/forms";
import type { TagSummary } from "@lazyfinance/contracts";
import { TagsData } from "../../../features/tags/tags.data";
import type { ObjectiveFields } from "./objective-form";

@Component({
  selector: "objective-fields",
  imports: [FormsModule],
  providers: [TagsData],
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
  templateUrl: "./objective-fields.html",
})
export class ObjectiveFieldsView {
  readonly fields = input.required<ObjectiveFields>();
  readonly savings = input(false);
  readonly scheduleLocked = input(false);
  readonly error = input<string | null>(null);
  readonly retainedTags = input<TagSummary[]>([]);
  protected readonly tags = inject(TagsData).tags;
  protected readonly choices = computed(() => {
    const active = this.tags.hasValue() ? this.tags.value() : [],
      ids = new Set(active.map((tag) => tag.id));
    return [
      ...active.map((tag) => ({ ...tag, historical: false })),
      ...this.retainedTags()
        .filter((tag) => !ids.has(tag.id))
        .map((tag) => ({ ...tag, historical: true })),
    ];
  });

  protected toggle(id: string, checked: boolean) {
    const fields = this.fields();
    fields.tagIds = checked
      ? [...new Set([...fields.tagIds, id])]
      : fields.tagIds.filter((value) => value !== id);
  }
}

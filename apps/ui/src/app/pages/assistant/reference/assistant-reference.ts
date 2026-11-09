import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { AssistantSource } from "@lazyfinance/contracts";
import { Icon } from "../../../shared/ui/icon";
import { assistantReferenceView } from "./assistant-reference-view";

@Component({
  selector: "assistant-reference",
  imports: [RouterLink, Icon],
  templateUrl: "./assistant-reference.html",
  styleUrl: "./assistant-reference.css",
})
export class AssistantReference {
  readonly source = input.required<AssistantSource>();
  protected readonly view = computed(() =>
    assistantReferenceView(this.source()),
  );
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
}

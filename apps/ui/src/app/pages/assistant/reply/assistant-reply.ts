import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import type { AssistantTurn, FinancialAction } from "@lazyfinance/contracts";
import { AssistantMarkdownView } from "../../../features/assistant/assistant-markdown-view";
import { assistantReplyText } from "../../../features/assistant/assistant-reply-text";
import { Icon } from "../../../shared/ui/icon";
import { AssistantActionCard } from "../action/assistant-action-card";
import { AssistantReference } from "../reference/assistant-reference";

@Component({
  selector: "assistant-reply",
  imports: [
    Icon,
    AssistantMarkdownView,
    AssistantReference,
    AssistantActionCard,
  ],
  templateUrl: "./assistant-reply.html",
  styleUrl: "./assistant-reply.css",
})
export class AssistantReply {
  readonly turn = input.required<AssistantTurn>();
  readonly busy = input(false);
  readonly askAgain = output<string>();
  readonly actionChanged = output<FinancialAction>();
  private readonly lifetime = inject(DestroyRef);
  protected readonly copied = signal(false);
  protected readonly text = computed(() =>
    assistantReplyText(this.turn().text, this.turn().status === "pending"),
  );
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));

  protected async copy() {
    const turn = this.turn();
    try {
      await navigator.clipboard.writeText(assistantReplyText(turn.text));
      if (!this.lifetime.destroyed && this.turn().id === turn.id)
        this.copied.set(true);
    } catch {
      if (!this.lifetime.destroyed) this.copied.set(false);
    }
  }
}

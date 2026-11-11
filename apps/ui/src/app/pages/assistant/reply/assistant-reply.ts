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
import { santiagoDate } from "../../../../utils/date";
import { AssistantMarkdownView } from "../../../features/assistant/assistant-markdown-view";
import { assistantReplyText } from "../../../features/assistant/assistant-reply-text";
import { Icon } from "../../../shared/ui/icon";
import { AssistantActionCard } from "../action/assistant-action-card";
import { AssistantReference } from "../reference/assistant-reference";

const timeOptions = {
  timeZone: "America/Santiago",
  timeStyle: "short",
} as const;
const timeFormatter = new Intl.DateTimeFormat("es-CL", timeOptions);
const datedTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  ...timeOptions,
  dateStyle: "short",
});

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
  readonly canvas = input(false);
  readonly detailsPanel = input(false);
  readonly showResult = output<string>();
  readonly askAgain = output<string>();
  readonly actionChanged = output<FinancialAction>();
  private readonly lifetime = inject(DestroyRef);
  protected readonly copied = signal(false);
  protected readonly text = computed(() =>
    assistantReplyText(this.turn().text, this.turn().status === "pending"),
  );
  protected readonly time = (value: string) => {
    const date = new Date(value);
    return (
      santiagoDate(date) === santiagoDate() ? timeFormatter : datedTimeFormatter
    ).format(date);
  };

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

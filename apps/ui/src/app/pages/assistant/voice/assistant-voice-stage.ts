import { Component, computed, inject, input, output } from "@angular/core";
import type { AssistantTurn } from "@lazyfinance/contracts";
import { AssistantVoiceClient } from "../../../features/assistant/assistant-voice.client";
import type { VoiceProblem } from "../../../features/assistant/assistant-voice-problem";
import { Icon } from "../../../shared/ui/icon";

/** Presentation only; the persistent page owns capture and session lifetime. */
@Component({
  selector: "assistant-voice-stage",
  imports: [Icon],
  templateUrl: "./assistant-voice-stage.html",
  styleUrl: "./assistant-voice-stage.css",
})
export class AssistantVoiceStage {
  readonly turn = input<AssistantTurn>();
  readonly problem = input<VoiceProblem | null>(null);
  readonly ready = input(false);
  readonly busy = input(false);
  readonly checking = input(false);
  readonly needsCheck = input(false);
  readonly resume = output<void>();
  readonly text = output<void>();
  readonly checked = output<void>();
  readonly showResult = output<string>();
  protected readonly voice = inject(AssistantVoiceClient);
  protected readonly label = computed(() =>
    this.checking()
      ? "Finalizando…"
      : this.voice.state() === "off"
        ? "Micrófono apagado"
        : this.voice.state() === "connecting"
          ? "Conectando…"
          : this.voice.state() === "querying"
            ? "Consultando tus datos"
            : this.voice.state() === "responding"
              ? "Respondiendo"
              : this.voice.state() === "muted"
                ? "Micrófono silenciado"
                : "Te escucho",
  );
}

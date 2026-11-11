import { Component, computed, inject, input, output } from "@angular/core";
import type { AssistantTurn } from "@lazyfinance/contracts";
import { AssistantVoiceClient } from "../../../features/assistant/assistant-voice.client";

/** Presentation only; the persistent page owns capture and session lifetime. */
@Component({
  selector: "assistant-voice-stage",
  templateUrl: "./assistant-voice-stage.html",
  styleUrl: "./assistant-voice-stage.css",
})
export class AssistantVoiceStage {
  readonly turn = input<AssistantTurn>();
  readonly showResult = output<string>();
  protected readonly voice = inject(AssistantVoiceClient);
  protected readonly label = computed(() =>
    this.voice.state() === "off"
      ? "Sesión de voz finalizada"
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

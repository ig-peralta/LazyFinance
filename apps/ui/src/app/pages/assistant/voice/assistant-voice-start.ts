import { Component, input, output } from "@angular/core";
import { Icon } from "../../../shared/ui/icon";

@Component({
  selector: "assistant-voice-start",
  imports: [Icon],
  templateUrl: "./assistant-voice-start.html",
  styleUrl: "./assistant-voice-start.css",
})
export class AssistantVoiceStart {
  readonly ready = input(false);
  readonly started = output<void>();
  readonly cancelled = output<void>();
}

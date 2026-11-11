import {
  afterRenderEffect,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from "@angular/core";
import type { AssistantConsentState } from "@lazyfinance/contracts";
import { Icon } from "../../../shared/ui/icon";

@Component({
  selector: "assistant-consent-screen",
  imports: [Icon],
  templateUrl: "./assistant-consent-screen.html",
  styleUrl: "./assistant-consent-screen.css",
})
export class AssistantConsentScreen {
  private readonly heading = viewChild<ElementRef<HTMLElement>>("heading");
  readonly state = input<AssistantConsentState>();
  readonly loading = input(false);
  readonly pending = input(false);
  readonly failed = input(false);
  readonly needsCheck = input(false);
  readonly canDecide = input(false);
  readonly accepted = output<void>();
  readonly refused = output<void>();
  readonly checked = output<void>();
  readonly history = output<void>();

  constructor() {
    afterRenderEffect(() => {
      const heading = this.heading()?.nativeElement;
      if (heading && !heading.closest("[hidden], [inert]")) heading.focus();
    });
  }
}

import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { Icon } from "../../shared/ui/icon";
import { OnboardingData } from "./onboarding.data";

@Component({
  selector: "onboarding-hint",
  imports: [RouterLink, Icon],
  template: `@if (data.status() === 'active') { <aside class="setup-hint"><span class="record-icon"><app-icon name="spark" /></span><div><strong>Haz de este espacio algo tuyo.</strong><p>Configura solo lo que te sirva. Puedes continuar o saltarlo sin recordatorios.</p></div><a class="button small soft" routerLink="/comenzar">Continuar configuración <app-icon name="arrow" /></a><button class="icon-button" type="button" aria-label="Omitir configuración inicial" [disabled]="command.pending()" (click)="skip()"><app-icon name="close" /></button></aside> } @if (command.error()) { <p class="notice danger" role="alert">{{ command.error() }}</p> }`,
})
export class OnboardingHint {
  protected readonly data = inject(OnboardingData);
  protected readonly command = createScopedCommand();

  protected skip() {
    void this.command.run(
      (scope, signal) =>
        scope.client.onboarding.finish.mutate(
          { status: "skipped" },
          { signal },
        ),
      (state) => this.data.state.set(state),
    );
  }
}

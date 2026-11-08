import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Icon } from "../../shared/ui/icon";
import { OnboardingPreferences } from "./onboarding-preferences";

@Component({
  selector: "onboarding-hint",
  imports: [RouterLink, Icon],
  template: `@if (preferences.status() === 'active') { <aside class="setup-hint"><span class="record-icon"><app-icon name="spark" /></span><div><strong>Haz de este espacio algo tuyo.</strong><p>Fuentes, etiquetas, límites y metas. Configura solo lo que te sirva.</p></div><a class="button small soft" routerLink="/comenzar">Primeros pasos <app-icon name="arrow" /></a></aside> }`,
})
export class OnboardingHint {
  protected readonly preferences = inject(OnboardingPreferences);
}

import { Component, computed, effect, input, signal } from "@angular/core";
import { clientLogo } from "./client-branding";

@Component({
  selector: "mcp-client-identity",
  template: `
    <div class="identity">
      <span class="logo" aria-hidden="true"><span>App</span>
        @if (logo(); as source) {
          @if (!failed()) {
            <img [src]="source" alt="" width="48" height="48" referrerpolicy="no-referrer"
              [class.loaded]="loaded()" (load)="loaded.set(true)" (error)="failed.set(true)" />
          }
        }
      </span>
      <div class="summary"><h2 class="record-title">{{ name() }}</h2>
        <p class="field-hint">Identidad no verificada · nombre declarado; imagen ilustrativa, sin recomendación.</p>
      </div>
    </div>
    <dl><dt>Identificador de la aplicación</dt><dd>{{ clientId() }}</dd>
      <dt>Destino de regreso (callback)</dt>
      <dd>{{ redirectUri() || 'No registrado para este acceso anterior.' }}</dd>
    </dl>
  `,
  styles: `
    :host { display:block; min-width:0; overflow-wrap:anywhere; }
    .identity { display:flex; align-items:flex-start; gap:1rem; }
    .summary { min-width:0; }
    .logo { position:relative; display:grid; place-items:center; width:3rem; height:3rem;
      flex:0 0 3rem; border:1px solid currentColor; border-radius:.75rem; overflow:hidden; font-size:.75rem; }
    img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0; }
    img.loaded { opacity:1; }
    dl { margin-block:1rem; font-size:.875rem; }
    dt { font-weight:600; margin-top:.75rem; }
    dd { margin: .25rem 0 0; overflow-wrap:anywhere; }
  `,
})
export class McpClientIdentity {
  readonly clientId = input.required<string>();
  readonly name = input.required<string>();
  readonly redirectUri = input<string | null>(null);
  protected readonly logo = computed(() =>
    clientLogo(this.clientId(), this.redirectUri()),
  );
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    effect((cleanup) => {
      this.clientId();
      this.redirectUri();
      this.loaded.set(false);
      this.failed.set(false);
      const timeout = setTimeout(() => {
        if (!this.loaded()) this.failed.set(true);
      }, 2000);
      cleanup(() => clearTimeout(timeout));
    });
  }
}

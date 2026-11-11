import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  type AccountListItem,
  SetAccountAliasSchema,
} from "@lazyfinance/contracts";
import { RpcClient } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";

@Component({
  selector: "account-alias-editor",
  imports: [FormsModule],
  template: `
    <p class="record-meta">Este nombre es solo para ti. No cambia la identidad bancaria, el saldo ni los movimientos y se conserva al sincronizar.</p>
    <form (ngSubmit)="save(false)">
      <label class="field"><span>Nombre personal</span><input name="alias" [(ngModel)]="name" maxlength="80" autocomplete="off" [disabled]="command.pending() || uncertain()" aria-describedby="alias-help" /></label>
      <p id="alias-help" class="field-hint">De 1 a 80 caracteres. Para volver al nombre predeterminado, usa Quitar nombre personal.</p>
      @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      @if (command.error()) { <p class="notice danger" role="alert">{{ command.error() }}</p> }
      @if (uncertain()) {
        <p class="notice warning">El cambio puede haberse guardado. Consulta las cuentas antes de volver a editar; no repetimos el cambio.</p>
        <div class="form-actions"><button class="button" type="button" (click)="reconcile.emit()">Cerrar y consultar cuentas guardadas</button></div>
      } @else {
        <div class="form-actions">
          <button class="button primary" type="submit" [disabled]="command.pending()">{{ command.pending() ? 'Guardando…' : 'Guardar nombre' }}</button>
          <button class="button" type="button" [disabled]="command.pending() || !account().alias" (click)="save(true)">Quitar nombre personal</button>
        </div>
      }
    </form>
  `,
})
export class AccountAliasEditor {
  readonly account = input.required<AccountListItem>();
  readonly saved = output<void>();
  readonly reconcile = output<void>();
  private readonly rpc = inject(RpcClient);
  private readonly lifetime = inject(DestroyRef);
  protected readonly command = createScopedCommand(() => this.account().id);
  protected readonly uncertain = signal(false);
  protected readonly error = signal<string | null>(null);
  protected name = "";

  constructor() {
    effect(() => {
      this.rpc.authenticatedScope();
      this.name = this.account().alias ?? "";
      this.uncertain.set(false);
      this.error.set(null);
    });
  }

  protected async save(clear: boolean) {
    const scope = this.rpc.authenticatedScope(),
      id = this.account().id;
    if (!scope || this.uncertain() || this.command.pending()) return;
    const parsed = SetAccountAliasSchema.safeParse({
      id: this.account().id,
      alias: clear ? null : this.name,
    });
    if (!parsed.success) {
      this.error.set(
        "Escribe un nombre de 1 a 80 caracteres, sin saltos de línea ni caracteres de control.",
      );
      return;
    }
    this.error.set(null);
    const confirmed = await this.command.run(
      (scope, signal) =>
        scope.client.accounts.setAlias.mutate(parsed.data, { signal }),
      () => this.saved.emit(),
    );
    if (
      !confirmed &&
      !this.lifetime.destroyed &&
      scope === this.rpc.authenticatedScope() &&
      id === this.account().id &&
      !scope.signal.aborted
    )
      this.uncertain.set(true);
  }
}

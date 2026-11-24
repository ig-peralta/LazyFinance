import { Component, inject, input } from "@angular/core";
import { Icon } from "../../shared/ui/icon";
import { ManualBankSync } from "./manual-bank-sync";

@Component({
  selector: "bank-sync-button",
  imports: [Icon],
  template: `
    <button class="button" type="button" [disabled]="disabled() || sync.busy()" (click)="sync.start(accountId())">
      <app-icon name="refresh" /> {{ sync.busy() ? 'Sincronizando…' : accountId() ? 'Sincronizar banco' : 'Sincronizar bancos' }}
    </button>
  `,
})
export class BankSyncButton {
  readonly accountId = input<string>();
  readonly disabled = input(false);
  protected readonly sync = inject(ManualBankSync);
}

import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  type BankSyncEntry,
  type BankSyncResult,
  ManualBankSync,
} from "./manual-bank-sync";

const time = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "medium",
  timeStyle: "short",
});

@Component({
  selector: "bank-sync-feedback",
  imports: [RouterLink],
  styles: [":host { display: contents; }"],
  template: `
    @if (sync.running()) {
      <p class="notice" role="status">Sincronizando datos disponibles. Puedes seguir usando la app.</p>
    } @else if (sync.error()) {
      <div class="notice warning" role="status">No pudimos consultar tus conexiones. No se inició ninguna importación. <button type="button" class="text-link" (click)="sync.dismiss()">Cerrar aviso</button></div>
    } @else if (sync.report(); as report) {
      <div class="notice" role="status">
        @if (report.results.length) {
          <details>
            <summary><strong>{{ summary(report.results) }}</strong></summary>
            <ul>
              @for (entry of report.results; track entry.connectionId) {
                <li>{{ entry.name }}: {{ message(entry.result) }}</li>
              }
            </ul>
            <p>Solo importamos datos que el proveedor ya tiene disponibles. Revisa la fecha de origen en tus saldos.</p>
          </details>
        } @else {
          <p>{{ report.accountId ? 'No identificamos una conexión para este movimiento.' : 'No hay bancos conectados para sincronizar.' }}</p>
        }
        <div class="button-row"><a class="text-link" routerLink="/conexiones-bancarias">Ver conexiones bancarias</a><button type="button" class="text-link" (click)="sync.dismiss()">Cerrar aviso</button></div>
      </div>
    }
  `,
})
export class BankSyncFeedback {
  protected readonly sync = inject(ManualBankSync);

  protected summary(results: BankSyncEntry[]) {
    const imported = results.filter(
      ({ result }) => result.status === "complete",
    ).length;
    const review = results.filter(
      ({ result }) => result.status === "needs_review",
    ).length;
    const skipped = results.length - imported - review;
    return [
      imported &&
        `${imported} ${imported === 1 ? "banco sincronizado" : "bancos sincronizados"}`,
      review &&
        `${review} ${review === 1 ? "importación con revisión pendiente" : "importaciones con revisión pendiente"}`,
      skipped && `${skipped} sin importación confirmada`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  protected message(result: BankSyncResult) {
    switch (result.status) {
      case "complete":
        return "Importación completada.";
      case "needs_review":
        return "Importación completada con movimientos por revisar.";
      case "in_progress":
        return "Ya hay una sincronización en curso.";
      case "retry_later":
        return `Disponible después de ${time.format(new Date(result.retryAfter))} · Santiago.`;
      case "deferred":
        return "La conexión no permite importar por ahora.";
      case "selection":
        return "Elige qué cuentas seguir antes de importar.";
      case "access":
        return "Revincula el banco para recuperar el acceso.";
      case "disconnected":
        return "Conexión desconectada. Se conservan los datos guardados.";
      case "configuration":
        return "Proveedor no disponible para esta conexión.";
      case "status_unavailable":
        return "No pudimos consultar el estado guardado.";
      case "unconfirmed":
        return "No pudimos confirmar el resultado. No se repitió la solicitud.";
      case "superseded":
        return "El intento o la conexión cambió. No se confirmó una importación.";
      case "failed":
        if (result.reason === "expired" || result.reason === "revoked")
          return "No se completó la importación. Revincula el banco.";
        if (result.reason === "account_unavailable")
          return "Una cuenta no está disponible. Revisa la selección.";
        return result.retryAfter
          ? `No se completó la importación. Disponible después de ${time.format(new Date(result.retryAfter))} · Santiago.`
          : "No se completó la importación. Seguimos mostrando los datos guardados.";
    }
  }
}

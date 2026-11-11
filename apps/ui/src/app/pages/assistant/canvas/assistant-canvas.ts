import { Component, computed, input, output, signal } from "@angular/core";
import type { AssistantTurn, FinancialAction } from "@lazyfinance/contracts";
import { AssistantActionCard } from "../action/assistant-action-card";
import { AssistantReference } from "../reference/assistant-reference";

/** Displays server observations only. Model-authored HTML/amounts never become widgets. */
@Component({
  selector: "assistant-canvas",
  imports: [AssistantReference, AssistantActionCard],
  template: `
    <section class="result-canvas" aria-label="Consultas de la respuesta">
      @if (results().length > 1) { <label class="result-selector"><span>Respuesta de la conversación</span><select [value]="active()?.id ?? ''" (change)="choose($event)">@for (turn of results(); track turn.id) { <option [value]="turn.id" [selected]="turn.id === active()?.id">{{ turn.voice?.question ?? turn.question }}</option> }</select></label> }
      @if (active(); as turn) {
        <p class="result-question">{{ turn.voice?.question ?? turn.question }}</p>
        @if (turn.status !== 'complete') { <p class="notice warning" role="status">{{ turn.status === 'pending' ? 'Consultando. Las propuestas solo se pueden aprobar cuando termine la respuesta.' : 'Respuesta incompleta. Las consultas adjuntas no confirman sus afirmaciones.' }}</p> }
        @if (showActions()) { @for (action of turn.actions; track action.id) { <assistant-action-card [action]="action" [confirmedTurn]="turn.status === 'complete'" [busy]="busy()" (changed)="actionChanged.emit($event)" /> } }
        @if (turn.sources.length > 1) {
          <nav class="result-tabs" aria-label="Consultas mostradas">@for (source of turn.sources; track source.id) { <button type="button" [attr.aria-pressed]="source.id === sourceId()" (click)="sourceSelection.set({ turn: turn.id, source: source.id })">{{ source.title }}</button> }</nav>
        }
        @for (source of turn.sources; track source.id) { @if (source.id === sourceId()) { <assistant-reference [source]="source" [expanded]="true" /> } }
      } @else {
        <p>No hay una consulta seleccionada.</p>
      }
    </section>
  `,
  styleUrl: "./assistant-canvas.css",
})
export class AssistantCanvas {
  readonly turns = input.required<AssistantTurn[]>();
  readonly busy = input(false);
  readonly showActions = input(false);
  readonly selection = input<string>();
  readonly actionChanged = output<FinancialAction>();
  readonly selected = output<string>();
  protected readonly sourceSelection = signal<
    { turn: string; source: string } | undefined
  >(undefined);
  protected readonly results = computed(() =>
    this.turns().filter(
      (turn) =>
        turn.sources.length || (this.showActions() && turn.actions.length),
    ),
  );
  protected readonly active = computed(() => {
    const selected = this.selection();
    return (
      this.results().find((turn) => turn.id === selected) ??
      this.results().at(-1)
    );
  });
  protected readonly sourceId = computed(() => {
    const turn = this.active(),
      selected = this.sourceSelection();
    return turn?.id === selected?.turn &&
      turn?.sources.some((source) => source.id === selected?.source)
      ? selected?.source
      : turn?.sources.at(-1)?.id;
  });

  protected choose(event: Event) {
    if (event.target instanceof HTMLSelectElement)
      this.selected.emit(event.target.value);
  }
}

import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import type {
  AssistantTurn,
  AssistantVoicePresentationEvent,
  FinancialAction,
} from "@lazyfinance/contracts";
import { latestAssistantAction } from "../../../features/assistant/assistant-action-state";
import { actionLabels } from "../action/action-presentation";
import { AssistantActionCard } from "../action/assistant-action-card";
import { AssistantReference } from "../reference/assistant-reference";

/** Displays server observations only. Model-authored HTML/amounts never become widgets. */
@Component({
  selector: "assistant-canvas",
  imports: [AssistantReference, AssistantActionCard],
  template: `
    <section class="result-canvas" aria-label="Consultas de la respuesta">
      @if (showActions() && proposals().length) {
        <section class="conversation-proposals" aria-labelledby="conversation-proposals-title">
          <h4 id="conversation-proposals-title">Revisar solicitud</h4>
          @if (proposals().length > 1) { <details class="proposal-list"><summary>Solicitudes de esta conversación · {{ proposals().length }}</summary><nav class="result-tabs" aria-label="Solicitudes de cambio">@for (proposal of proposals(); track proposal.action.id; let index = $index) { <button type="button" [attr.aria-pressed]="proposal.action.id === proposalId()" (click)="proposalId.set(proposal.action.id)">{{ index + 1 }} · {{ proposal.name }}<small>Versión {{ proposal.action.version }} · {{ statuses[proposal.action.status] }}</small></button> }</nav></details> }
          @if (proposal(); as current) {
            <p class="result-question">Una solicitud a la vez. Puedes aceptarla o corregirla por voz o con Editar. Versión {{ current.action.version }}.</p>
            <assistant-action-card [action]="current.action" [approvableTurn]="current.approvable" [interruptedVoiceTurn]="current.interruptedVoice" [busy]="busy()" (changed)="actionChanged.emit($event)" />
          }
        </section>
      }
      @if (results().length > 1) { <label class="result-selector"><span>{{ showQuestions() ? 'Respuesta de la conversación' : 'Consulta de voz' }}</span><select [value]="active()?.id ?? ''" (change)="choose($event)">@for (turn of results(); track turn.id; let index = $index) { <option [value]="turn.id" [selected]="turn.id === active()?.id">{{ showQuestions() ? (turn.voice?.question ?? turn.question) : 'Consulta de voz ' + (index + 1) }}</option> }</select></label> }
      @if (active(); as turn) {
        @if (showQuestions()) { <p class="result-question">{{ turn.voice?.question ?? turn.question }}</p> }
        @if (turn.status !== 'complete') { <p class="notice warning" role="status">{{ turn.status === 'pending' ? 'Consultando. Las propuestas solo se pueden aprobar cuando termine la respuesta.' : 'Respuesta incompleta. Las consultas adjuntas no confirman sus afirmaciones.' }}</p> }
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
  readonly showQuestions = input(true);
  readonly voiceMode = input(false);
  readonly selection = input<string>();
  readonly presentation = input<AssistantVoicePresentationEvent | null>(null);
  readonly actionChanged = output<FinancialAction>();
  readonly selected = output<string>();
  protected readonly labels = actionLabels;
  protected readonly statuses = {
    proposed: "Pendiente",
    stale: "Revisar",
    expired: "Vencida",
    applied: "Confirmada",
    cancelled: "Cancelada",
  };
  protected readonly proposalId = signal<string | undefined>(undefined);
  private knownProposals = new Set<string>();
  protected readonly proposals = computed(() => {
    const turns = this.turns();
    const turnById = new Map(turns.map((turn) => [turn.id, turn]));
    const actions = new Map<string, FinancialAction>();
    for (const turn of turns)
      for (const action of turn.actions) {
        const previous = actions.get(action.id);
        actions.set(
          action.id,
          previous ? latestAssistantAction(previous, action) : action,
        );
      }
    return [...actions.values()].map((action) => {
      const turn = action.turnId ? turnById.get(action.turnId) : undefined;
      const interruptedVoice =
        this.voiceMode() && turn?.status === "interrupted";
      return {
        action,
        approvable: turn?.status === "complete" || interruptedVoice,
        interruptedVoice,
        name:
          action.request.kind === "create_budget"
            ? action.request.budget.name
            : action.request.kind === "create_savings_goal"
              ? action.request.goal.name
              : action.request.kind === "create_tag"
                ? action.request.tag.name
                : this.labels[action.request.kind].title,
      };
    });
  });
  protected readonly proposal = computed(() =>
    this.proposals().find((value) => value.action.id === this.proposalId()),
  );
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

  constructor() {
    effect(() => {
      const request = this.presentation();
      if (!request) return;
      const presentation = request.presentation;
      untracked(() => {
        const turn = this.turns().find((value) => value.id === request.turnId);
        if (!turn) return;
        if (presentation.kind === "source") {
          if (
            turn.sources.some((source) => source.id === presentation.sourceId)
          )
            this.sourceSelection.set({
              turn: turn.id,
              source: presentation.sourceId,
            });
        } else if (
          turn.actions.some((action) => action.id === presentation.actionId)
        ) {
          this.proposalId.set(presentation.actionId);
        }
      });
    });
    effect(() => {
      const proposals = this.proposals();
      const current = proposals.find(
        (value) => value.action.id === this.proposalId(),
      );
      const next = proposals.find(
        (value) =>
          !this.knownProposals.has(value.action.id) &&
          value.action.status === "proposed",
      );
      this.knownProposals = new Set(proposals.map((value) => value.action.id));
      if (
        !current ||
        (next &&
          ["applied", "cancelled", "expired"].includes(current.action.status))
      )
        this.proposalId.set(
          (
            next ??
            proposals.find((value) =>
              ["proposed", "stale"].includes(value.action.status),
            ) ??
            proposals.at(-1)
          )?.action.id,
        );
    });
  }

  protected choose(event: Event) {
    if (event.target instanceof HTMLSelectElement)
      this.selected.emit(event.target.value);
  }
}

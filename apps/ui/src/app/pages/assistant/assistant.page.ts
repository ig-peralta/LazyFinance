import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { Router } from "@angular/router";
import {
  ASSISTANT_MAX_INPUT,
  type AssistantConsentDecision,
  type AssistantConversation,
  type AssistantEvent,
  type AssistantTurn,
  type FinancialAction,
} from "@lazyfinance/contracts";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { latestAssistantAction } from "../../features/assistant/assistant-action-state";
import { AssistantConsentData } from "../../features/assistant/assistant-consent.data";
import { AssistantStreamClient } from "../../features/assistant/assistant-stream.client";
import { AssistantVoiceClient } from "../../features/assistant/assistant-voice.client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { Icon } from "../../shared/ui/icon";
import { AssistantCanvas } from "./canvas/assistant-canvas";
import { AssistantConsentScreen } from "./consent/assistant-consent-screen";
import { AssistantReply } from "./reply/assistant-reply";
import { AssistantVoiceStage } from "./voice/assistant-voice-stage";
import { AssistantVoiceStart } from "./voice/assistant-voice-start";
import { AssistantWelcome } from "./welcome/assistant-welcome";

interface LiveTurn {
  scope: RpcScope;
  conversationId: string;
  turn: AssistantTurn;
  pending: boolean;
  controller: AbortController;
  status: string;
  error: string | null;
  nativeVoice?: boolean;
}

interface RetainedHistory {
  scope: RpcScope;
  conversationId: string;
  turns: AssistantTurn[];
}

@Component({
  selector: "assistant-page",
  imports: [
    Icon,
    AssistantReply,
    AssistantWelcome,
    AssistantConsentScreen,
    AssistantCanvas,
    AssistantVoiceStage,
    AssistantVoiceStart,
  ],
  templateUrl: "./assistant.page.html",
  styleUrl: "./assistant.page.css",
  host: { "(document:pointerdown)": "dismissOptions($event)" },
  providers: [AssistantVoiceClient, AssistantConsentData],
})
export class AssistantPage {
  readonly returnFocus = input<HTMLElement>();
  private voiceStartup: AbortController | undefined;
  protected readonly voice = inject(AssistantVoiceClient);
  protected readonly consent = inject(AssistantConsentData);
  protected readonly voiceDisclosure = signal(false);
  protected readonly voiceFallback = signal("");
  private readonly rpc = inject(RpcClient);
  private readonly credentials = inject(AuthCredentials);
  private readonly stream = inject(AssistantStreamClient);
  protected readonly workspace = inject(AssistantWorkspace);
  private readonly lifetime = new AbortController();
  private readonly liveState = signal<LiveTurn | null>(null);
  private readonly retainedHistory = signal<RetainedHistory | null>(null);
  private readonly sending = signal<{ scope: RpcScope } | null>(null);
  private readonly composer =
    viewChild<ElementRef<HTMLTextAreaElement>>("composer");
  private readonly messages = viewChild<ElementRef<HTMLElement>>("messages");
  private readonly historyClose =
    viewChild<ElementRef<HTMLButtonElement>>("historyClose");
  private readonly panel = viewChild<ElementRef<HTMLElement>>("panel");
  private readonly resultPanel =
    viewChild<ElementRef<HTMLElement>>("resultPanel");
  private readonly optionsMenu =
    viewChild<ElementRef<HTMLDetailsElement>>("optionsMenu");
  private resultOpener: HTMLElement | null = null;
  private focusResult = false;
  private restoreResultFocus = false;
  protected readonly follow = signal(true);
  protected readonly draft = signal("");
  protected readonly historyOnly = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly optionsOpen = signal(false);
  protected readonly canvasOpen = signal(false);
  protected readonly resultSelection = signal<string | undefined>(undefined);
  private readonly consentReview = signal(false);
  protected readonly processingAccepted = computed(
    () => !this.consentReview() && this.consent.allowed(),
  );
  protected readonly consentRequired = computed(
    () =>
      this.consent.state()?.required ??
      (this.configuration.hasValue() &&
        this.configuration.value().enabled &&
        !this.configuration.value().demonstration),
  );
  protected readonly showConsent = computed(
    () =>
      this.consentRequired() &&
      (this.consentReview() ||
        this.consent.state()?.decision !== "accepted" ||
        this.consent.readError() ||
        this.consent.needsCheck()) &&
      !this.historyOnly(),
  );
  protected readonly confirmDelete = signal(false);
  protected readonly maxInput = ASSISTANT_MAX_INPUT;
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  protected readonly greeting = computed(
    () => this.credentials.current()?.principal.name?.split(" ")[0] || "",
  );
  protected readonly id = computed(() => {
    const id = this.workspace.selection();
    return id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
      ? id
      : undefined;
  });
  protected readonly invalidId = computed(
    () => !!this.workspace.selection() && !this.id(),
  );
  private readonly revision = signal(0);
  private readonly commandOwner = computed(() => ({
    id: this.id(),
    revision: this.revision(),
  }));
  protected readonly command = createScopedCommand(() => this.commandOwner());
  protected readonly configuration = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.assistant.configuration.query(undefined, {
        signal: abortSignal,
      }),
  });
  protected readonly voiceConfiguration = resource({
    params: () => this.credentials.current(),
    loader: ({ params: owner, abortSignal }) =>
      this.voice.configuration(owner, abortSignal),
  });
  protected readonly conversations = resource({
    params: () =>
      this.configuration.hasValue() ? this.rpc.authenticatedScope() : undefined,
    loader: ({ params: scope, abortSignal }) =>
      scope.client.assistant.conversations.query(undefined, {
        signal: abortSignal,
      }),
    defaultValue: [],
  });
  protected readonly history = computed(() =>
    this.conversations.hasValue() ? this.conversations.value() : [],
  );
  protected readonly conversation = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id();
      return scope && id && this.configuration.hasValue()
        ? { scope, id }
        : undefined;
    },
    loader: ({ params, abortSignal }) =>
      params.scope.client.assistant.conversation.query(
        { id: params.id },
        { signal: abortSignal },
      ),
  });
  protected readonly live = computed(() => {
    const value = this.liveState();
    return value &&
      value.scope === this.rpc.authenticatedScope() &&
      value.conversationId === this.id()
      ? value
      : null;
  });
  protected readonly turns = computed(() => {
    const history = this.retainedHistory();
    const saved =
      history &&
      history.scope === this.rpc.authenticatedScope() &&
      history.conversationId === this.id()
        ? history.turns
        : [];
    const live = this.live();
    return live
      ? [...saved.filter((turn) => turn.id !== live.turn.id), live.turn]
      : saved;
  });
  protected readonly proposalTurn = computed(() =>
    this.turns()
      .filter((turn) => turn.actions.length > 0)
      .at(-1),
  );
  protected readonly proposalCount = computed(
    () =>
      new Set(
        this.turns().flatMap((turn) => turn.actions.map((action) => action.id)),
      ).size,
  );
  protected readonly busy = computed(
    () =>
      this.command.pending() ||
      !!this.live()?.pending ||
      this.sending()?.scope === this.rpc.authenticatedScope(),
  );
  protected readonly awaitingConfirmation = computed(
    () =>
      !this.live()?.pending &&
      this.turns().some((turn) => turn.status === "pending"),
  );
  protected readonly canSend = computed(
    () =>
      !this.busy() &&
      this.voice.state() === "off" &&
      !this.voiceDisclosure() &&
      !this.historyOnly() &&
      !this.invalidId() &&
      this.configuration.hasValue() &&
      this.configuration.value().enabled &&
      (!this.consentRequired() || this.processingAccepted()) &&
      !this.conversation.isLoading() &&
      !this.conversation.error() &&
      !this.turns().some((turn) => turn.status === "pending") &&
      this.turns().length < 24 &&
      this.draft().trim().length > 0 &&
      this.draft().trim().length <= this.maxInput,
  );
  protected readonly canStartVoice = computed(
    () =>
      !!this.credentials.current() &&
      this.voice.supported &&
      this.voice.state() === "off" &&
      !this.busy() &&
      !this.historyOnly() &&
      !this.invalidId() &&
      this.processingAccepted() &&
      !this.conversation.isLoading() &&
      !this.conversation.error() &&
      !this.awaitingConfirmation() &&
      this.turns().length < 24 &&
      this.configuration.hasValue() &&
      this.configuration.value().enabled &&
      !this.configuration.value().demonstration &&
      this.voiceConfiguration.hasValue() &&
      this.voiceConfiguration.value().enabled,
  );

  constructor() {
    effect(() => {
      const state = this.voice.state(),
        live = this.liveState();
      if (state === "off" && live?.nativeVoice && live.pending) {
        live.controller.abort();
        this.liveState.set({
          ...live,
          pending: false,
          error:
            "La voz terminó. Consulta el historial para confirmar lo que alcanzó a guardarse; no se reenviará la pregunta.",
        });
        untracked(() => this.conversation.reload());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.endVoice(true);
      this.lifetime.abort();
      this.liveState()?.controller.abort();
      this.workspace.onMinimize = undefined;
    });
    this.workspace.onMinimize = () => this.endVoice();
    // Navigation may preserve text generation, but never hidden microphone capture.
    const navigation = inject(Router).events.subscribe(() => this.endVoice());
    const visibility = () => {
      if (document.hidden) this.endVoice();
    };
    document.addEventListener("visibilitychange", visibility);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener("visibilitychange", visibility),
    );
    inject(DestroyRef).onDestroy(() => navigation.unsubscribe());
    let previous: RpcScope | undefined;
    let previousId: string | undefined;
    effect(() => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id(),
        live = this.liveState();
      if (scope !== previous || id !== previousId) {
        const history = untracked(this.retainedHistory);
        if (
          history &&
          (history.scope !== scope || history.conversationId !== id)
        )
          this.retainedHistory.set(null);
        if (scope !== previous || previousId !== undefined) this.endVoice(true);
        if (scope !== previous || previousId !== undefined) this.draft.set("");
        this.resultSelection.set(undefined);
        this.historyOpen.set(false);
        this.optionsOpen.set(false);
        this.canvasOpen.set(false);
        this.resultOpener = null;
        this.focusResult = false;
        this.restoreResultFocus = false;
        this.confirmDelete.set(false);
      }
      if (scope !== previous) {
        this.consentReview.set(false);
        this.historyOnly.set(false);
        this.voiceDisclosure.set(false);
        this.voiceFallback.set("");
      }
      previous = scope;
      previousId = id;
      if (live && (live.scope !== scope || live.conversationId !== id)) {
        live.controller.abort();
        this.liveState.set(null);
      }
    });
    let opened = false;
    effect(() => {
      const visible = this.workspace.opened();
      if (visible && !opened) {
        this.historyOnly.set(false);
        untracked(() => this.consent.reload());
      }
      opened = visible;
    });
    let accepted = false;
    effect(() => {
      const state = this.consent.state();
      if (
        !this.consent.loading() &&
        !this.consent.readError() &&
        state?.required
      ) {
        if (accepted && state.decision !== "accepted")
          untracked(() => this.cancelProcessing());
        accepted = state.decision === "accepted";
      }
    });
    let anchored: string | undefined;
    afterRenderEffect(() => {
      const live = this.live();
      if (
        !this.workspace.opened() ||
        !live?.turn.text ||
        anchored === live.turn.id
      )
        return;
      anchored = live.turn.id;
      // Anchor once, never follow token/source/action updates or resize.
      if (this.follow()) {
        const messages = this.messages()?.nativeElement;
        const answer = messages?.querySelector<HTMLElement>(
          `[data-turn="${live.turn.id}"] .assistant-message`,
        );
        // scrollIntoView also scrolls clipped ancestors, moving the composer.
        if (messages && answer)
          messages.scrollTop +=
            answer.getBoundingClientRect().top -
            messages.getBoundingClientRect().top;
        this.follow.set(false);
      }
    });
    let wasOpen = false;
    afterRenderEffect(() => {
      if (this.historyOpen() && this.workspace.opened())
        this.historyClose()?.nativeElement.focus();
    });
    afterRenderEffect(() => {
      if (!this.voiceDisclosure()) return;
      const messages = this.messages()?.nativeElement;
      messages
        ?.querySelector<HTMLElement>(".voice-start h3")
        ?.focus({ preventScroll: true });
      if (messages) messages.scrollTop = 0;
    });
    afterRenderEffect(() => {
      const open = this.canvasOpen(),
        panel = this.resultPanel();
      if (open && panel && this.focusResult) {
        this.focusResult = false;
        untracked(() => panel.nativeElement.focus());
      } else if (!open && this.restoreResultFocus) {
        this.restoreResultFocus = false;
        untracked(() => {
          const fallback =
            this.voice.state() === "off"
              ? this.composer()?.nativeElement
              : this.panel()?.nativeElement.querySelector<HTMLButtonElement>(
                  ".voice-session-controls button:not([disabled])",
                );
          (this.resultOpener?.isConnected
            ? this.resultOpener
            : fallback
          )?.focus();
          this.resultOpener = null;
        });
      }
    });
    afterRenderEffect(() => {
      this.workspace.focusRequest();
      this.configuration.hasValue();
      this.showConsent();
      this.historyOnly();
      if (this.workspace.opened())
        untracked(() => {
          if (this.showConsent()) {
            const heading =
              this.panel()?.nativeElement.querySelector<HTMLElement>(
                "#assistant-consent-title",
              );
            (heading ?? this.panel()?.nativeElement)?.focus();
            return;
          }
          if (this.historyOpen()) {
            this.historyClose()?.nativeElement.focus();
            return;
          }
          const composer = this.composer()?.nativeElement;
          if (
            composer &&
            !composer.disabled &&
            !composer.closest("[hidden]") &&
            getComputedStyle(composer).visibility !== "hidden"
          )
            composer.focus();
          else
            (
              this.resultPanel()?.nativeElement ?? this.panel()?.nativeElement
            )?.focus();
        });
      else if (wasOpen)
        untracked(() => this.workspace.restoreFocus(this.returnFocus()));
      wasOpen = this.workspace.opened();
    });
    afterRenderEffect(() => {
      if (this.workspace.opened() && this.workspace.modal()) {
        const panel = this.panel()?.nativeElement;
        if (panel && !panel.contains(document.activeElement)) panel.focus();
      }
    });
    effect(() => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id();
      if (!scope || !id || !this.conversation.hasValue()) return;
      const conversation = this.conversation.value();
      if (conversation.id !== id) return;
      // Resources have no value while reloading. Keep accepted turns in this
      // owner/selection's memory so rapid voice turns cannot erase proposals.
      untracked(() => {
        this.retainTurns(scope, id, conversation.turns);
        const live = this.live();
        const saved = this.retainedHistory()?.turns.find(
          (turn) => turn.id === live?.turn.id,
        );
        if (live && !live.pending && saved && saved.status !== "pending")
          this.liveState.set({ ...live, turn: saved });
      });
    });
  }

  private retainTurns(
    scope: RpcScope,
    conversationId: string,
    incoming: AssistantTurn[],
  ) {
    const previous = this.retainedHistory();
    const turns = new Map(
      previous?.scope === scope && previous.conversationId === conversationId
        ? previous.turns.map((turn) => [turn.id, turn] as const)
        : [],
    );
    for (const turn of incoming) {
      const current = turns.get(turn.id);
      // A request started before completion must not downgrade its streamed receipt.
      if (
        !current ||
        current.status === "pending" ||
        turn.status !== "pending"
      ) {
        const actions = new Map(
          current?.actions.map((action) => [action.id, action]) ?? [],
        );
        for (const action of turn.actions) {
          const previous = actions.get(action.id);
          actions.set(
            action.id,
            previous ? latestAssistantAction(previous, action) : action,
          );
        }
        turns.set(turn.id, { ...turn, actions: [...actions.values()] });
      }
    }
    this.retainedHistory.set({
      scope,
      conversationId,
      turns: [...turns.values()],
    });
  }

  protected newConversation() {
    if (!this.busy()) {
      this.endVoice();
      this.historyOpen.set(false);
      this.optionsOpen.set(false);
      this.canvasOpen.set(false);
      this.liveState.set(null);
      this.confirmDelete.set(false);
      this.draft.set("");
      this.workspace.selection.set(undefined);
    }
  }

  protected select(id: string) {
    if (!this.busy()) {
      this.endVoice();
      this.workspace.selection.set(id);
      this.closeHistory();
      this.resultSelection.set(undefined);
    }
  }

  protected closeHistory() {
    this.historyOpen.set(false);
    this.panel()
      ?.nativeElement.querySelector<HTMLButtonElement>(
        '[aria-controls="assistant-history"]',
      )
      ?.focus();
  }

  protected toggleHistory() {
    this.optionsOpen.set(false);
    this.canvasOpen.set(false);
    if (this.showConsent()) {
      this.viewHistory();
      return;
    }
    this.historyOpen.update((open) => !open);
  }

  protected toggleOptions(event: Event) {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    this.optionsOpen.set(event.target.open);
    if (event.target.open) {
      this.historyOpen.set(false);
      this.canvasOpen.set(false);
    }
  }

  protected dismissOptions(event: Event) {
    if (
      this.optionsOpen() &&
      event.target instanceof Node &&
      !this.optionsMenu()?.nativeElement.contains(event.target)
    )
      this.optionsOpen.set(false);
  }

  protected showResult(id: string, focus = true) {
    this.resultOpener =
      focus && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.focusResult = focus;
    this.restoreResultFocus = false;
    this.historyOpen.set(false);
    this.optionsOpen.set(false);
    this.resultSelection.set(id);
    this.canvasOpen.set(true);
  }

  protected closeResults() {
    this.focusResult = false;
    this.restoreResultFocus = true;
    this.canvasOpen.set(false);
  }

  protected escape(event: Event) {
    if (this.optionsOpen()) {
      this.optionsOpen.set(false);
      this.panel()
        ?.nativeElement.querySelector<HTMLElement>(
          ".assistant-options > summary",
        )
        ?.focus();
    } else if (this.historyOpen()) this.closeHistory();
    else if (this.canvasOpen()) this.closeResults();
    else if (!this.workspace.home()) this.workspace.minimize();
    event.stopPropagation();
  }

  private cancelProcessing() {
    this.revision.update((value) => value + 1);
    this.endVoice();
    this.stop();
    this.sending.set(null);
    const live = this.live();
    if (live)
      this.liveState.set({
        ...live,
        pending: false,
        error:
          "El procesamiento se detuvo. Consulta el historial para comprobar lo que alcanzó a guardarse antes de volver a enviar.",
      });
  }

  protected async decideConsent(decision: AssistantConsentDecision) {
    if (!this.consent.canDecide()) return;
    const owner = this.credentials.current(),
      opening = this.workspace.focusRequest();
    if (decision === "refused") {
      this.consentReview.set(true);
      this.cancelProcessing();
    }
    const confirmed = await this.consent.decide(decision);
    if (!confirmed || this.credentials.current() !== owner) return;
    this.consentReview.set(false);
    this.historyOnly.set(false);
    if (
      decision === "refused" &&
      !this.workspace.home() &&
      this.workspace.focusRequest() === opening
    )
      this.workspace.minimize();
  }

  protected viewHistory() {
    this.cancelProcessing();
    this.historyOnly.set(true);
    this.historyOpen.set(true);
  }

  protected requestConsent() {
    this.historyOnly.set(false);
  }

  protected async startVoice() {
    const owner = this.credentials.current();
    if (!owner || !this.canStartVoice()) return;
    this.endVoice();
    // This generation begins before history creation, not just before getUserMedia.
    const startup = new AbortController();
    this.voiceStartup = startup;
    let selection = this.workspace.selection();
    const current = () =>
      this.voiceStartup === startup &&
      !startup.signal.aborted &&
      !this.lifetime.signal.aborted &&
      !owner.signal.aborted &&
      this.credentials.current() === owner &&
      this.processingAccepted() &&
      !document.hidden &&
      this.workspace.opened() &&
      this.workspace.selection() === selection;
    owner.signal.addEventListener("abort", () => this.endVoice(true), {
      once: true,
      signal: startup.signal,
    });
    if (!current()) {
      this.endVoice();
      return;
    }
    this.voiceDisclosure.set(true);
    let id = this.id();
    if (!id) {
      await this.command.run(
        (scope, signal) =>
          scope.client.assistant.createConversation.mutate(undefined, {
            signal: AbortSignal.any([signal, startup.signal]),
          }),
        (chat) => {
          if (!current()) return;
          selection = chat.id;
          this.workspace.selection.set(chat.id);
        },
        "Conversación creada.",
      );
      id = this.id();
    }
    if (!id || !current()) return;
    this.voiceDisclosure.set(false);
    this.voiceFallback.set("");
    await this.voice.start(
      owner,
      id,
      (event) => {
        if (current()) this.receiveVoice(event);
      },
      () => {},
      startup.signal,
    );
    if (!current() && this.voiceStartup === startup) this.endVoice();
  }

  protected cancelVoiceStart() {
    this.endVoice();
    this.workspace.focusRequest.update((value) => value + 1);
  }

  private receiveVoice(event: AssistantEvent) {
    const scope = this.rpc.authenticatedScope(),
      conversationId = this.id();
    if (!scope || !conversationId) return;
    if (event.type === "turn")
      this.liveState.set({
        scope,
        conversationId,
        turn: event.turn,
        pending: true,
        controller: new AbortController(),
        status: "Consultando tus datos…",
        error: null,
        nativeVoice: true,
      });
    const live = this.live();
    if (!live) return;
    if (event.type === "delta")
      this.liveState.set({
        ...live,
        turn: { ...live.turn, text: live.turn.text + event.text },
      });
    if (event.type === "source") {
      this.liveState.set({
        ...live,
        turn: {
          ...live.turn,
          sources: [
            ...live.turn.sources.filter(
              (source) => source.id !== event.source.id,
            ),
            event.source,
          ],
        },
      });
      if (!this.canvasOpen()) this.resultSelection.set(live.turn.id);
    }
    if (event.type === "action") {
      this.liveState.set({
        ...live,
        turn: {
          ...live.turn,
          actions: [
            ...live.turn.actions.filter(
              (action) => action.id !== event.action.id,
            ),
            event.action,
          ],
        },
      });
      if (!this.canvasOpen()) this.showResult(live.turn.id, false);
    }
    if (event.type === "action_updated") {
      this.updateAction(event.action);
      if (!this.canvasOpen() && event.action.turnId)
        this.showResult(event.action.turnId, false);
    }
    if (event.type === "status")
      this.liveState.set({ ...live, status: event.text });
    if (event.type === "done") {
      this.retainTurns(scope, conversationId, [event.turn]);
      this.liveState.set({ ...live, turn: event.turn, pending: false });
      this.conversation.reload();
      this.conversations.reload();
    }
    if (event.type === "error")
      this.liveState.set({ ...live, pending: false, error: event.message });
  }

  protected endVoice(clearTranscripts = false) {
    const active = this.voice.state() !== "off",
      scope = this.rpc.authenticatedScope(),
      id = this.id();
    const ended = this.voice.end(clearTranscripts);
    this.voiceStartup?.abort();
    this.voiceStartup = undefined;
    this.voiceDisclosure.set(false);
    if (active) {
      const live = this.live();
      if (live?.pending) this.liveState.set({ ...live, pending: false });
      void ended.then(() => {
        if (
          this.rpc.authenticatedScope() === scope &&
          this.id() === id &&
          !this.lifetime.signal.aborted
        )
          this.conversation.reload();
      });
    }
  }

  protected continueText() {
    this.endVoice();
    this.canvasOpen.set(false);
    this.workspace.focusRequest.update((value) => value + 1);
  }

  protected close() {
    this.revision.update((value) => value + 1);
    this.stop();
    this.endVoice(true);
    this.sending.set(null);
    this.liveState.set(null);
    this.draft.set("");
    this.confirmDelete.set(false);
    this.voiceDisclosure.set(false);
    this.voiceFallback.set("");
    this.workspace.selection.set(undefined);
    this.workspace.minimize();
  }

  protected suggest(question: string) {
    this.draft.set(question);
    this.composer()?.nativeElement.focus();
  }

  protected input(event: Event) {
    const element = event.target;
    if (element instanceof HTMLTextAreaElement) {
      this.draft.set(element.value);
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }
  }

  protected keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.send();
    }
  }

  protected containFocus(event: KeyboardEvent) {
    if (event.key !== "Tab" || !this.workspace.modal()) return;
    const panel = this.panel()?.nativeElement;
    const elements = [
      ...(panel?.querySelectorAll<HTMLElement>(
        "button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex='0']",
      ) ?? []),
    ].filter(
      (element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden" &&
        !element.closest("[inert]"),
    );
    const target = event.shiftKey ? elements.at(-1) : elements[0];
    const boundary = event.shiftKey ? elements[0] : elements.at(-1);
    if (
      !elements.length ||
      document.activeElement === boundary ||
      document.activeElement === panel
    ) {
      event.preventDefault();
      (target ?? panel)?.focus();
    }
  }

  protected scroll(event: Event) {
    const element = event.target;
    if (element instanceof HTMLElement)
      this.follow.set(
        element.scrollHeight - element.scrollTop - element.clientHeight < 80,
      );
  }

  protected jump() {
    this.follow.set(true);
    const messages = this.messages()?.nativeElement;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  protected stop() {
    // Conversation creation is a separate, possibly committed command. Stop its
    // continuation even before a streamed turn/controller exists.
    if (this.sending() && !this.live()?.pending)
      this.revision.update((value) => value + 1);
    this.live()?.controller.abort();
  }

  protected refresh() {
    if (!this.busy()) {
      this.liveState.set(null);
      this.conversation.reload();
      this.conversations.reload();
      this.configuration.reload();
      this.voiceConfiguration.reload();
      this.consent.reload();
    }
  }

  protected actionChanged(action: FinancialAction) {
    if (action.conversationId !== this.id()) return;
    this.updateAction(action);
    this.conversation.reload();
  }

  private updateAction(action: FinancialAction) {
    if (action.conversationId !== this.id()) return;
    this.retainedHistory.update((history) =>
      history &&
      history.scope === this.rpc.authenticatedScope() &&
      history.conversationId === action.conversationId
        ? {
            ...history,
            turns: history.turns.map((turn) => ({
              ...turn,
              actions: turn.actions.map((value) =>
                value.id === action.id
                  ? latestAssistantAction(value, action)
                  : value,
              ),
            })),
          }
        : history,
    );
    const live = this.live();
    if (live?.turn.actions.some((value) => value.id === action.id))
      this.liveState.set({
        ...live,
        turn: {
          ...live.turn,
          actions: live.turn.actions.map((value) =>
            value.id === action.id
              ? latestAssistantAction(value, action)
              : value,
          ),
        },
      });
  }

  protected async send() {
    const owner = this.credentials.current(),
      scope = this.rpc.authenticatedScope();
    if (!owner || !scope || !this.canSend()) return;
    this.voice.interrupt();
    const text = this.draft().trim();
    const operation = { scope };
    this.sending.set(operation);
    try {
      await this.sendMessage(owner, scope, text);
    } finally {
      if (this.sending() === operation) this.sending.set(null);
    }
  }

  private async sendMessage(
    owner: VerifiedCredentials,
    scope: RpcScope,
    text: string,
  ) {
    const revision = this.revision();
    let id = this.id();
    if (!id) {
      let created: AssistantConversation | undefined;
      const confirmed = await this.command.run(
        (current, signal) =>
          current.client.assistant.createConversation.mutate(undefined, {
            signal,
          }),
        (value) => {
          created = value;
        },
        "Conversación creada.",
      );
      if (
        !confirmed ||
        !created ||
        owner.signal.aborted ||
        this.revision() !== revision ||
        this.lifetime.signal.aborted
      )
        return;
      id = created.id;
      this.workspace.selection.set(id);
      if (
        this.id() !== id ||
        this.credentials.current() !== owner ||
        this.revision() !== revision ||
        this.lifetime.signal.aborted
      )
        return;
    }
    if (
      this.revision() !== revision ||
      !this.configuration.hasValue() ||
      !this.configuration.value().enabled ||
      (this.consentRequired() && !this.processingAccepted())
    )
      return;
    const execution: LiveTurn = {
      scope,
      conversationId: id,
      turn: {
        id: crypto.randomUUID(),
        question: text,
        text: "",
        status: "pending",
        sources: [],
        actions: [],
        createdAt: new Date().toISOString(),
      },
      pending: true,
      controller: new AbortController(),
      status: "Buscando una respuesta con tus datos…",
      error: null,
    };
    this.liveState.set(execution);
    this.resultSelection.set(undefined);
    this.draft.set("");
    this.follow.set(true);
    const current = () =>
      this.rpc.authenticatedScope() === scope &&
      this.id() === id &&
      this.revision() === revision &&
      !this.lifetime.signal.aborted &&
      this.liveState()?.controller === execution.controller;
    const update = (change: Partial<LiveTurn>) => {
      if (current())
        this.liveState.update((value) =>
          value ? { ...value, ...change } : value,
        );
    };
    try {
      await this.stream.send(
        owner,
        { conversationId: id, requestId: execution.turn.id, text },
        AbortSignal.any([this.lifetime.signal, execution.controller.signal]),
        (event) => {
          if (!current()) return;
          const live = this.liveState();
          if (!live) return;
          if (event.type === "turn" || event.type === "done")
            update({
              turn: event.turn,
              status:
                event.type === "done"
                  ? "Respuesta guardada."
                  : "Preparando la consulta…",
            });
          if (event.type === "done") this.retainTurns(scope, id, [event.turn]);
          if (event.type === "delta")
            update({
              turn: { ...live.turn, text: live.turn.text + event.text },
              status: "Redactando con las fuentes consultadas…",
            });
          if (event.type === "source")
            update({
              turn: {
                ...live.turn,
                sources: [
                  ...live.turn.sources.filter(
                    (source) => source.id !== event.source.id,
                  ),
                  event.source,
                ],
              },
            });
          if (event.type === "action")
            update({
              turn: {
                ...live.turn,
                actions: [
                  ...live.turn.actions.filter(
                    (action) => action.id !== event.action.id,
                  ),
                  event.action,
                ],
              },
            });
          if (event.type === "action_updated") this.updateAction(event.action);
          if (event.type === "status") update({ status: event.text });
          if (event.type === "error") {
            this.endVoice();
            update({
              error:
                "No pudimos completar una respuesta confirmada. Consulta el historial antes de volver a enviar.",
            });
          }
        },
      );
    } catch {
      if (current()) this.endVoice();
      update({
        error: execution.controller.signal.aborted
          ? "Generación detenida. Consulta el estado para confirmar lo que alcanzó a guardarse."
          : "No pudimos confirmar la respuesta. Revisa el historial antes de volver a enviar.",
      });
    } finally {
      update({ pending: false });
      if (current()) {
        this.conversation.reload();
        this.conversations.reload();
        if (this.workspace.opened()) this.composer()?.nativeElement.focus();
      }
    }
  }

  protected async remove() {
    const id = this.id();
    if (!id || !this.confirmDelete() || this.busy()) return;
    await this.command.run(
      (scope, signal) =>
        scope.client.assistant.deleteConversation.mutate({ id }, { signal }),
      () => {
        this.confirmDelete.set(false);
        this.liveState.set(null);
        this.conversations.reload();
        this.workspace.selection.set(undefined);
      },
      "Conversación eliminada.",
    );
  }
}

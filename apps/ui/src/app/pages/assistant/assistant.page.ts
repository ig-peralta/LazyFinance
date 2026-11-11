import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  resource,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { Router } from "@angular/router";
import {
  ASSISTANT_MAX_INPUT,
  type AssistantConversation,
  type AssistantTurn,
  type FinancialAction,
} from "@lazyfinance/contracts";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../../core/auth/auth-credentials";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { assistantReplyText } from "../../features/assistant/assistant-reply-text";
import { AssistantStreamClient } from "../../features/assistant/assistant-stream.client";
import { AssistantVoiceClient } from "../../features/assistant/assistant-voice.client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { Icon } from "../../shared/ui/icon";
import { AssistantReply } from "./reply/assistant-reply";
import { AssistantWelcome } from "./welcome/assistant-welcome";

interface LiveTurn {
  scope: RpcScope;
  conversationId: string;
  turn: AssistantTurn;
  pending: boolean;
  controller: AbortController;
  status: string;
  error: string | null;
}

@Component({
  selector: "assistant-page",
  imports: [Icon, AssistantReply, AssistantWelcome],
  templateUrl: "./assistant.page.html",
  styleUrl: "./assistant.page.css",
  providers: [AssistantVoiceClient],
})
export class AssistantPage {
  protected readonly voice = inject(AssistantVoiceClient);
  protected readonly voiceDisclosure = signal(false);
  protected readonly voiceFallback = signal("");
  private readonly rpc = inject(RpcClient);
  private readonly credentials = inject(AuthCredentials);
  private readonly stream = inject(AssistantStreamClient);
  protected readonly workspace = inject(AssistantWorkspace);
  private readonly lifetime = new AbortController();
  private readonly liveState = signal<LiveTurn | null>(null);
  private readonly sending = signal<{ scope: RpcScope } | null>(null);
  private readonly composer =
    viewChild<ElementRef<HTMLTextAreaElement>>("composer");
  private readonly bottom = viewChild<ElementRef<HTMLElement>>("bottom");
  private readonly messages = viewChild<ElementRef<HTMLElement>>("messages");
  private readonly panel = viewChild<ElementRef<HTMLElement>>("panel");
  protected readonly follow = signal(true);
  protected readonly draft = signal("");
  protected readonly processingAccepted = signal(false);
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
    const saved =
      this.conversation.hasValue() && this.conversation.value().id === this.id()
        ? this.conversation.value().turns
        : [];
    const live = this.live();
    return live
      ? [...saved.filter((turn) => turn.id !== live.turn.id), live.turn]
      : saved;
  });
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
      !this.invalidId() &&
      this.configuration.hasValue() &&
      this.configuration.value().enabled &&
      (this.configuration.value().demonstration || this.processingAccepted()) &&
      !this.conversation.isLoading() &&
      !this.conversation.error() &&
      !this.turns().some((turn) => turn.status === "pending") &&
      this.turns().length < 24 &&
      this.draft().trim().length > 0 &&
      this.draft().trim().length <= this.maxInput,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.lifetime.abort();
      this.liveState()?.controller.abort();
      this.workspace.onMinimize = undefined;
    });
    this.workspace.onMinimize = () => this.voice.end();
    // Navigation may preserve text generation, but never hidden microphone capture.
    const navigation = inject(Router).events.subscribe(() => this.voice.end());
    inject(DestroyRef).onDestroy(() => navigation.unsubscribe());
    let previous: RpcScope | undefined;
    let previousId: string | undefined;
    effect(() => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id(),
        live = this.liveState();
      if (scope !== previous || id !== previousId) {
        if (scope !== previous || previousId !== undefined)
          this.voice.end(true);
        this.draft.set("");
        this.confirmDelete.set(false);
      }
      if (scope !== previous) {
        this.processingAccepted.set(false);
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
        this.messages()
          ?.nativeElement.querySelector(
            `[data-turn="${live.turn.id}"] .assistant-message`,
          )
          ?.scrollIntoView?.({ block: "start", behavior: "instant" });
        this.follow.set(false);
      }
    });
    let wasOpen = false;
    afterRenderEffect(() => {
      this.workspace.focusRequest();
      this.configuration.hasValue();
      if (this.workspace.opened())
        untracked(() => {
          const composer = this.composer()?.nativeElement;
          if (composer && !composer.disabled) composer.focus();
          else this.panel()?.nativeElement.focus();
        });
      else if (wasOpen) untracked(() => this.workspace.restoreFocus());
      wasOpen = this.workspace.opened();
    });
    afterRenderEffect(() => {
      if (this.workspace.opened() && this.workspace.modal()) {
        const panel = this.panel()?.nativeElement;
        if (panel && !panel.contains(document.activeElement)) panel.focus();
      }
    });
    effect(() => {
      const live = this.live();
      const saved = this.conversation.hasValue()
        ? this.conversation
            .value()
            .turns.find((turn) => turn.id === live?.turn.id)
        : undefined;
      if (
        live &&
        !live.pending &&
        live.turn.status === "pending" &&
        saved &&
        saved.status !== "pending"
      )
        this.liveState.set({ ...live, turn: saved });
    });
  }

  protected newConversation() {
    if (!this.busy()) {
      this.liveState.set(null);
      this.confirmDelete.set(false);
      this.draft.set("");
      this.workspace.selection.set(undefined);
    }
  }

  protected select(id: string) {
    if (!this.busy()) this.workspace.selection.set(id);
  }

  protected acceptProcessing(event: Event) {
    if (event.target instanceof HTMLInputElement) {
      this.processingAccepted.set(event.target.checked);
      if (!event.target.checked) {
        this.voice.end();
        this.stop();
      }
    }
  }

  protected async startVoice() {
    const owner = this.credentials.current();
    if (
      !owner ||
      this.busy() ||
      this.invalidId() ||
      !this.processingAccepted() ||
      !this.voiceConfiguration.hasValue() ||
      !this.voiceConfiguration.value().enabled
    )
      return;
    let id = this.id();
    if (!id) {
      await this.command.run(
        (scope, signal) =>
          scope.client.assistant.createConversation.mutate(undefined, {
            signal,
          }),
        (chat) => this.workspace.selection.set(chat.id),
        "Conversación creada.",
      );
      id = this.id();
    }
    if (!id || this.credentials.current() !== owner || !this.workspace.opened())
      return;
    this.voiceDisclosure.set(false);
    this.voiceFallback.set("");
    await this.voice.start(
      owner,
      id,
      (text) => {
        this.draft.set(text);
        // An interrupted/unconfirmed previous turn is reconciled explicitly, never replayed.
        if (this.canSend()) void this.send();
        else {
          this.voice.end();
          this.voiceFallback.set(
            "Tu transcripción quedó en el borrador. Revisa el estado de la conversación y envíala por texto cuando esté lista.",
          );
        }
      },
      () => this.stop(),
    );
  }

  protected close() {
    this.revision.update((value) => value + 1);
    this.stop();
    this.voice.end(true);
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
    ].filter((element) => element.getClientRects().length > 0);
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
    this.bottom()?.nativeElement.scrollIntoView?.({ block: "end" });
  }

  protected stop() {
    this.live()?.controller.abort();
  }

  protected refresh() {
    if (!this.busy()) {
      this.liveState.set(null);
      this.conversation.reload();
      this.conversations.reload();
      this.configuration.reload();
    }
  }

  protected actionChanged(action: FinancialAction) {
    const live = this.live();
    if (live?.turn.actions.some((value) => value.id === action.id))
      this.liveState.set({
        ...live,
        turn: {
          ...live.turn,
          actions: live.turn.actions.map((value) =>
            value.id === action.id ? action : value,
          ),
        },
      });
    this.conversation.reload();
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
          if (event.type === "done" && event.turn.status === "complete")
            this.voice.speak(assistantReplyText(event.turn.text));
          if (event.type === "turn" || event.type === "done")
            update({
              turn: event.turn,
              status:
                event.type === "done"
                  ? "Respuesta guardada."
                  : "Preparando la consulta…",
            });
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
          if (event.type === "status") update({ status: event.text });
          if (event.type === "error") {
            this.voice.end();
            update({
              error:
                "No pudimos completar una respuesta confirmada. Consulta el historial antes de volver a enviar.",
            });
          }
        },
      );
    } catch {
      if (current()) this.voice.end();
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

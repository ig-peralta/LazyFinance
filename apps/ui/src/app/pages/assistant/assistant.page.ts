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
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
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
import {
  initialReadSettled,
  reportWorkspaceReadiness,
} from "../../core/rendering/workspace-preparation";
import { RpcClient, type RpcScope } from "../../core/rpc/rpc-client";
import { createScopedCommand } from "../../core/rpc/scoped-command";
import { AssistantStreamClient } from "../../features/assistant/assistant-stream.client";
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
  imports: [RouterLink, Icon, AssistantReply, AssistantWelcome],
  templateUrl: "./assistant.page.html",
  styleUrl: "./assistant.page.css",
})
export class AssistantPage {
  private readonly rpc = inject(RpcClient);
  private readonly credentials = inject(AuthCredentials);
  private readonly stream = inject(AssistantStreamClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap);
  private readonly lifetime = new AbortController();
  private readonly liveState = signal<LiveTurn | null>(null);
  private readonly sending = signal<{ scope: RpcScope } | null>(null);
  private readonly composer =
    viewChild<ElementRef<HTMLTextAreaElement>>("composer");
  private readonly bottom = viewChild<ElementRef<HTMLElement>>("bottom");
  protected readonly follow = signal(true);
  protected readonly draft = signal("");
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
    const id = this.query()?.get("conversacion");
    return id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
      ? id
      : undefined;
  });
  protected readonly invalidId = computed(
    () => !!this.query()?.has("conversacion") && !this.id(),
  );
  protected readonly command = createScopedCommand(() => this.id());
  protected readonly configuration = resource({
    params: () => this.rpc.authenticatedScope(),
    loader: ({ params: scope, abortSignal }) =>
      scope.client.assistant.configuration.query(undefined, {
        signal: abortSignal,
      }),
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
    });
    let previous: RpcScope | undefined;
    let previousId: string | undefined;
    effect(() => {
      const scope = this.rpc.authenticatedScope(),
        id = this.id(),
        live = this.liveState();
      if (scope !== previous || id !== previousId) {
        this.draft.set("");
        this.confirmDelete.set(false);
      }
      previous = scope;
      previousId = id;
      if (live && (live.scope !== scope || live.conversationId !== id)) {
        live.controller.abort();
        this.liveState.set(null);
      }
    });
    afterRenderEffect(() => {
      const turns = this.turns();
      if (turns.length && this.follow())
        this.bottom()?.nativeElement.scrollIntoView?.({ block: "end" });
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
    reportWorkspaceReadiness(
      () =>
        initialReadSettled(this.configuration) &&
        (!this.configuration.hasValue() ||
          (initialReadSettled(this.conversations) &&
            (!this.id() || initialReadSettled(this.conversation)))),
    );
  }

  protected newConversation() {
    if (!this.busy()) {
      this.liveState.set(null);
      this.confirmDelete.set(false);
      this.draft.set("");
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
      });
    }
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
        this.lifetime.signal.aborted
      )
        return;
      id = created.id;
      const navigated = await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { conversacion: id },
      });
      if (
        !navigated ||
        this.id() !== id ||
        this.credentials.current() !== owner ||
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
          if (event.type === "error") update({ error: event.message });
        },
      );
    } catch (error) {
      update({
        error: execution.controller.signal.aborted
          ? "Generación detenida. Consulta el estado para confirmar lo que alcanzó a guardarse."
          : error instanceof Error
            ? error.message
            : "No pudimos confirmar la respuesta. Revisa el historial.",
      });
    } finally {
      update({ pending: false });
      if (current()) {
        this.conversation.reload();
        this.conversations.reload();
        this.composer()?.nativeElement.focus();
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
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
        });
      },
      "Conversación eliminada.",
    );
  }
}

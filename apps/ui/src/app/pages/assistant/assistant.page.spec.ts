import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import type {
  AssistantConsentState,
  AssistantConversation,
  AssistantEvent,
  AssistantSend,
  AssistantTurn,
} from "@lazyfinance/contracts";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assistantAction,
  assistantReply,
  assistantSource,
} from "../../../testing/assistant";
import { deferred } from "../../../testing/deferred";
import {
  assistantConsent,
  principal,
  type RpcHandlers,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { AssistantStreamClient } from "../../features/assistant/assistant-stream.client";
import {
  AssistantVoiceClient,
  VOICE_MEDIA,
} from "../../features/assistant/assistant-voice.client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { AssistantPage } from "./assistant.page";

const chat: AssistantConversation = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Mis finanzas",
  createdAt: "2026-11-09T03:00:00.000Z",
  updatedAt: "2026-11-09T03:00:00.000Z",
  expiresAt: "2026-12-09T03:00:00.000Z",
  turnCount: 0,
  turns: [],
};
const configuration = {
  enabled: true,
  provider: "demo",
  model: "",
  demonstration: true,
  maxTurns: 24,
  maxInput: 2000,
} as const;
const externalConfiguration = {
  ...configuration,
  provider: "openai",
  model: "configured-text-model",
  demonstration: false,
};
const undecidedConsent: AssistantConsentState = {
  ...assistantConsent,
  decision: "unset",
  revision: 0,
  decidedAt: null,
};
function turn(input: AssistantSend): AssistantTurn {
  return {
    id: input.requestId,
    question: input.text,
    text: "",
    status: "pending",
    sources: [],
    actions: [],
    createdAt: chat.createdAt,
  };
}

function setup(
  overrides: RpcHandlers = {},
  selected: string | null = chat.id,
  voiceEnabled = false,
  voiceAvailability?: AssistantVoiceClient["configuration"],
  initialConsent: AssistantConsentState = assistantConsent,
) {
  let savedConsent = initialConsent;
  const microphone = vi.fn<() => Promise<MediaStream>>(async () => {
    throw new Error("Unexpected microphone access");
  });
  const query = new BehaviorSubject(
    convertToParamMap(selected ? { conversacion: selected } : {}),
  );
  const mock = setupRpc(
    {
      "assistant.configuration": () => configuration,
      "assistant.conversations": () => [chat],
      "assistant.conversation": () => chat,
      "assistant.createConversation": () => chat,
      "assistant.deleteConversation": () => ({ removed: true }),
      "assistant.consent": () => savedConsent,
      "assistant.decideConsent": (input) => {
        savedConsent = {
          ...savedConsent,
          decision: input.decision,
          revision: savedConsent.revision + 1,
          decidedAt: "2026-11-11T12:00:00.000Z",
        };
        return savedConsent;
      },
      ...overrides,
    },
    "browser",
    true,
    [
      {
        provide: VOICE_MEDIA,
        useValue: {
          supported: () => voiceEnabled,
          microphone,
          peer: () => {
            throw new Error("Unexpected peer creation");
          },
          audio: () => {
            throw new Error("Unexpected audio creation");
          },
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: query.asObservable(),
          snapshot: { queryParams: {} },
        },
      },
    ],
  );
  // The page owns its query selection; no workspace shell is needed in these lifecycle tests.
  const navigate = vi
    .spyOn(TestBed.inject(Router), "navigate")
    .mockImplementation(async (_commands, extras) => {
      query.next(convertToParamMap(extras?.queryParams ?? {}));
      return true;
    });
  const stream = vi
    .spyOn(TestBed.inject(AssistantStreamClient), "send")
    .mockImplementation(async (_owner, input, _signal, receive) => {
      receive({ type: "turn", turn: turn(input) });
      receive({
        type: "done",
        turn: {
          ...turn(input),
          text: "Una respuesta guardada.",
          status: "complete",
        },
      });
    });
  const fixture = TestBed.createComponent(AssistantPage);
  const voiceRead = vi
    .spyOn(AssistantVoiceClient.prototype, "configuration")
    .mockImplementation(
      voiceAvailability ?? (async () => ({ enabled: voiceEnabled })),
    );
  fixture.detectChanges();
  const workspace = TestBed.inject(AssistantWorkspace);
  query.subscribe((params) =>
    workspace.selection.set(params.get("conversacion") ?? undefined),
  );
  workspace.open();
  return {
    ...mock,
    query,
    navigate,
    stream,
    workspace,
    microphone,
    voiceRead,
    setConsent(state: AssistantConsentState) {
      savedConsent = state;
    },
    fixture,
    root: fixture.nativeElement as HTMLElement,
  };
}

async function render(fixture: ComponentFixture<AssistantPage>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
function button(root: HTMLElement, name: string) {
  const node = [...root.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.trim() === name ||
      button.getAttribute("aria-label") === name ||
      button.querySelector("strong")?.textContent === name,
  );
  if (!node) throw new Error(`Missing button: ${name}`);
  return node;
}
function compose(f: ReturnType<typeof setup>, text = "¿Mis saldos?") {
  const node = f.root.querySelector("textarea");
  if (!node) throw new Error("Missing composer");
  node.value = text;
  node.dispatchEvent(new Event("input"));
  f.fixture.detectChanges();
  return node;
}

describe("first-party chat page lifetimes and confirmed history", () => {
  it("keeps proposals inline and opens source details only on request without duplicating approval controls", async () => {
    let action = assistantAction();
    const saved = () => ({
      ...chat,
      turns: [{ ...assistantReply, actions: [action] }],
      turnCount: 1,
    });
    const f = setup({
      "assistant.conversation": saved,
      "financialActions.approve": () => {
        action = {
          ...action,
          status: "applied",
          results: [
            {
              id: action.id,
              title: "Supermercado",
              path: "/etiquetas",
              outcome: "created",
            },
          ],
        };
        return action;
      },
    });
    document.body.append(f.root);
    try {
      await render(f.fixture);
      const composer = compose(f, "Un borrador que no debe perderse");
      expect(f.root.querySelector("assistant-canvas")).toBeNull();
      expect(f.root.querySelector(".workspace-mode-tabs")).toBeNull();
      expect(
        f.root.querySelectorAll("assistant-reply assistant-action-card"),
      ).toHaveLength(1);
      const details = button(f.root, "Ver consultas · 1 ↗");
      details.focus();
      details.click();
      await render(f.fixture);
      expect(
        f.root.querySelector(".chat-details assistant-reference"),
      ).not.toBeNull();
      expect(
        f.root.querySelector(".chat-details assistant-action-card"),
      ).toBeNull();
      button(f.root, "Cerrar detalles").click();
      await render(f.fixture);
      expect(document.activeElement).toBe(details);
      expect(composer.value).toBe("Un borrador que no debe perderse");
      button(f.root, "Historial").click();
      await render(f.fixture);
      expect(f.root.querySelector(".chat-surface")?.hasAttribute("inert")).toBe(
        true,
      );
      expect(document.activeElement).toBe(button(f.root, "Cerrar historial"));
      button(f.root, "Cerrar historial").click();
      await render(f.fixture);
      expect(f.root.querySelector(".chat-surface")?.hasAttribute("inert")).toBe(
        false,
      );
      expect(document.activeElement).toBe(button(f.root, "Historial"));
      expect(composer.value).toBe("Un borrador que no debe perderse");
      button(f.root, "Guardar etiqueta").click();
      await render(f.fixture);
      expect(f.callsTo("financialActions.approve")).toHaveLength(1);
      expect(f.root.querySelector(".action-status")?.textContent).toContain(
        "Cambio confirmado",
      );
      expect(f.stream).not.toHaveBeenCalled();
    } finally {
      f.root.remove();
    }
  });

  it("keeps native voice proposals reviewable, then restores the same saved proposal inline on text handoff", async () => {
    const f = setup(
      { "assistant.configuration": () => externalConfiguration },
      chat.id,
      true,
    );
    const voice = f.fixture.debugElement.injector.get(AssistantVoiceClient);
    let receive: Parameters<AssistantVoiceClient["start"]>[2] | undefined;
    vi.spyOn(voice, "start").mockImplementation(
      async (_owner, _id, handler) => {
        receive = handler;
        voice.state.set("listening");
      },
    );
    await render(f.fixture);
    compose(f, "Mi borrador");
    button(f.root, "Conversar por voz").click();
    await render(f.fixture);
    button(f.root, "Entiendo, iniciar micrófono").click();
    await render(f.fixture);
    const pending = {
      ...assistantReply,
      question: "Consulta por voz",
      text: "",
      sources: [],
      status: "pending" as const,
    };
    const action = assistantAction();
    receive?.({ type: "turn", turn: pending });
    receive?.({ type: "source", source: assistantSource() });
    await render(f.fixture);
    expect(f.root.querySelector("assistant-canvas")).toBeNull();
    button(f.root, "Ver consultas · 1 ↗").click();
    await render(f.fixture);
    expect(
      f.root.querySelector(".chat-details assistant-reference"),
    ).not.toBeNull();
    button(f.root, "Cerrar detalles").click();
    await render(f.fixture);
    receive?.({ type: "action", action });
    await render(f.fixture);
    expect(
      f.root.querySelector(".chat-details assistant-action-card"),
    ).not.toBeNull();
    expect(button(f.root, "Guardar etiqueta").disabled).toBe(true);
    receive?.({
      type: "done",
      turn: {
        ...pending,
        status: "complete",
        text: "Revisa la propuesta antes de aprobar.",
        sources: [assistantSource()],
        actions: [action],
        voice: { question: "Prepara una etiqueta" },
      },
    });
    await render(f.fixture);
    expect(button(f.root, "Guardar etiqueta").disabled).toBe(false);
    button(f.root, "Continuar por texto").click();
    await render(f.fixture);
    expect(f.root.querySelector(".chat-details")).toBeNull();
    expect(
      f.root.querySelectorAll("assistant-reply assistant-action-card"),
    ).toHaveLength(1);
    expect(f.root.querySelector("textarea")?.value).toBe("Mi borrador");
    expect(f.callsTo("financialActions.approve")).toHaveLength(0);
    expect(f.stream).not.toHaveBeenCalled();
  });

  it("dismisses assistant options on Escape or an outside pointer without clearing the draft or withdrawing consent", async () => {
    const f = setup({ "assistant.configuration": () => externalConfiguration });
    document.body.append(f.root);
    try {
      await render(f.fixture);
      const composer = compose(f, "Una pregunta sin enviar");
      const options =
        f.root.querySelector<HTMLDetailsElement>(".assistant-options");
      const trigger = options?.querySelector("summary");
      if (!options || !trigger) throw new Error("Missing assistant options");
      options.open = true;
      options.dispatchEvent(new Event("toggle"));
      await render(f.fixture);
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await render(f.fixture);
      expect(options.open).toBe(false);
      expect(document.activeElement).toBe(trigger);

      options.open = true;
      options.dispatchEvent(new Event("toggle"));
      await render(f.fixture);
      composer.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await render(f.fixture);
      expect(options.open).toBe(false);
      expect(composer.value).toBe("Una pregunta sin enviar");
      expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
      expect(f.stream).not.toHaveBeenCalled();
      expect(f.microphone).not.toHaveBeenCalled();
    } finally {
      f.root.remove();
    }
  });

  it("releases local busy state after native transport failure and allows explicit history reconciliation without replay", async () => {
    let saved: AssistantTurn[] = [];
    const f = setup(
      {
        "assistant.configuration": () => externalConfiguration,
        "assistant.conversation": () => ({
          ...chat,
          turns: saved,
          turnCount: saved.length,
        }),
      },
      chat.id,
      true,
    );
    let receive: Parameters<AssistantVoiceClient["start"]>[2] | undefined;
    const voice = f.fixture.debugElement.injector.get(AssistantVoiceClient);
    vi.spyOn(voice, "start").mockImplementation(
      async (_owner, _id, handler) => {
        receive = handler;
        voice.state.set("listening");
      },
    );
    await render(f.fixture);
    button(f.root, "Conversar por voz").click();
    await render(f.fixture);
    button(f.root, "Entiendo, iniciar micrófono").click();
    await render(f.fixture);
    const pending = turn({
      conversationId: chat.id,
      requestId: "00000000-0000-4000-8000-000000000002",
      text: "Consulta por voz",
    });
    receive?.({ type: "turn", turn: pending });
    await render(f.fixture);
    voice.state.set("off");
    await render(f.fixture);
    expect(f.root.textContent).toContain("La voz terminó");
    expect(button(f.root, "Consultar estado").disabled).toBe(false);
    saved = [
      {
        ...pending,
        status: "interrupted",
        voice: { question: "Audio interrumpido" },
      },
    ];
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Audio interrumpido");
    compose(f, "Una nueva pregunta explícita");
    expect(button(f.root, "Enviar pregunta").disabled).toBe(false);
    expect(f.stream).not.toHaveBeenCalled();
  });
  it("receives native voice turns without sending captions through text chat, then restores the draft", async () => {
    const f = setup(
      { "assistant.configuration": () => externalConfiguration },
      chat.id,
      true,
    );
    let receive: Parameters<AssistantVoiceClient["start"]>[2] | undefined;
    const voice = f.fixture.debugElement.injector.get(AssistantVoiceClient);
    vi.spyOn(voice, "start").mockImplementation(
      async (_owner, _id, handler) => {
        receive = handler;
        voice.state.set("listening");
      },
    );
    await render(f.fixture);
    compose(f, "Mi borrador detallado");
    button(f.root, "Conversar por voz").click();
    await render(f.fixture);
    button(f.root, "Entiendo, iniciar micrófono").click();
    await render(f.fixture);
    expect(f.root.querySelector(".voice-stage")).not.toBeNull();
    expect(
      f.root.querySelector<HTMLFormElement>(".chat-composer")?.hidden,
    ).toBe(true);
    const native = {
      ...turn({
        conversationId: chat.id,
        requestId: "00000000-0000-4000-8000-000000000002",
        text: "Consulta por voz",
      }),
      voice: { question: "¿Y el mes anterior?" },
    };
    receive?.({ type: "turn", turn: native });
    receive?.({ type: "delta", text: "Revisemos un período comparable." });
    receive?.({
      type: "done",
      turn: {
        ...native,
        text: "Revisemos un período comparable.",
        status: "complete",
      },
    });
    await render(f.fixture);
    expect(f.stream).not.toHaveBeenCalled();
    button(f.root, "Continuar por texto").click();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")?.value).toBe(
      "Mi borrador detallado",
    );
    expect(f.root.textContent).toContain("¿Y el mes anterior?");
    expect(f.root.querySelector(".voice-stage")).toBeNull();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("shows a first-open consent screen and never starts voice from persisted processing permission alone", async () => {
    const f = setup(
      {
        "assistant.configuration": () => ({
          ...configuration,
          demonstration: false,
          provider: "openai",
          model: "configured-text-model",
        }),
      },
      chat.id,
      true,
      undefined,
      { ...assistantConsent, decision: "unset", revision: 0, decidedAt: null },
    );
    const start = vi
      .spyOn(AssistantVoiceClient.prototype, "start")
      .mockResolvedValue();
    await render(f.fixture);
    expect(
      f.root.querySelector("assistant-consent-screen")?.textContent,
    ).toContain("configured-text-model");
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.root.querySelector(".voice-controls")).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    button(f.root, "Permitir y abrir asistente").click();
    await render(f.fixture);
    expect(f.callsTo("assistant.decideConsent")[0].input).toEqual({
      policyKey: assistantConsent.policy.key,
      expectedRevision: 0,
      decision: "accepted",
    });
    expect(f.root.querySelector("assistant-consent-screen")).toBeNull();
    expect(start).not.toHaveBeenCalled();
    button(f.root, "Conversar por voz").click();
    await render(f.fixture);
    expect(f.root.querySelector(".voice-start")?.textContent).toContain(
      "sin enviar cada transcripción al modelo de texto",
    );
    expect(f.root.querySelector(".voice-processing-consent")).toBeNull();
    expect(button(f.root, "Entiendo, iniciar micrófono").disabled).toBe(false);
    expect(start).not.toHaveBeenCalled();
    button(f.root, "Entiendo, iniciar micrófono").click();
    await render(f.fixture);
    expect(start).toHaveBeenCalledOnce();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
  });

  it.each([
    "disabled",
    "failed",
  ])("explicitly rechecks %s voice availability without remounting, capture or replay", async (initial) => {
    const availability = vi.fn<AssistantVoiceClient["configuration"]>();
    if (initial === "disabled")
      availability.mockResolvedValueOnce({ enabled: false });
    else availability.mockRejectedValueOnce(new Error("Unavailable"));
    availability.mockResolvedValue({ enabled: true });
    const f = setup(
      {
        "assistant.configuration": () => ({
          ...configuration,
          demonstration: false,
          provider: "openai",
          model: "configured-text-model",
        }),
      },
      chat.id,
      true,
      availability,
    );
    await render(f.fixture);
    expect(availability).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain(
      initial === "disabled"
        ? "La voz está deshabilitada en el servidor"
        : "No pudimos comprobar la disponibilidad de voz",
    );
    button(f.root, "Volver a comprobar voz").click();
    await render(f.fixture);
    expect(availability).toHaveBeenCalledTimes(2);
    expect(button(f.root, "Conversar por voz").disabled).toBe(false);
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    expect(f.microphone).not.toHaveBeenCalled();
    expect(f.stream).not.toHaveBeenCalled();
  });

  it.each([
    "removed",
    "hidden",
    "inert",
    "closed-dialog",
  ])("returns focus to the visible launcher when the opener is %s", async (state) => {
    const f = setup();
    document.body.append(f.root);
    const container = document.createElement(
      state === "closed-dialog" ? "dialog" : "div",
    );
    if (container instanceof HTMLDialogElement) container.open = true;
    const opener = document.createElement("button");
    opener.textContent = "Synthetic opener";
    container.append(opener);
    document.body.append(container);
    const launcher = document.createElement("button");
    launcher.textContent = "Abrir asistente · ?";
    document.body.append(launcher);
    f.fixture.componentRef.setInput("returnFocus", launcher);
    try {
      await render(f.fixture);
      f.workspace.minimize();
      await render(f.fixture);
      opener.focus();
      f.workspace.open();
      await render(f.fixture);
      if (state === "removed") container.remove();
      else if (state === "hidden") container.hidden = true;
      else if (state === "inert") container.setAttribute("inert", "");
      else if (container instanceof HTMLDialogElement) container.open = false;
      f.workspace.minimize();
      await render(f.fixture);
      expect(launcher.hidden).toBe(false);
      expect(document.activeElement).toBe(launcher);
      expect(f.stream).not.toHaveBeenCalled();
    } finally {
      launcher.remove();
      container.remove();
      f.root.remove();
    }
  });

  it("does not disclose a question after persisted consent is withdrawn during deferred text creation, even if reaccepted", async () => {
    const created = deferred<AssistantConversation>();
    const f = setup(
      {
        "assistant.configuration": () => ({
          ...configuration,
          provider: "openai",
          model: "synthetic",
          demonstration: false,
        }),
        "assistant.createConversation": () => created.promise,
      },
      null,
    );
    await render(f.fixture);
    compose(f, "Una pregunta que no debe enviarse");
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    button(f.root, "Retirar consentimiento").click();
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    button(f.root, "Permitir y abrir asistente").click();
    await render(f.fixture);
    created.resolve(chat);
    await render(f.fixture);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    expect(f.callsTo("assistant.createConversation")).toHaveLength(1);
  });

  it.each([
    "cancel",
    "withdrawal",
    "navigation",
    "minimize-reopen",
    "hidden",
    "owner",
    "destroy",
    "accepted",
  ])("honors %s during deferred voice conversation creation", async (reason) => {
    const created = deferred<AssistantConversation>();
    const f = setup(
      {
        "assistant.configuration": () => ({
          ...configuration,
          demonstration: false,
          provider: "openai",
          model: "configured",
        }),
        "assistant.createConversation": () => created.promise,
      },
      null,
      true,
    );
    const start = vi
      .spyOn(AssistantVoiceClient.prototype, "start")
      .mockResolvedValue();
    await render(f.fixture);
    button(f.root, "Conversar por voz").click();
    f.fixture.detectChanges();
    button(f.root, "Entiendo, iniciar micrófono").click();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    if (reason === "cancel") button(f.root, "Cancelar voz").click();
    if (reason === "withdrawal")
      button(f.root, "Retirar consentimiento").click();
    if (reason === "minimize-reopen") {
      f.workspace.minimize();
      f.workspace.open();
    }
    if (reason === "navigation") {
      const router = TestBed.inject(Router);
      vi.mocked(router.navigateByUrl).mockRestore();
      await router.navigateByUrl("/");
    }
    if (reason === "hidden") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    }
    if (reason === "owner") f.credentials.clear();
    if (reason === "destroy") f.fixture.destroy();
    else f.fixture.detectChanges();
    created.resolve(chat);
    if (reason !== "destroy") await render(f.fixture);
    else await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(reason === "accepted" ? 1 : 0);
    expect(f.microphone).not.toHaveBeenCalled();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.workspace.selection()).toBe(
      reason === "accepted" ? chat.id : undefined,
    );
  });

  it("keeps suggestions explicit, supports Shift+Enter and prevents duplicate creation or sends across navigation", async () => {
    const created = deferred<AssistantConversation>();
    const f = setup(
      { "assistant.createConversation": () => created.promise },
      null,
    );
    await render(f.fixture);
    button(f.root, "Mi dinero hoy").click();
    f.fixture.detectChanges();
    expect(f.stream).not.toHaveBeenCalled();
    const textarea = compose(f);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    expect(f.stream).not.toHaveBeenCalled();
    created.resolve(chat);
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
    expect(f.stream.mock.calls[0][1]).toMatchObject({
      conversationId: chat.id,
      text: "¿Mis saldos?",
    });
    expect(f.root.textContent).toContain("Una respuesta guardada.");
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("stops without claiming rollback, reconciles saved state and never automatically replays the question", async () => {
    let saved = chat;
    const f = setup({ "assistant.conversation": () => saved });
    f.stream.mockImplementationOnce(async (_owner, input, signal, receive) => {
      const pending = turn(input);
      receive({ type: "turn", turn: pending });
      receive({ type: "delta", text: "Parcial" });
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            saved = {
              ...chat,
              turnCount: 1,
              turns: [{ ...pending, text: "Parcial", status: "interrupted" }],
            };
            reject(signal.reason);
          },
          { once: true },
        ),
      );
    });
    await render(f.fixture);
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() => expect(f.stream).toHaveBeenCalledOnce());
    f.fixture.detectChanges();
    button(f.root, "Detener respuesta").click();
    await vi.waitFor(() => {
      f.fixture.detectChanges();
      expect(f.root.textContent).toContain("Generación detenida");
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain("Generación detenida");
    expect(f.root.textContent).toContain("Interrumpida");
    expect(f.root.textContent).not.toContain("Respuesta guardada.");
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain("Parcial");
  });

  it.each([
    "logout",
    "owner",
    "conversation",
    "destroy",
  ])("cancels %s and ignores late answer callbacks", async (change) => {
    const late = deferred<void>();
    const f = setup();
    let receive: ((event: AssistantEvent) => void) | undefined;
    let message: AssistantSend | undefined;
    f.stream.mockImplementationOnce(
      async (_owner, input, _signal, callback) => {
        message = input;
        receive = callback;
        callback({ type: "turn", turn: turn(input) });
        await late.promise;
      },
    );
    await render(f.fixture);
    compose(f, "Pregunta privada del primer usuario");
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() => expect(f.stream).toHaveBeenCalledOnce());
    if (change === "logout") f.credentials.clear();
    if (change === "owner")
      f.credentials.accept(
        { ...principal, userId: "owner-b", name: "Otra persona" },
        "other-token",
      );
    if (change === "conversation") f.query.next(convertToParamMap({}));
    if (change === "destroy") f.fixture.destroy();
    else f.fixture.detectChanges();
    const [owner, , signal] = f.stream.mock.calls[0];
    expect(owner.signal.aborted || signal.aborted).toBe(true);
    if (!message) throw new Error("Missing request");
    receive?.({
      type: "done",
      turn: {
        ...turn(message),
        status: "complete",
        text: "Obsolete sensitive answer",
      },
    });
    late.resolve();
    if (change !== "destroy") {
      await render(f.fixture);
      expect(f.root.textContent).not.toContain("Obsolete sensitive answer");
    }
    expect(f.stream).toHaveBeenCalledOnce();
  });

  it("does not replay a lost stream confirmation and blocks another send until the history reconciles", async () => {
    const f = setup();
    f.stream.mockImplementationOnce(async (_owner, input, _signal, receive) => {
      receive({ type: "turn", turn: turn(input) });
      throw new Error("Conexión sin confirmación");
    });
    await render(f.fixture);
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    compose(f, "Otra pregunta");
    expect(button(f.root, "Enviar pregunta").disabled).toBe(true);
    expect(f.root.textContent).toContain("No se reenviará automáticamente");
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
  });

  it("requires deletion confirmation, clears it on selection changes and removes only the selected chat", async () => {
    const f = setup();
    await render(f.fixture);
    button(f.root, "Eliminar conversación").click();
    f.fixture.detectChanges();
    expect(f.callsTo("assistant.deleteConversation")).toHaveLength(0);
    button(f.root, "Cancelar").click();
    f.fixture.detectChanges();
    button(f.root, "Eliminar conversación").click();
    f.fixture.detectChanges();
    button(f.root, "Confirmar eliminación").click();
    await render(f.fixture);
    expect(f.callsTo("assistant.deleteConversation")[0].input).toEqual({
      id: chat.id,
    });
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.workspace.selection()).toBeUndefined();
  });

  it("retains draft, selection and existing generation across minimize/open without resend", async () => {
    const f = setup();
    await render(f.fixture);
    compose(f, "Un borrador privado");
    const id = f.workspace.selection();
    f.workspace.minimize();
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")?.value).toBe("Un borrador privado");
    expect(f.workspace.selection()).toBe(id);
    expect(f.stream).not.toHaveBeenCalled();
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    f.workspace.minimize();
    f.workspace.open();
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain("Una respuesta guardada.");
  });

  it("cancels a pending conversation creation on Close without sending its late question", async () => {
    const created = deferred<AssistantConversation>();
    const f = setup(
      { "assistant.createConversation": () => created.promise },
      null,
    );
    await render(f.fixture);
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    button(f.root, "Cerrar panel").click();
    f.fixture.detectChanges();
    created.resolve(chat);
    await render(f.fixture);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.workspace.selection()).toBeUndefined();
    expect(f.root.querySelector("textarea")?.value).toBe("");
    expect(f.workspace.opened()).toBe(false);
  });

  it("keeps an in-flight text stream alive while minimized without replay on reopen", async () => {
    const finish = deferred<void>();
    const f = setup();
    f.stream.mockImplementationOnce(async (_owner, input, _signal, receive) => {
      receive({ type: "turn", turn: turn(input) });
      await finish.promise;
      receive({
        type: "done",
        turn: {
          ...turn(input),
          status: "complete",
          text: "Respuesta recibida mientras estaba minimizado",
        },
      });
    });
    await render(f.fixture);
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() => expect(f.stream).toHaveBeenCalledOnce());
    f.workspace.minimize();
    await render(f.fixture);
    expect(f.stream.mock.calls[0][2].aborted).toBe(false);
    finish.resolve();
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "Respuesta recibida mientras estaba minimizado",
    );
    expect(f.stream).toHaveBeenCalledOnce();
  });

  it("uses saved processing consent without a session checkbox and keeps provider identity outside conversation text", async () => {
    const f = setup({
      "assistant.configuration": () => ({
        ...configuration,
        provider: "openai",
        model: "configured-model",
        demonstration: false,
      }),
    });
    await render(f.fixture);
    compose(f);
    expect(button(f.root, "Enviar pregunta").disabled).toBe(false);
    const disclosure = f.root.querySelector(".processing-disclosure");
    expect(disclosure?.textContent).toContain(assistantConsent.policy.model);
    expect(f.root.querySelector(".chat-messages")?.textContent).not.toContain(
      assistantConsent.policy.model,
    );
    expect(f.root.querySelector(".processing-consent")).toBeNull();
    expect(f.root.querySelector("assistant-consent-screen")).toBeNull();
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
  });

  it("remembers accepted consent after a new assistant component is mounted without browser storage or automatic sending", async () => {
    const f = setup(
      { "assistant.configuration": () => externalConfiguration },
      chat.id,
      false,
      undefined,
      undecidedConsent,
    );
    await render(f.fixture);
    button(f.root, "Permitir y abrir asistente").click();
    await render(f.fixture);
    f.workspace.minimize();
    f.fixture.destroy();
    const restored = TestBed.createComponent(AssistantPage);
    restored.detectChanges();
    await render(restored);
    f.workspace.open();
    await render(restored);
    const root: HTMLElement = restored.nativeElement;
    expect(root.querySelector("assistant-consent-screen")).toBeNull();
    expect(root.querySelector("textarea")).not.toBeNull();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    expect(
      Object.keys(localStorage).some((key) => key.includes("consent")),
    ).toBe(false);
  });

  it("persists refusal, exits safely and shows the consent screen on the next open", async () => {
    const f = setup(
      { "assistant.configuration": () => externalConfiguration },
      chat.id,
      false,
      undefined,
      undecidedConsent,
    );
    await render(f.fixture);
    button(f.root, "Ahora no").click();
    await render(f.fixture);
    expect(f.workspace.opened()).toBe(false);
    expect(f.callsTo("assistant.decideConsent")[0].input).toMatchObject({
      decision: "refused",
      expectedRevision: 0,
    });
    f.workspace.open();
    await render(f.fixture);
    expect(
      f.root.querySelector("assistant-consent-screen")?.textContent,
    ).toContain("Elegiste no permitirlo");
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
  });

  it("preserves the composer, selected chat and opened query details across accepted reopening checks", async () => {
    const rechecked = deferred<AssistantConsentState>();
    let reads = 0;
    const withReferences: AssistantConversation = {
      ...chat,
      turnCount: 1,
      turns: [
        {
          ...turn({
            conversationId: chat.id,
            requestId: "00000000-0000-4000-8000-000000000002",
            text: "Mis saldos",
          }),
          status: "complete",
          text: "Revisa el saldo registrado.",
          sources: [
            {
              id: "F1",
              tool: "consultar_saldos_cuentas",
              title: "Cuentas",
              status: "available",
              path: "/cuentas",
              note: "",
              data: { accounts: [] },
              queriedAt: chat.createdAt,
              month: null,
              recordId: null,
            },
          ],
        },
      ],
    };
    const f = setup({
      "assistant.configuration": () => externalConfiguration,
      "assistant.conversation": () => withReferences,
      "assistant.consent": () =>
        ++reads === 1 ? assistantConsent : rechecked.promise,
    });
    document.body.append(f.root);
    await render(f.fixture);
    const composer = compose(f, "Borrador conservado");
    button(f.root, "Ver consultas · 1 ↗").click();
    await render(f.fixture);
    const references = f.root.querySelector<HTMLElement>(".chat-details");
    if (!references) throw new Error("Missing saved references");
    const selected = f.workspace.selection();
    f.workspace.minimize();
    await render(f.fixture);
    f.workspace.open();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.consent")).toHaveLength(2),
    );
    expect(f.root.querySelector("assistant-consent-screen")).toBeNull();
    expect(f.root.querySelector("textarea")).toBe(composer);
    expect(f.root.querySelector(".chat-details")).toBe(references);
    expect(references.querySelector("assistant-reference")).not.toBeNull();
    expect(composer.value).toBe("Borrador conservado");
    expect(button(f.root, "Enviar pregunta").disabled).toBe(true);
    rechecked.resolve(assistantConsent);
    await render(f.fixture);
    expect(f.workspace.selection()).toBe(selected);
    expect(f.root.querySelector("textarea")).toBe(composer);
    expect(document.activeElement).toBe(references);
    expect(f.root.querySelector(".chat-details")).toBe(references);
    expect(button(f.root, "Enviar pregunta").disabled).toBe(false);
    expect(f.stream).not.toHaveBeenCalled();
    f.root.remove();
  });

  it("stops local text immediately on failed withdrawal and requires an explicit recheck and decision before resuming", async () => {
    const finished = deferred<void>();
    const f = setup({
      "assistant.configuration": () => externalConfiguration,
      "assistant.decideConsent": () => rpcFailure(),
    });
    f.stream.mockImplementationOnce(async (_owner, input, _signal, receive) => {
      receive({ type: "turn", turn: turn(input) });
      await finished.promise;
      receive({
        type: "done",
        turn: { ...turn(input), text: "Late result", status: "complete" },
      });
    });
    await render(f.fixture);
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() => expect(f.stream).toHaveBeenCalledOnce());
    button(f.root, "Retirar consentimiento").click();
    f.fixture.detectChanges();
    expect(f.stream.mock.calls[0][2].aborted).toBe(true);
    await vi.waitFor(() =>
      expect(f.root.textContent).toContain("No pudimos confirmar el cambio"),
    );
    expect(f.root.querySelector("textarea")).toBeNull();
    button(f.root, "Comprobar decisión guardada").click();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(button(f.root, "Permitir y abrir asistente").disabled).toBe(false),
    );
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
    finished.resolve();
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Late result");
    expect(f.stream).toHaveBeenCalledOnce();
  });

  it.each([
    "Ver historial sin IA",
    "Historial",
  ])("keeps history and confirmed chat deletion available through %s after refusal without any AI request", async (entry) => {
    const f = setup(
      { "assistant.configuration": () => externalConfiguration },
      chat.id,
      true,
      undefined,
      { ...assistantConsent, decision: "refused" },
    );
    await render(f.fixture);
    button(f.root, entry).click();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.root.querySelector(".voice-controls")).toBeNull();
    expect(f.root.querySelector("assistant-welcome")).toBeNull();
    button(f.root, "Eliminar conversación").click();
    await render(f.fixture);
    button(f.root, "Confirmar eliminación").click();
    await render(f.fixture);
    expect(f.callsTo("assistant.deleteConversation")).toHaveLength(1);
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    f.workspace.minimize();
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.querySelector("assistant-consent-screen")).not.toBeNull();
  });

  it("waits for one confirmed consent save before exposing the composer and never sends or captures on acceptance", async () => {
    const saved = deferred<AssistantConsentState>();
    const f = setup(
      {
        "assistant.configuration": () => externalConfiguration,
        "assistant.decideConsent": () => saved.promise,
      },
      chat.id,
      true,
      undefined,
      undecidedConsent,
    );
    await render(f.fixture);
    const accept = button(f.root, "Permitir y abrir asistente");
    accept.click();
    accept.click();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.decideConsent")).toHaveLength(1),
    );
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.root.textContent).toContain("Guardando decisión");
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    saved.resolve(assistantConsent);
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).not.toBeNull();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
  });

  it("reconciles an uncertain accepted decision by explicit read rather than retrying the write", async () => {
    let state = undecidedConsent;
    const f = setup({
      "assistant.configuration": () => externalConfiguration,
      "assistant.consent": () => state,
      "assistant.decideConsent": () => {
        state = assistantConsent;
        return rpcFailure();
      },
    });
    await render(f.fixture);
    button(f.root, "Permitir y abrir asistente").click();
    await render(f.fixture);
    expect(button(f.root, "Permitir y abrir asistente").disabled).toBe(true);
    expect(f.root.querySelector("textarea")).toBeNull();
    f.workspace.minimize();
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).toBeNull();
    button(f.root, "Comprobar decisión guardada").click();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).not.toBeNull();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
    expect(f.stream).not.toHaveBeenCalled();
  });

  it("does not carry the previous account's permission or draft into a new account", async () => {
    const f = setup({ "assistant.configuration": () => externalConfiguration });
    await render(f.fixture);
    compose(f, "Borrador privado");
    f.setConsent(undecidedConsent);
    f.credentials.accept({ ...principal, userId: "owner-b" }, "second-token");
    await render(f.fixture);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.querySelector("assistant-consent-screen")).not.toBeNull();
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.root.textContent).not.toContain("Borrador privado");
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
  });

  it("can reconcile uncertain acceptance after a previously confirmed refusal without a second write", async () => {
    let state = undecidedConsent;
    const f = setup({
      "assistant.configuration": () => externalConfiguration,
      "assistant.consent": () => state,
      "assistant.decideConsent": (input) => {
        state = {
          ...assistantConsent,
          decision: input.decision,
          revision: input.expectedRevision + 1,
        };
        return input.decision === "accepted" ? rpcFailure() : state;
      },
    });
    await render(f.fixture);
    button(f.root, "Ahora no").click();
    await render(f.fixture);
    expect(f.workspace.opened()).toBe(false);
    f.workspace.open();
    await render(f.fixture);
    button(f.root, "Permitir y abrir asistente").click();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).toBeNull();
    button(f.root, "Comprobar decisión guardada").click();
    await render(f.fixture);
    expect(f.root.querySelector("textarea")).not.toBeNull();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(2);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
  });

  it("shows newly required consent on reopening even when an older demo configuration is still mounted", async () => {
    const f = setup({}, chat.id, false, undefined, {
      ...undecidedConsent,
      required: false,
    });
    await render(f.fixture);
    compose(f, "Un borrador antes del cambio de configuración");
    expect(button(f.root, "Enviar pregunta").disabled).toBe(false);
    f.workspace.minimize();
    await render(f.fixture);
    f.setConsent(undecidedConsent);
    f.workspace.open();
    await render(f.fixture);
    expect(f.root.querySelector("assistant-consent-screen")).not.toBeNull();
    expect(f.root.querySelector("textarea")).toBeNull();
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
  });

  it("scrolls only the message pane once per answer and never follows deltas or source updates", async () => {
    const finish = deferred<void>();
    const f = setup();
    let receive: ((event: AssistantEvent) => void) | undefined;
    f.stream.mockImplementationOnce(
      async (_owner, input, _signal, callback) => {
        receive = callback;
        callback({ type: "turn", turn: turn(input) });
        await finish.promise;
      },
    );
    await render(f.fixture);
    const messages = f.root.querySelector<HTMLElement>(".chat-messages");
    if (!messages) throw new Error("Missing message scroller");
    let scrollTop = 40;
    const scroll = vi.fn((value: number) => {
      scrollTop = value;
    });
    Object.defineProperty(messages, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: scroll,
    });
    vi.spyOn(messages, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 400, 400),
    );
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    const answer = messages.querySelector<HTMLElement>(".assistant-message");
    if (!answer) throw new Error("Missing streamed answer");
    vi.spyOn(answer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 300, 400, 80),
    );
    receive?.({ type: "delta", text: "Inicio" });
    await render(f.fixture);
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith(240);
    expect(f.root.querySelector(".chat-surface")?.scrollTop).toBe(0);
    expect(f.root.querySelector(".assistant")?.scrollTop).toBe(0);
    receive?.({ type: "delta", text: " Continuación extensa" });
    receive?.({ type: "source", source: assistantSource() });
    await render(f.fixture);
    f.workspace.minimize();
    f.workspace.open();
    await render(f.fixture);
    expect(scroll).toHaveBeenCalledOnce();
    const jump = button(f.root, "Ir al último mensaje");
    expect(jump.textContent?.trim()).toBe("");
    expect(jump.querySelector("app-icon")).not.toBeNull();
    expect(
      f.root
        .querySelector(".chat-composer .chat-status")
        ?.getAttribute("aria-live"),
    ).toBe("polite");
    Object.defineProperty(messages, "scrollHeight", {
      configurable: true,
      value: 1200,
    });
    jump.click();
    await render(f.fixture);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(1200);
    expect(f.root.querySelector(".chat-surface")?.scrollTop).toBe(0);
    finish.resolve();
    await render(f.fixture);
  });

  it("distinguishes disabled, failed-history and invalid-link states without sending a question", async () => {
    const f = setup(
      {
        "assistant.configuration": () => ({ ...configuration, enabled: false }),
        "assistant.conversations": () => rpcFailure(),
      },
      "invalid",
    );
    await render(f.fixture);
    expect(f.root.textContent).toContain("no es válido");
    expect(f.root.textContent).toContain("no está configurado");
    expect(button(f.root, "Enviar pregunta").disabled).toBe(true);
    expect(f.callsTo("assistant.conversations")).toHaveLength(1);
    expect(f.root.textContent).toContain("No pudimos cargar el historial");
    expect(f.stream).not.toHaveBeenCalled();
  });
});

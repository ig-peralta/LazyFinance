import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import type {
  AssistantConversation,
  AssistantEvent,
  AssistantSend,
  AssistantTurn,
} from "@lazyfinance/contracts";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
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
) {
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
  vi.spyOn(AssistantVoiceClient.prototype, "configuration").mockResolvedValue({
    enabled: voiceEnabled,
  });
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
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
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
      const launcher = f.root.querySelector<HTMLButtonElement>(
        ".assistant-launcher",
      );
      expect(launcher?.hidden).toBe(false);
      expect(document.activeElement).toBe(launcher);
      expect(f.stream).not.toHaveBeenCalled();
    } finally {
      container.remove();
      f.root.remove();
    }
  });

  it("does not disclose a question after acknowledgement is withdrawn during deferred text conversation creation, even if reaccepted", async () => {
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
    const consent = f.root.querySelector<HTMLInputElement>(
      ".processing-consent input",
    );
    if (!consent) throw new Error("Missing processing acknowledgement");
    consent.click();
    compose(f, "Una pregunta que no debe enviarse");
    button(f.root, "Enviar pregunta").click();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    consent.click();
    consent.click();
    created.resolve(chat);
    await render(f.fixture);
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.microphone).not.toHaveBeenCalled();
    expect(f.callsTo("assistant.createConversation")).toHaveLength(1);
  });

  it.each([
    "cancel",
    "acknowledgement",
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
    const consent = f.root.querySelector<HTMLInputElement>(
      ".processing-consent input",
    );
    if (!consent) throw new Error("Missing acknowledgement");
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    f.fixture.detectChanges();
    button(f.root, "Conversar por voz").click();
    f.fixture.detectChanges();
    button(f.root, "Entiendo, iniciar micrófono").click();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.createConversation")).toHaveLength(1),
    );
    if (reason === "cancel") button(f.root, "Cancelar voz").click();
    if (reason === "acknowledgement") {
      consent.checked = false;
      consent.dispatchEvent(new Event("change"));
    }
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

  it("requires separate before-processing acknowledgement and keeps provider identity outside the conversation", async () => {
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
    expect(button(f.root, "Enviar pregunta").disabled).toBe(true);
    const disclosure = f.root.querySelector(".processing-disclosure");
    expect(disclosure?.textContent).toContain("configured-model");
    expect(f.root.querySelector(".chat-messages")?.textContent).not.toContain(
      "configured-model",
    );
    const consent = f.root.querySelector<HTMLInputElement>(
      ".processing-consent input",
    );
    if (!consent) throw new Error("Missing separate consent");
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    f.fixture.detectChanges();
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    expect(f.stream).toHaveBeenCalledOnce();
  });

  it("anchors a new answer once and never follows deltas or source updates", async () => {
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
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    compose(f);
    button(f.root, "Enviar pregunta").click();
    await render(f.fixture);
    receive?.({ type: "delta", text: "Inicio" });
    await render(f.fixture);
    expect(scroll).toHaveBeenCalledOnce();
    receive?.({ type: "delta", text: " Continuación extensa" });
    await render(f.fixture);
    f.workspace.minimize();
    f.workspace.open();
    await render(f.fixture);
    expect(scroll).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain("Ir al último mensaje");
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

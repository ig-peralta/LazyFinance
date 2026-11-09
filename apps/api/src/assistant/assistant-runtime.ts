import type {
  AssistantReadName,
  AssistantSource,
  FinancialAction,
  FinancialReadName,
} from "@lazyfinance/contracts";
import {
  FinancialActionIdSchema,
  FinancialActionInputSchema,
  FinancialActionSchema,
} from "@lazyfinance/contracts";
import type { LanguageModel, ModelMessage, ToolSet } from "ai";
import { isStepCount, streamText, tool } from "ai";
import { z } from "zod";
import type { EnvironmentService } from "../environment/environment.service";

export const ASSISTANT_RUNTIME = Symbol("ASSISTANT_RUNTIME");
export interface AssistantRuntimeInput {
  instructions: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  read: (name: AssistantReadName, input: unknown) => Promise<AssistantSource>;
  propose?: (input: unknown) => Promise<FinancialAction>;
  actionStatus?: (id: string) => Promise<FinancialAction>;
  delta: (text: string) => Promise<void>;
}
export interface AssistantRuntime {
  run(input: AssistantRuntimeInput): Promise<{ complete: boolean }>;
}

export async function assistantModel(
  environment: EnvironmentService,
  fetch?: typeof globalThis.fetch,
): Promise<LanguageModel> {
  const model = environment.get("ASSISTANT_MODEL");
  if (!model) throw new Error("Assistant model is not configured");
  const apiKey = environment.get("ASSISTANT_API_KEY");
  switch (environment.get("ASSISTANT_PROVIDER")) {
    case "openai":
      return (await import("@ai-sdk/openai")).createOpenAI({ apiKey, fetch })(
        model,
      );
    case "anthropic":
      return (await import("@ai-sdk/anthropic")).createAnthropic({
        apiKey,
        fetch,
      })(model);
    case "google":
      return (await import("@ai-sdk/google")).createGoogleGenerativeAI({
        apiKey,
        fetch,
      })(model);
    case "openai-compatible":
      return (await import("@ai-sdk/openai-compatible")).createOpenAICompatible(
        {
          name: "configured-compatible",
          baseURL: environment.get("ASSISTANT_BASE_URL") ?? "",
          apiKey,
          fetch,
        },
      )(model);
    default:
      throw new Error("Assistant provider is disabled");
  }
}

export class AiSdkAssistantRuntime implements AssistantRuntime {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly definitions: Partial<
      Record<AssistantReadName, { description: string; inputSchema: z.ZodType }>
    >,
    private readonly loadModel: (
      environment: EnvironmentService,
    ) => Promise<LanguageModel> = assistantModel,
  ) {}

  async run(input: AssistantRuntimeInput) {
    const tools: ToolSet = {};
    for (const [name, definition] of Object.entries(this.definitions)) {
      tools[name] = tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: (args) => input.read(name as AssistantReadName, args),
      });
    }
    const propose = input.propose;
    if (propose)
      tools.preparar_accion_financiera = tool({
        description:
          "Prepara una propuesta validada, SIN ejecutarla. Requiere el botón de aprobación en la app. Usa etiquetas/IDs consultados o declara newTags explícitamente. No puedes aprobar, ejecutar ni cancelar propuestas con esta herramienta.",
        inputSchema: FinancialActionInputSchema,
        outputSchema: FinancialActionSchema,
        execute: (args) => propose(args.action),
      });
    const actionStatus = input.actionStatus;
    if (actionStatus)
      tools.consultar_estado_accion = tool({
        description:
          "Lee el estado real de una propuesta de esta conversación. Solo status:applied y sus results prueban ejecución; proposed no significa creado. Reconsulta antes de afirmar un resultado histórico.",
        inputSchema: FinancialActionIdSchema,
        outputSchema: FinancialActionSchema,
        execute: (args) => actionStatus(args.id),
      });
    const response = streamText({
      model: await this.loadModel(this.environment),
      instructions: input.instructions,
      messages: input.messages satisfies ModelMessage[],
      tools,
      stopWhen: isStepCount(6),
      maxOutputTokens: 3000,
      maxRetries: 0,
      streamRetries: 0,
      toolCallConcurrency: 1,
      abortSignal: input.signal,
      timeout: { totalMs: 60_000, chunkMs: 20_000, toolMs: 15_000 },
      telemetry: {
        isEnabled: false,
        recordInputs: false,
        recordOutputs: false,
      },
      onError: () => {},
    });
    for await (const event of response.fullStream) {
      input.signal.throwIfAborted();
      if (event.type === "text-delta") await input.delta(event.text);
      if (event.type === "error")
        throw new Error("Assistant generation failed");
    }
    return { complete: (await response.finishReason) === "stop" };
  }
}

/** Explicit offline development aid, never represented as a live language model. */
export class DemonstrationAssistantRuntime implements AssistantRuntime {
  async run(input: AssistantRuntimeInput) {
    input.signal.throwIfAborted();
    const question = input.messages.at(-1)?.content.toLowerCase() ?? "";
    const name: FinancialReadName = /ingreso|sueldo/.test(question)
      ? "consultar_ingresos"
      : /compar|anterior/.test(question)
        ? "comparar_gastos_mensuales"
        : /presupuesto/.test(question)
          ? "consultar_avance_presupuestos"
          : /meta|ahorr/.test(question)
            ? "consultar_presupuestos_y_metas"
            : /gast|compr/.test(question)
              ? "consultar_resumen_gastos_mensuales"
              : "consultar_saldos_cuentas";
    const source = await input.read(name, {});
    await input.delta(
      source.status === "available"
        ? `Consulta de demostración: ${source.title}.\n\nPuedes revisar los datos consultados en la tarjeta adjunta y abrir su sección. Esta demostración no usa un modelo de IA ni interpreta preguntas complejas. Los ingresos esperados no son dinero disponible y una meta declarada no es ahorro medido.`
        : "No pude consultar esta información. No asumiré que los importes son cero.",
    );
    return { complete: true };
  }
}

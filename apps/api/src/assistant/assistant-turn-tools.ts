import {
  type AssistantEvent,
  type AssistantReadName,
  AssistantReadNameSchema,
  type AssistantSource,
  AssistantSourceSchema,
  type FinancialAction,
} from "@lazyfinance/contracts";
import type { ActionsService } from "../actions/actions.service";
import type { FinancialReads } from "./financial-reads";

/** The same owned, bounded financial authority for text and native voice turns. */
export class AssistantTurnTools {
  readonly sources: AssistantSource[] = [];
  readonly actions: FinancialAction[] = [];
  observedReceipt = false;
  private calls = 0;
  private proposals = 0;
  private sourceBytes = 0;

  constructor(
    private readonly owner: string,
    private readonly conversationId: string,
    private readonly turnId: string,
    private readonly reads: FinancialReads,
    private readonly commands: ActionsService,
    private readonly signal: AbortSignal,
    private readonly emit: (event: AssistantEvent) => Promise<void>,
  ) {}

  async read(name: AssistantReadName, raw: unknown) {
    this.signal.throwIfAborted();
    const ordinal = ++this.calls;
    if (ordinal > 8) throw new Error("Tool budget exhausted");
    const validName = AssistantReadNameSchema.parse(name);
    const definition = this.reads.tools[validName];
    await this.emit({
      type: "status",
      text: `Consultando ${definition.title.toLowerCase()}…`,
    });
    let data: AssistantSource["data"] = null;
    let status: AssistantSource["status"] = "available";
    let note =
      "Datos guardados de LazyFinance. La hora de consulta no equivale a la última actualización bancaria. Revisa los períodos, cortes, estimaciones y cobertura del resultado.";
    let period: string | null = null;
    let recordId: string | null = null;
    try {
      const args = definition.inputSchema.parse(raw);
      if (
        typeof args === "object" &&
        args &&
        "month" in args &&
        typeof args.month === "string"
      )
        period = args.month;
      data = await definition.execute(this.owner, args);
      this.signal.throwIfAborted();
      if (
        args &&
        typeof args === "object" &&
        "id" in args &&
        typeof args.id === "string"
      )
        recordId = args.id;
      const bytes = Buffer.byteLength(JSON.stringify(data));
      if (bytes > 24_000 || this.sourceBytes + bytes > 64_000) {
        status = "limited";
        data = null;
        note =
          "El resultado supera el límite del asistente. Acota la consulta o abre la sección original; no es un resultado completo ni equivale a cero.";
      } else this.sourceBytes += bytes;
    } catch {
      this.signal.throwIfAborted();
      status = "unavailable";
      data = null;
      note =
        "No se pudo consultar esta fuente con esos parámetros. Puede faltar información o acceso al registro. No asumas importes cero ni inventes datos.";
    }
    const source = AssistantSourceSchema.parse({
      id: `F${ordinal}`,
      tool: validName,
      title: definition.title,
      status,
      queriedAt: new Date().toISOString(),
      month: period,
      path: definition.path,
      recordId,
      note,
      data,
    });
    this.sources.push(source);
    await this.emit({ type: "source", source });
    return source;
  }

  async propose(value: unknown) {
    this.signal.throwIfAborted();
    if (++this.proposals > 4) throw new Error("Proposal budget exhausted");
    const action = await this.commands.prepare(
      this.owner,
      this.conversationId,
      this.turnId,
      value,
    );
    // Retain a confirmed prepared proposal even if cancellation arrived in flight.
    if (!this.actions.some((existing) => existing.id === action.id))
      this.actions.push(action);
    this.signal.throwIfAborted();
    await this.emit({ type: "action", action });
    return action;
  }

  async actionStatus(id: string) {
    this.signal.throwIfAborted();
    if (++this.calls > 8) throw new Error("Tool budget exhausted");
    const action = await this.commands.get(this.owner, id);
    if (action.conversationId !== this.conversationId)
      throw new Error("Action is not part of this conversation");
    this.signal.throwIfAborted();
    this.observedReceipt ||=
      action.status === "applied" && action.results.length > 0;
    return action;
  }

  grounded(text: string) {
    const available = this.sources.filter(
      (source) => source.status === "available",
    );
    return (
      !!text.trim() &&
      ![...text.matchAll(/\[F(\d+)\]/g)].some(
        (match) => !available.some((source) => source.id === `F${match[1]}`),
      ) &&
      (available.length > 0 ||
        this.actions.length > 0 ||
        this.observedReceipt ||
        !/\d/.test(text.replace(/\[F\d+\]/g, "")))
    );
  }
}

import {
  type FinancialAction,
  type FinancialActionRequest,
  FinancialActionRequestSchema,
} from "@lazyfinance/contracts";
import { decimalInput, formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";

export const actionLabels: Record<
  FinancialActionRequest["kind"],
  { title: string; approve: string }
> = {
  create_budget: { title: "Crear presupuesto", approve: "Crear presupuesto" },
  create_savings_goal: { title: "Crear meta de ahorro", approve: "Crear meta" },
  create_tag: { title: "Crear etiqueta", approve: "Guardar etiqueta" },
  update_tag: { title: "Editar etiqueta", approve: "Guardar cambios" },
  archive_tag: { title: "Archivar etiqueta", approve: "Archivar etiqueta" },
  tag_movement: {
    title: "Cambiar etiqueta del movimiento",
    approve: "Aplicar etiqueta",
  },
  reset_movement_tag: {
    title: "Restablecer decisión del movimiento",
    approve: "Dejar sin revisar",
  },
};
export interface ActionFields {
  name: string;
  amount: string;
  color: string;
  noColor: boolean;
  period: "monthly" | "yearly" | "fixed" | "lifetime";
  start: string;
  end: string;
  tagIds: string[];
  newTags: string;
  newTagColors: Record<string, string | null>;
  tagId: string;
}

export function actionFields(action: FinancialAction): ActionFields {
  const request = action.request;
  const goal =
    request.kind === "create_budget"
      ? request.budget
      : request.kind === "create_savings_goal"
        ? request.goal
        : undefined;
  const tag =
    request.kind === "create_tag"
      ? request.tag
      : request.kind === "update_tag"
        ? {
            ...action.context.tags.find((tag) => tag.id === request.tag.id),
            ...request.tag,
          }
        : undefined;
  return {
    name: goal?.name ?? tag?.name ?? "",
    amount: goal?.amount ?? "",
    color: tag?.color ?? "#78966a",
    noColor: !tag?.color,
    period: goal?.schedule.period ?? "monthly",
    start:
      goal?.schedule && "startDate" in goal.schedule
        ? goal.schedule.startDate
        : "",
    end: goal?.schedule.period === "fixed" ? goal.schedule.endDate : "",
    tagIds: goal?.tagIds ?? [],
    newTags: goal?.newTags.map((tag) => tag.name).join("\n") ?? "",
    newTagColors: Object.fromEntries(
      goal?.newTags.map((tag) => [tag.name, tag.color]) ?? [],
    ),
    tagId: request.kind === "tag_movement" ? (request.tagId ?? "") : "",
  };
}

export function editedAction(action: FinancialAction, fields: ActionFields) {
  const request = action.request;
  if (
    request.kind === "create_budget" ||
    request.kind === "create_savings_goal"
  ) {
    const schedule =
      fields.period === "lifetime"
        ? { period: "lifetime" }
        : fields.period === "fixed"
          ? { period: "fixed", startDate: fields.start, endDate: fields.end }
          : { period: fields.period, startDate: fields.start };
    const goal = {
      name: fields.name,
      amount: decimalInput(fields.amount),
      tagIds: fields.tagIds,
      newTags: fields.newTags
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({
          name,
          color: fields.newTagColors[name] ?? null,
        })),
      schedule,
    };
    return FinancialActionRequestSchema.safeParse(
      request.kind === "create_budget"
        ? { kind: request.kind, budget: goal }
        : { kind: request.kind, goal },
    );
  }
  return FinancialActionRequestSchema.safeParse(
    request.kind === "create_tag"
      ? {
          kind: request.kind,
          tag: {
            name: fields.name,
            color: fields.noColor ? null : fields.color,
          },
        }
      : request.kind === "update_tag"
        ? {
            kind: request.kind,
            tag: {
              id: request.tag.id,
              name: fields.name,
              color: fields.noColor ? null : fields.color,
            },
          }
        : request.kind === "tag_movement"
          ? { ...request, tagId: fields.tagId || null }
          : request,
  );
}

function colorDetail(label: string, color: string | null) {
  return { label, value: color ? "Color personalizado" : "Sin color", color };
}

export function actionDetails(action: FinancialAction) {
  const request = action.request;
  const rows: { label: string; value: string; color?: string | null }[] = [];
  const notes: string[] = [];
  const tagName = (id: string) =>
    action.context.tags.find((tag) => tag.id === id)?.name ??
    "Etiqueta no disponible";
  if (
    request.kind === "create_budget" ||
    request.kind === "create_savings_goal"
  ) {
    const goal =
      request.kind === "create_budget" ? request.budget : request.goal;
    const period = {
      monthly: "Mensual",
      yearly: "Anual",
      lifetime: "Acumulada, sin reinicio",
      fixed: "Fechas definidas",
    }[goal.schedule.period];
    rows.push(
      { label: "Nombre", value: goal.name },
      {
        label: request.kind === "create_budget" ? "Límite CLP" : "Objetivo CLP",
        value: formatClp(goal.amount),
      },
      { label: "Período", value: period },
    );
    if ("startDate" in goal.schedule)
      rows.push({ label: "Desde", value: goal.schedule.startDate });
    if (goal.schedule.period === "fixed")
      rows.push({ label: "Hasta, incluido", value: goal.schedule.endDate });
    rows.push({
      label: "Etiquetas",
      value: [
        ...goal.tagIds.map(tagName),
        ...goal.newTags.map(
          (tag) =>
            `${tag.name} (${action.context.tags.some((existing) => existing.name === tag.name) ? "existente" : "nueva"})`,
        ),
      ].join(", "),
    });
    for (const tag of goal.newTags) {
      const existing = action.context.tags.find(
        (value) => value.name === tag.name,
      );
      rows.push(
        colorDetail(
          `Color de ${tag.name}`,
          existing ? existing.color : tag.color,
        ),
      );
    }
    notes.push(
      request.kind === "create_budget"
        ? "El presupuesto es un límite de planificación: no reserva dinero. Puede compartir compras con otros presupuestos."
        : "La meta no mueve dinero ni crea aportes. Su avance se mide con los movimientos de las etiquetas seleccionadas; puede superponerse con otras metas.",
    );
    if (goal.newTags.length)
      notes.push(
        "Las etiquetas nuevas y el objetivo se guardan juntos o no se guarda ninguno. Los nombres activos existentes se reutilizan sin cambiar su color.",
      );
  } else if (request.kind === "create_tag") {
    const existing = action.context.tags.find(
      (tag) => tag.name === request.tag.name,
    );
    rows.push(
      { label: "Nombre", value: request.tag.name },
      colorDetail("Color", existing ? existing.color : request.tag.color),
    );
    if (existing)
      notes.push(
        "Esta etiqueta ya existe: se reutilizará sin cambiar su color.",
      );
  } else if (request.kind === "update_tag" || request.kind === "archive_tag") {
    const id = request.kind === "update_tag" ? request.tag.id : request.id;
    const previous = action.context.tags.find((tag) => tag.id === id);
    rows.push({
      label: "Etiqueta actual",
      value: previous?.name ?? "No disponible",
    });
    if (previous) rows.push(colorDetail("Color actual", previous.color));
    if (request.kind === "update_tag") {
      if (request.tag.name !== undefined)
        rows.push({ label: "Nuevo nombre", value: request.tag.name });
      if (request.tag.color !== undefined)
        rows.push(colorDetail("Nuevo color", request.tag.color));
      notes.push(
        "El nombre y color cambian también en las referencias históricas; no se cambian importes ni asignaciones.",
      );
    } else
      notes.push(
        "Se conservará en movimientos e historial, pero no podrá seleccionarse para nuevas asignaciones ni reglas.",
      );
  } else {
    const movement = action.context.movement;
    rows.push(
      {
        label: "Movimiento",
        value:
          movement?.merchant || movement?.description || "Movimiento guardado",
      },
      {
        label: "Importe CLP",
        value: movement ? formatClp(movement.amount) : "—",
      },
      {
        label: "Fecha",
        value: movement ? formatDate(new Date(movement.bookedAt)) : "—",
      },
      {
        label: "Decisión actual",
        value:
          movement?.tag?.name ||
          (movement?.tagDecisionOrigin === "manual"
            ? "Sin etiqueta, decisión manual"
            : "Sin revisar"),
      },
      {
        label: "Nueva decisión",
        value:
          request.kind === "tag_movement"
            ? request.tagId
              ? tagName(request.tagId)
              : "Sin etiqueta, decisión manual"
            : "Sin revisar",
      },
    );
    if (movement?.tagDecisionOrigin === "manual")
      notes.push("Estás sustituyendo una decisión manual existente.");
    notes.push(
      request.kind === "reset_movement_tag"
        ? "La decisión queda sin revisar y podrá recibir sugerencias o reglas aprobadas."
        : "Será una decisión manual, protegida frente a la clasificación automática.",
    );
    notes.push(
      "Etiquetar puede cambiar gastos y avance de metas, pero no confirma ingresos, identifica transferencias internas ni cambia hechos bancarios.",
    );
  }
  return { rows, notes };
}

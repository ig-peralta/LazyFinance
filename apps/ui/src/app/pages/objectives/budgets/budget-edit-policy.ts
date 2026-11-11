import type { BudgetDetail } from "@lazyfinance/contracts";

export function budgetEditPolicy(
  detail: BudgetDetail | null,
  now = Date.now(),
) {
  const definition = detail?.pending ?? detail?.effective ?? null;
  const start = detail?.effective ?? detail?.pending;
  const started = !!start?.startDate && Date.parse(start.startDate) <= now;
  const unsupported =
    !!definition &&
    (definition.kind !== "time_based" ||
      (definition.isRecurring &&
        definition.period !== "monthly" &&
        definition.period !== "yearly"));
  const reason = detail?.archivedAt
    ? "Archivado: conserva su historial, sin nuevas ediciones."
    : unsupported
      ? "Esta configuración histórica no admite edición con los períodos disponibles."
      : started && !definition?.isRecurring
        ? "Un presupuesto de fechas fijas ya iniciado no se puede editar. Puedes archivarlo."
        : null;
  return { definition, started, unsupported, locked: reason !== null, reason };
}

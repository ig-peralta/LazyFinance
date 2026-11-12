import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

// Legacy persisted protocol values only; active assistant/MCP tool names are English.
const oldToNewSourceTools = {
  consultar_saldos_cuentas: "get_account_balances",
  consultar_movimientos_recientes: "get_recent_transactions",
  consultar_presupuestos_y_metas: "get_budgets_and_goals",
  consultar_avance_presupuestos: "get_budget_progress",
  consultar_resumen_gastos_mensuales: "get_monthly_spending_summary",
  comparar_gastos_mensuales: "compare_monthly_spending",
  consultar_ingresos: "get_income_summary",
  consultar_avance_ahorro: "get_savings_progress",
  consultar_aportes_ahorro: "get_savings_contributions",
  consultar_compras_del_gasto: "get_spending_evidence",
  consultar_compras_presupuesto: "get_budget_spending_evidence",
  consultar_etiquetas: "list_tags",
  buscar_movimientos: "search_transactions",
  consultar_movimiento: "get_transaction_details",
} as const;

async function renameSourceTools(
  db: MigrationDatabase,
  names: Record<string, string>,
) {
  await sql`ALTER TABLE assistant.conversation NO FORCE ROW LEVEL SECURITY`.execute(
    db,
  );
  try {
    const cases = Object.entries(names).map(
      ([oldName, newName]) => sql`
      WHEN ${oldName} THEN jsonb_set(
        source_entry.value,
        '{tool}',
        to_jsonb(${newName}::text),
        false
      )`,
    );
    const oldNames = Object.keys(names).map((name) => sql`${name}`);

    await sql`
    UPDATE assistant.conversation AS conversation
    SET turns = (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(turn_entry.value->'sources') = 'array' THEN
            jsonb_set(
              turn_entry.value,
              '{sources}',
              COALESCE(
                (
                  SELECT jsonb_agg(
                    CASE source_entry.value->>'tool'
                      ${sql.join(cases, sql` `)}
                      ELSE source_entry.value
                    END
                    ORDER BY source_entry.ordinality
                  )
                  FROM jsonb_array_elements(turn_entry.value->'sources')
                    WITH ORDINALITY AS source_entry(value, ordinality)
                ),
                '[]'::jsonb
              ),
              false
            )
          ELSE turn_entry.value
        END
        ORDER BY turn_entry.ordinality
      )
      FROM jsonb_array_elements(conversation.turns)
        WITH ORDINALITY AS turn_entry(value, ordinality)
    )
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(conversation.turns) AS turn_entry(value)
      CROSS JOIN LATERAL jsonb_array_elements(turn_entry.value->'sources')
        AS source_entry(value)
      WHERE source_entry.value->>'tool' IN (${sql.join(oldNames, sql`, `)})
    )
    `.execute(db);
  } finally {
    await sql`ALTER TABLE assistant.conversation FORCE ROW LEVEL SECURITY`.execute(
      db,
    );
  }
}

export async function up(db: MigrationDatabase) {
  await renameSourceTools(db, oldToNewSourceTools);
}

export async function down(db: MigrationDatabase) {
  await renameSourceTools(
    db,
    Object.fromEntries(
      Object.entries(oldToNewSourceTools).map(([oldName, newName]) => [
        newName,
        oldName,
      ]),
    ),
  );
}

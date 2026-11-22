import { McpStrategy } from "@rekog/mcp-nest";
import { mcpHttpTransport } from "./mcp.transport";

export const mcpStrategy = new McpStrategy({
  name: "lazyfinance",
  version: "1.0.0",
  title: "LazyFinance · Finanzas personales",
  description:
    "Consultas financieras y cambios acotados dentro de permisos OAuth explícitos: presupuestos, metas y etiquetas. No mueve dinero.",
  instructions:
    "Consulta solo los datos del usuario autenticado. Para mes pasado indica el YYYY-MM anterior en America/Santiago; últimos 30 días es un rango distinto. Los montos son CLP expresados como cadenas decimales. Saldos bancarios y su frescura no son lo mismo que ingresos, gastos o dinero disponible garantizado. Los ingresos esperados abarcan el mes entero; los recibidos son créditos confirmados. No los sumes ni trates créditos sin clasificar como ingresos. Recuperaciones se atribuyen a la compra original. consultar_diferencia_ingresos_gastos_mes no demuestra cuánto dinero se ahorró ni un flujo de caja puro. consultar_aportes_mensuales_meta mide la asignación de UNA meta en el mes; no sumes metas solapadas. consultar_total_presupuestado_mes solo tiene total si presupuestos mensuales con la misma ventana tienen etiquetas disjuntas. Presupuestos anuales/fijos no se suman como un mes. Cargos recurrentes observados son candidatos, no suscripciones verificadas ni cobros próximos. Una comparación parcial no es proyección al cierre.",
  transports: [mcpHttpTransport],
});

import { McpStrategy } from '@rekog/mcp-nest';
import { mcpHttpTransport } from './mcp.transport';

export const mcpStrategy = new McpStrategy({
  name: 'lazyfinance',
  version: '1.0.0',
  title: 'LazyFinance · Finanzas personales',
  description:
    'Herramientas de consulta de cuentas, movimientos, gastos y presupuestos personales.',
  instructions:
    'Consulta solo los datos del usuario autenticado. Para gastos y presupuestos usa un mes YYYY-MM; si el usuario no indica mes, las herramientas usan el mes actual en America/Santiago. Los montos son CLP expresados como cadenas decimales. Usa los saldos de las cuentas para hablar del dinero disponible; los resúmenes y comparaciones mensuales muestran solo gastos. Cada movimiento tiene como máximo una etiqueta: los grupos de gasto son exclusivos, pero el total también incluye gastos sin etiqueta. Un presupuesto puede seleccionar varias etiquetas y cuenta cada movimiento elegible una vez. El avance de presupuestos no mide el progreso de metas de ahorro. Las comparaciones del mes actual enfrentan períodos parciales equivalentes.',
  transports: [mcpHttpTransport],
});

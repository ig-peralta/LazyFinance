# Sprint B — Plan y evidencias de flujos conectados

**Versión B · reconstrucción documental.** Cierre de desarrollo del **9 de
noviembre de 2026** sobre [`1cda504`](https://github.com/ig-peralta/LazyFinance/commit/1cda5042a6ecaacca8ce414818c549f85a2f9bd7).
La matriz cruza [J6–J11](../../../product/user-journeys.md#stage-b---connected-financial-workflows)
con las revisiones de los seis frentes. Las pruebas con PostgreSQL descartable,
respuestas de modelo controladas, sandbox y cliente real local son evidencia
distinta; las ejecuciones de entregas anteriores mantienen su propio corte.

## Matriz de casos

| Caso | Resultado esperado | Resultado registrado | Evidencia |
| --- | --- | --- | --- |
| **J6 · Identidad y sesión** (LAZ-29) | Resolver credencial verificada a un titular interno; rechazar accesos indebidos y no aplicar una respuesta de otra sesión. | Las comprobaciones controladas de identidad y sesión pasaron. La comprobación final opcional de Firebase en vivo se omitió; no certifica la matriz real de dos usuarios. | [Cierre B](../../../planning/stage-b/closure.md#recorded-verification) · [Identidad](../../../technical/identity.md) |
| **J7 · Gestión y evidencia** (LAZ-30/31) | Editar datos propios sin cambiar hechos bancarios; reconciliar gastos, recuperaciones, avance de ahorro e ingresos con importes y períodos correctos. | En la entrega PR #31 se registraron 256 pruebas aprobadas del ejecutor API con RPC firmado y un caso Firebase omitido; persistencia registró 85 aprobadas. Las comprobaciones de UI y del contenedor estático corresponden a entregas separadas. | [PR #31](https://github.com/ig-peralta/LazyFinance/pull/31) · [Verificación B](../../../planning/stage-b/closure.md#recorded-verification) |
| **J8 · Conexión y recuperación bancaria** (LAZ-28) | Vincular y reintentar sin duplicar movimientos; conservar el último dato útil; no confundir autorización con frescura. | Se documentaron flujos sandbox de Fintoc y regresiones controladas RPC/PostgreSQL/UI. La política final de seguimiento desde el primer día se probó con datos controlados, no con una repetición sandbox en ese corte. | [PR #34](https://github.com/ig-peralta/LazyFinance/pull/34) · [Evidencia Fintoc](../../../../apps/api/src/banking/fintoc/README.md) |
| **J9 · Respuesta de texto fundamentada** (LAZ-26) | Emitir texto con fuentes propias y preservar períodos y datos incompletos; soportar interrupción y reconciliar el historial. | La canalización determinista y las comprobaciones de fuentes, navegación y estado del chat pasaron. Las pruebas omitidas de modelo en vivo no acreditan calidad de respuestas reales. | [PR #36](https://github.com/ig-peralta/LazyFinance/pull/36) · [Verificación del asistente](../../../technical/financial-assistant.md#verification-and-quality-release-gate) |
| **J10 · Aprobar la versión exacta** (PR #36) | Solo la aprobación explícita aplica el cambio; una propuesta expirada u obsoleta no altera finanzas; repetir no duplica el efecto. | Se ejercitaron siete tipos de acción, revisiones, estados expirados/obsoletos, respuestas perdidas y retención del comprobante en navegador y suites controladas. | [Verificación B](../../../planning/stage-b/closure.md#recorded-verification) · [Acciones y permisos](../../../technical/financial-assistant.md#confirmed-actions-and-independent-mcp-delegation) |
| **J11 · Delegación y revocación MCP** (LAZ-27) | Vincular permisos a titular y cliente, denegar escrituras sin alcance y rechazar uso posterior a la revocación. | Comprobaciones de protocolo con SDK 2.4.0; OpenCode 2.2.5 local comprobó lectura y revocación. Las escrituras acotadas se verificaron de forma controlada, no en toda combinación externa alojada. | [Matriz MCP](../../../technical/mcp-authorization.md#compatibility-and-verification-matrix) · [PR #35](https://github.com/ig-peralta/LazyFinance/pull/35) |

## Ejecución y decisión

El [cierre B](../../../planning/stage-b/closure.md#recorded-verification) registra
para la entrega final PR #36 **333 unitarias de API, 69 unitarias de persistencia
y 432 pruebas de UI** aprobadas. Las pruebas con servicios de esa entrega
registraron **160 integraciones de API y 36 pruebas PostgreSQL** aprobadas; se
omitieron cuatro casos condicionales de modelo en vivo y uno de Firebase. Se
registraron advertencias no fatales. El **GO** habilitó la planificación de C
con límites explícitos: no era aprobación de capacidad, despliegue de producción
ni soporte de todos los proveedores y clientes.

[Volver al índice de pruebas](README.md).

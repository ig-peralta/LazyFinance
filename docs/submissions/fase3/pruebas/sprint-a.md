# Sprint A — Plan y evidencias del núcleo financiero

**Versión A · reconstrucción documental.** La revisión del **21 de octubre de
2026** evaluó [`72f9134`](https://github.com/ig-peralta/LazyFinance/commit/72f9134)
con datos CLP de demostración, antes de la integración bancaria. La fuente del
alcance es [J1–J5](../../../product/user-journeys.md#stage-a---core-financial-understanding)
y los criterios por issue están preservados en el
[corte de A](../../../planning/snapshots/backlog-2026-11-02.md#sprint-a-stage-a--financial-core-validation).
Los importes son del conjunto sintético de la revisión, no de personas reales.

## Matriz de casos

| Caso | Resultado esperado | Resultado registrado | Evidencia |
| --- | --- | --- | --- |
| **J1 · Saldos y titularidad** (LAZ-19, LAZ-17) | Explicar cuenta corriente, ahorro y deuda de tarjeta; no tratar antigüedad desconocida ni ingreso del mes como efectivo disponible. Consultar solo datos propios. | La revisión registró saldos coherentes y resultados limitados al titular para la demostración. No era una prueba de frescura bancaria real. | [Cierre A](../../../planning/stage-a/closure.md#validation-decisions-and-gate) · [PR #9](https://github.com/ig-peralta/LazyFinance/pull/9) |
| **J2 · Gasto sin doble conteo** (LAZ-17, LAZ-21, LAZ-23) | Excluir transferencias y pagos de tarjeta internos; incluir los débitos sin etiqueta y permitir como máximo una etiqueta por movimiento. | Septiembre: CLP 1 466 100 de gasto después de excluir CLP 215 100 de débitos internos; CLP 19 700 sin etiqueta siguieron en el total. Se registró una sola etiqueta opcional. | [Reconciliación](../../../planning/stage-a/retrospective.md#evidence-and-outcome) · [PR #10](https://github.com/ig-peralta/LazyFinance/pull/10) |
| **J3 · Presupuesto y período** (LAZ-22, LAZ-15) | Comparar gasto elegible con el límite del período, sin sumar movimientos internos ni duplicar el mismo movimiento. | El presupuesto mensual de supermercado, de CLP 280 000, registró CLP 201 500 en agosto y CLP 200 400 en septiembre. La revisión no aporta un resultado desglosado de todas las variantes de recurrencia. | [Reconciliación](../../../planning/stage-a/retrospective.md#evidence-and-outcome) · [criterios de A](../../../planning/stage-a/definition-of-done.md) |
| **J4 · Meta de ahorro** (LAZ-16, LAZ-20) | Distinguir monto objetivo de avance medido; no mostrar un porcentaje sin una regla de contribución sustentada. | Aprobado como **meta declarada**. La medición de contribuciones quedó para B; no se declaró implementada en A. | [Límite del corte](../../../planning/stage-a/closure.md#interpreting-the-snapshot) · [revisión A](../../../planning/stage-a/retrospective.md#evidence-and-outcome) |
| **J5 · Ingresos esperados y recibidos** (LAZ-25) | Separar planificación, estimaciones y abonos confirmados. No identificar como ingreso cada crédito ni cambiar saldos por declarar un plan. | Septiembre: CLP 1 870 000 esperados (CLP 120 000 estimados) frente a CLP 1 772 000 recibidos. El resultado conserva ambos conceptos y sus períodos. | [Reconciliación](../../../planning/stage-a/retrospective.md#evidence-and-outcome) · [PR #11](https://github.com/ig-peralta/LazyFinance/pull/11) |

## Ejecución y decisión

La [revisión registrada](../../../planning/stage-a/retrospective.md#evidence-and-outcome)
reportó **85 pruebas de API**, incluidas cinco de integración con PostgreSQL,
y **46 de regresión de UI**, además de comprobación de tipos, compilación,
migraciones y carga repetible de datos. Son recuentos de la revisión, no
resultados separados por fila. El **GO de A** habilitó el trabajo sobre el núcleo
en B; no certificó Fintoc en vivo, un asistente ni un producto terminado.

[Volver al índice de pruebas](README.md).

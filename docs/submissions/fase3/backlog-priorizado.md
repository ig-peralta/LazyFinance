# LazyFinance — Product Backlog priorizado

**Lectura para revisión académica.** El [inventario completo del 24 de noviembre
de 2026](../../planning/snapshots/backlog-2026-11-24-stage-c-gate.md) contiene
104 registros de Linear, con título, relación padre/hijo, prioridad, responsable,
estado y fechas registradas. Es el corte de la revisión, anterior a publicar el
cierre de C; no se usa como estado actual. Esta guía ordena lo registrado y enlaza
las historias y criterios; no asigna prioridades ni cambia el tablero.

## Secuencia observada

1. **A: validar el significado de los datos.** Los saldos, transferencias, gasto,
   metas e ingresos debían explicarse con datos controlados antes de incorporar
   Fintoc. Cinco de 19 registros tenían prioridad alta, uno media y 13 no tenían
   prioridad. Las historias [J1–J5](../../product/user-journeys.md#stage-a---core-financial-understanding)
   recogen las necesidades de un titular y enlazan sus reglas e identificadores.
2. **B: reutilizar el núcleo en flujos conectados.** Tras el GO de A, seis
   líneas de trabajo abordaron backend, web, identidad, autorización MCP, banca y
   asistente. De 46 registros, uno tenía prioridad media y 45 no tenían prioridad;
   el hito y las dependencias documentan la secuencia, no un orden retrospectivo
   de importancia. Véanse [J6–J11](../../product/user-journeys.md#stage-b---connected-financial-workflows)
   y [los seis frentes](../../planning/stage-b/README.md#workstreams-from-linear).
3. **C: reducir fricción y verificar el incremento.** Se seleccionaron 34
   registros requeridos y cinco opcionales. La política de selección precedió a
   la importación automática y el asistente persistente precedió a la integración
   de voz. Las validaciones controlada y en vivo, despliegue, rendimiento, banco
   simulado, datos y seguridad antecedían al cierre LAZ-99. Véanse
   [historias J12–J21](../../product/user-journeys.md#stage-c---selected-everyday-experience-and-live-voice)
   y [dependencias del plan](../../planning/stage-c/planning.md#dependencies).

## Prioridades registradas en C

Dentro de cada fila, los números son identificadores, no una clasificación
adicional. Los padres agrupan trabajo: no se cuentan como historias distintas
en la evaluación de experiencia.

| Prioridad en el corte | Clasificación | Registros | Identificadores |
| --- | --- | ---: | --- |
| Alta | Requerida | 27 | LAZ-72, LAZ-74–78, LAZ-81, LAZ-86–100, LAZ-105–109 |
| Media | Requerida | 7 | LAZ-71, LAZ-79, LAZ-80, LAZ-82–85 |
| Media | Opcional | 1 | LAZ-101 (cotizaciones externas) |
| Baja | Opcional | 4 | LAZ-73 (padre), LAZ-102–104 (alertas, simulación de acción bancaria, WhatsApp) |

LAZ-101 conservó prioridad media pese a ser opcional. El
[cierre de C](../../planning/stage-c/closure.md#optional-outcomes) difirió las
cuatro propuestas opcionales sin promoverlas. En el corte LAZ-99 y su padre
LAZ-76 figuraban como `Todo`; la decisión quedó publicada después en
[PR #52](https://github.com/ig-peralta/LazyFinance/pull/52). El inventario
histórico no se reescribe.

## Historias y criterios de aceptación

| Historia representativa | Resultado observable | Dónde seguirla |
| --- | --- | --- |
| Como titular, quiero entender cuánto gasté sin contar mis transferencias como gasto. | Las transferencias y pagos internos no inflan el total y los gastos sin etiqueta no desaparecen. | [J2](../../product/user-journeys.md#j2---understand-actual-spending-without-double-counting-money-movements) · LAZ-17/21/23 · [evidencia A](pruebas/sprint-a.md) |
| Como titular, quiero revisar el cambio exacto que propone mi asistente antes de aplicarlo. | Solo se aplica la versión aprobada; una respuesta incierta se concilia consultando el resultado guardado. | [J10](../../product/user-journeys.md#j10---review-an-exact-proposed-change) · [PR #36](https://github.com/ig-peralta/LazyFinance/pull/36) · [evidencia B](pruebas/sprint-b.md) |
| Como titular, quiero elegir qué cuentas se importan y detectar datos desactualizados. | El sistema no incorpora cuentas nuevas sin selección; una falla no borra el último resultado confirmado. | [J12](../../product/user-journeys.md#j12---connect-once-and-control-tracked-accounts) · LAZ-86/87/90 · [evidencia C](pruebas/sprint-c.md) |

Los criterios por issue de A y B se resumen en el
[corte del 2 de noviembre](../../planning/snapshots/backlog-2026-11-02.md).
Para C, la [trazabilidad C01–C18](../../planning/stage-c/planning.md#feedback-traceability)
vincula las necesidades al trabajo seleccionado; los
[casos V01–V17](../../planning/stage-c/validation-plan.md#required-acceptance-scenarios)
definen las comprobaciones. Esto no sustituye los campos originales de Linear.

## Sprint Backlogs y retrospectivas

Cada hito de Linear corresponde a un sprint; su lista de issues es el Sprint
Backlog. Las actas documentales conservan el alcance y las limitaciones de cada
revisión. La retrospectiva A es una revisión posterior de la evidencia, no una
reunión retroactiva; la de C se apoya en la revisión escrita sin declarar una
reunión separada.

| Sprint | Inventario del sprint | Definition of Done | Retrospectiva |
| --- | --- | --- | --- |
| A · 19 | [Filas de A](../../planning/snapshots/backlog-2026-11-24-stage-c-gate.md#sprint-a-stage-a--financial-core) | [Criterios A](../../planning/stage-a/definition-of-done.md) | [Revisión A](../../planning/stage-a/retrospective.md) |
| B · 46 | [Filas de B](../../planning/snapshots/backlog-2026-11-24-stage-c-gate.md#sprint-b-stage-b--connected-product-tracks) | [Criterios B](../../planning/stage-b/definition-of-done.md) | [Revisión B](../../planning/stage-b/retrospective.md) |
| C · 39 | [Filas de C](../../planning/snapshots/backlog-2026-11-24-stage-c-gate.md#sprint-c-stage-c--expanded-experience) | [Criterios C](../../planning/stage-c/definition-of-done.md) | [Revisión C](../../planning/stage-c/retrospective.md) |

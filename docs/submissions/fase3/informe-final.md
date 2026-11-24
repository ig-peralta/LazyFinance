# LazyFinance — Informe final de cierre

**Proyecto APT · APT122 · Fase 3**

- **Equipo:** Alejandra Ñanculeo, Álvaro Díaz e Ignacio Peralta.
- **Corte:** 24 de noviembre de 2026. [Fuentes y documentación en GitHub](https://github.com/ig-peralta/LazyFinance).

## Resumen ejecutivo

LazyFinance ayuda a las personas a entender sus finanzas personales sin
reconciliar manualmente saldos y movimientos. El proyecto entrega un espacio web,
un asistente conversacional y acceso delegado para clientes compatibles con MCP
(Model Context Protocol). Las tres interfaces consultan reglas financieras
comunes y respetan el acceso de cada titular. Se aceptó el incremento de
desarrollo de la Etapa C; **no se autorizó una salida a producción**.

## Objetivo y alcance entregado

El objetivo fue pasar de movimientos dispersos a respuestas comprensibles y
rastreables: cuánto se gastó, qué consumió un presupuesto y qué ingresos se
esperaban o se recibieron. Los ejemplos y la demostración usan CLP y períodos
del calendario de Santiago. El producto hace visibles los datos incompletos o
antiguos, en vez de tratarlos como saldos actuales o importes cero.

El incremento permite consultar cuentas y movimientos, clasificar gastos y
gestionar presupuestos, metas e ingresos. La conexión bancaria permite elegir
qué cuentas sincronizar; la actualización automática de Fintoc requiere
configuración y adhesión explícita. Un banco simulado permite demostrar el
mismo flujo de importación con datos sintéticos y sincronización manual. El
asistente presenta fuentes, admite voz opcional y puede preparar cambios
acotados: **aprobar** es una acción separada del titular. El acceso MCP usa
permisos revocables; escribir requiere permisos adicionales.

No se ejecutan transferencias ni compras reales. Las cotizaciones externas,
alertas, WhatsApp y la simulación de una acción bancaria dirigida por un agente
quedaron fuera de la entrega. Esta última es distinta del banco simulado usado
para importar datos de prueba.

## Innovación

### ¿Qué problema resuelve?

Una cartola indica montos y fechas, pero no distingue por sí sola entre gasto,
transferencias propias, deuda e ingresos estimados. Para saber cómo va un
presupuesto, la persona normalmente cruza movimientos, clasifica abonos y
comprueba a mano si los períodos son comparables. El problema no es solo acceder
a los datos: es interpretarlos sin ocultar sus límites.

### ¿Qué hace diferente a la solución?

La solución comparte **un núcleo financiero con trazabilidad** entre el panel,
el asistente y aplicaciones autorizadas. Cada canal reutiliza los mismos
criterios para saldos, períodos, recuperaciones y metas, en vez de volver a
calcularlos por separado. Los adaptadores separan hechos de origen y decisiones
del titular. El asistente consulta fuentes y prepara propuestas; no elige al
titular, no tiene SQL directo y no se puede aprobar por conversación. MCP
permite reutilizar estas capacidades sin compartir la sesión de la aplicación.

### ¿Qué valor agrega?

Una persona que pregunta «¿cuánto me queda para supermercado este mes?» puede
ver el período, revisar los movimientos que cuentan y contrastar la respuesta
con el presupuesto del panel. Si falta información, la respuesta debe decirlo.
Esta trazabilidad busca reducir la reconciliación manual sin decidir por el
usuario. Una aplicación externa autorizada puede reutilizar la misma información
con permisos limitados. Reducir tiempo o mejorar decisiones es una **hipótesis
de valor**, no un resultado de un estudio con usuarios. Véase
[Innovación e interoperabilidad](../../product/innovation.md).

## Desarrollo por sprint

Se validó el núcleo financiero antes de depender de la banca externa, un cambio
respecto de la propuesta inicial. Cada etapa fue un sprint de duración variable;
el equipo usó Linear y revisión en Git sin declarar un marco Scrum formal.

| Sprint | Resultado y aprendizaje | Evidencia |
| --- | --- | --- |
| **A — Núcleo financiero** | Se reconciliaron saldos, gasto, metas e ingresos con datos CLP. Primero se fijó el significado de los movimientos; en esta etapa las metas no mostraban avance inventado. | [Cierre](../../planning/stage-a/closure.md) · [retrospectiva](../../planning/stage-a/retrospective.md) |
| **B — Flujos conectados** | Se integraron gestión web, identidad, Fintoc, asistente de texto y MCP. Separar la sesión privada del prerender público y compartir reglas financieras hizo más explícitas las responsabilidades. | [Cierre](../../planning/stage-b/closure.md) · [retrospectiva](../../planning/stage-b/retrospective.md) |
| **C — Experiencia y verificación** | Se mejoraron la selección de cuentas, accesibilidad y asistente persistente; se incorporaron voz, despliegue de desarrollo, banco simulado y validación medida. Separar las entregas hizo visibles los alcances de cada verificación. | [Cierre](../../planning/stage-c/closure.md) · [retrospectiva](../../planning/stage-c/retrospective.md) |

## Resultados comprobados y límites

- **Funcionalidad y seguridad:** los [planes por sprint](pruebas/README.md)
  enlazan los casos, resultados y revisiones probadas. En C se registraron
  640 pruebas de API, 138 de persistencia y 673 de UI aprobadas en la revisión
  de seguridad, con cinco casos condicionales en vivo omitidos por el
  automatizado. La auditoría de dependencias no quedó limpia.
- **Rendimiento:** ocho titulares sintéticos y 4 800 consultas medidas pasaron
  en tres repeticiones con **2 CPU / 4 GiB por contenedor**; las importaciones
  persistieron 49 999 movimientos de forma atómica. Con el perfil menor no
  pasaron las lecturas representativas de gasto mensual y presupuestos. No se
  extrapolan estas medidas a producción.
- **Despliegue y validación en vivo:** [GitHub Actions](https://github.com/ig-peralta/LazyFinance/actions/runs/45430055731)
  registró el despliegue de desarrollo y el acceso a los puntos públicos. El
  responsable del proyecto confirmó por separado los flujos autenticados y las
  validaciones seleccionadas en vivo; el cierre no aporta resultados individuales
  ni una matriz de versiones o dispositivos.

## Conclusión y continuidad

El proyecto demostró que las reglas financieras y sus fuentes pueden compartirse
entre interfaces sin borrar las diferencias entre consulta, propuesta y
aprobación. La [decisión de Etapa C](../../planning/stage-c/closure.md) del 24 de
noviembre acepta el cierre de desarrollo en `7ae34761`; este informe lo reúne
para la revisión académica. Antes de una salida a producción quedan pendientes
revisar dependencias e imágenes, confirmar capacidad, ensayar respaldos y
recuperación, y validar retención, costos y combinaciones de proveedores. El
[diseño de producción](../../technical/production-deployment.md) es una propuesta;
la [Definition of Done de producto](../../planning/product-definition-of-done.md)
permanece abierta.

Consúltese el [paquete de Fase 3](README.md) para la visión, el backlog, el diseño
y las pruebas completas, y el [manual técnico](../../technical/technical-manual.md)
para instalación y operación del entorno de desarrollo.

# LazyFinance — Cierre e innovación

**Proyecto APT · APT122 · Fase 3 · 24 de noviembre de 2026**

## Cierre

LazyFinance integra un panel de finanzas personales, un asistente de texto con
fuentes y voz opcional, y acceso revocable para aplicaciones compatibles con MCP.
La [revisión de la Etapa C](../../planning/stage-c/closure.md) aceptó el incremento
y su despliegue de desarrollo, **sin aprobar la salida a producción**. Las
[pruebas por sprint](pruebas/README.md) documentan los resultados y sus límites.
Antes de un lanzamiento quedan pendientes la revisión de dependencias, la
verificación de capacidad y los ensayos de recuperación.

## Innovación

### ¿Qué problema resuelve?

Una cartola lista movimientos, pero no dice cuánto queda de un presupuesto ni
si un abono es ingreso, devolución o transferencia propia. LazyFinance ayuda a
interpretar esas cifras sin que la persona tenga que cruzar los datos a mano.

### ¿Qué hace diferente a la solución?

El panel, el asistente y las aplicaciones autorizadas reutilizan un mismo núcleo
financiero y pueden mostrar los datos que respaldan sus resultados. El asistente
puede preparar una propuesta, pero no aprobarla ni ejecutarla por conversación.
El acceso delegado por MCP no comparte la sesión personal ni concede todos los
permisos de forma automática.

### ¿Qué valor agrega?

Al preguntar cuánto queda para supermercado, el titular puede comprobar el
período y seguir la cifra hasta los movimientos que la explican. Puede usar el
panel o el asistente sin perder esa trazabilidad. Reducir el tiempo de
conciliación es un beneficio esperado, no medido en un estudio con usuarios.

[Más sobre innovación e interoperabilidad](../../product/innovation.md) ·
[Índice de Fase 3](../README.md#phase-3--final-evidence)

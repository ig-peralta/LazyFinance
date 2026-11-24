# LazyFinance — Plan de pruebas y evidencias

Este anexo presenta **una matriz por sprint**, con alcance, resultado esperado,
resultado registrado y fuente. A y B se reconstruyen a partir de sus historias,
revisiones y entregas; no se presentan como planes escritos antes de ejecutar.
La versión C conserva los identificadores del plan publicado. No se repitieron
pruebas para preparar este anexo.

| Versión del anexo | Alcance | Cierre o revisión |
| --- | --- | --- |
| [Sprint A — Núcleo financiero](sprint-a.md) | J1–J5 con datos CLP controlados; API, persistencia y UI | 21 de octubre, `72f9134` |
| [Sprint B — Flujos conectados](sprint-b.md) | Gestión, identidad, banca, asistente y MCP; evidencias por entrega | 9 de noviembre, `1cda504` |
| [Sprint C — Experiencia y verificación](sprint-c.md) | V01–V17; automatización y UI, banco simulado, despliegue, rendimiento y seguridad | 24 de noviembre, `7ae34761` |

## Cómo interpretar los resultados

- **Aprobado en el alcance indicado:** consta el resultado en la fuente. Una
  prueba unitaria valida una regla aislada; una integración con persistencia
  prueba además contratos y roles de base de datos. Un navegador con respuestas
  simuladas no valida un proveedor real.
- **Parcial, fallido u omitido:** conservar el resultado y las condiciones,
  incluso cuando otra ejecución haya pasado. No se suman suites repetidas de
  distintos cortes ni se atribuyen sus recuentos al `main` actual.
- **Confirmado en la revisión:** el responsable confirmó la ejecución de los
  escenarios seleccionados para el cierre. No equivale a un registro de
  resultados por dispositivo, proveedor o sesión; no se usa para completar
  datos ausentes.

Las [instrucciones de verificación](../../../technical/development-workflow.md#verification-tiers)
distinguen pruebas sin servicios, pruebas que abren puertos locales, suites con
PostgreSQL descartable y comprobaciones en vivo. Los
[requisitos no funcionales](../../../product/non-functional-requirements.md)
definen objetivos, no certificados de cumplimiento. El
[cierre de la Etapa C](../../../planning/stage-c/closure.md#gate-assessment)
registra qué resultados se aceptaron y con qué límites.

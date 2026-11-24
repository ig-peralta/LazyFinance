# Fase 3 — Evidencias del Proyecto APT

**LazyFinance · APT122.** Recopilación para revisión académica, con corte al
**24 de noviembre de 2026**. La documentación de diseño parte de [`main` en
`815a4bda`](https://github.com/ig-peralta/LazyFinance/commit/815a4bdac447823bf644b81b3d5b6de970d2fe47).
Las pruebas conservan la fecha, el entorno y la revisión que se registraron en
cada ejecución; no se atribuyen a ese commit de documentación.

| Artefacto | Dónde revisarlo |
| --- | --- |
| Informe final de cierre, con problema, diferenciación y valor agregado | [Informe final](informe-final.md) |
| Product Vision de dos páginas | [Visión en PDF](vision-del-producto.pdf) · [fuente editable](vision-del-producto.ms) |
| Product Backlog priorizado e historias | [Backlog priorizado y trazabilidad](backlog-priorizado.md) |
| Sprint Backlog, Definition of Done y retrospectivas | [Índice por sprint](../../planning/README.md) · [cómo se lee el backlog](backlog-priorizado.md#sprint-backlogs-y-retrospectivas) |
| Documento de diseño, modelo, UML y decisiones técnicas | [Documento de diseño](documento-de-diseno.md) · [atlas de diagramas](../../diagrams/README.md) |
| Plan de pruebas y resultados por sprint | [Índice de pruebas](pruebas/README.md) · [A](pruebas/sprint-a.md) · [B](pruebas/sprint-b.md) · [C](pruebas/sprint-c.md) |
| Requisitos no funcionales y despliegue | [Requisitos y objetivos de calidad](../../product/non-functional-requirements.md) · [manual técnico](../../technical/technical-manual.md) |

El [método del equipo](../../planning/project-method.md) fue iterativo e
incremental, con prácticas ágiles y sin afirmar que se siguió Scrum formal.
Cada etapa A, B o C corresponde a un sprint. Los documentos de las fases 1 y 2
se conservan en el [índice de entregas](../README.md).

El cierre académico documenta el incremento de desarrollo, no una autorización
de producción.

## Entregables pendientes

Estos archivos obligatorios de Fase 3 aún no están en el repositorio:

- Tres diarios de reflexión individual (uno por integrante), con el nombre
  `Apellido_Nombre_3.1_APT122_DiarioReflexionFase3.docx`.
- La presentación grupal `Presentación Final del proyecto (Español).pptx`.
  La presentación de Fase 1 no sustituye esta entrega.

La presentación final en inglés es opcional y no se incluye en este paquete.

## Edición de la visión

La fuente de la visión es un documento `ms` con un salto de página explícito.
Para volver a generar el PDF desde la raíz del repositorio con GNU groff:

```sh
SOURCE_DATE_EPOCH=$(git show -s --format=%ct 815a4bda) \
  groff -K utf8 -Tpdf -ms -P-pa4 docs/submissions/fase3/vision-del-producto.ms \
  > docs/submissions/fase3/vision-del-producto.pdf
pdfinfo docs/submissions/fase3/vision-del-producto.pdf
```

Comprueba que sigue teniendo **dos páginas A4** y que el texto de ambas es
legible. La generación no inicia la aplicación ni sus servicios.

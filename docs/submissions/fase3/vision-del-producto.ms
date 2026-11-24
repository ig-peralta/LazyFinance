.\" Fuente UTF-8 de la visión académica. Instrucciones de generación en README.md.
.nr PO 0.84i
.nr LL 6.57i
.nr LT 6.57i
.nr HM 0.68i
.nr FM 0.6i
.nr PS 11
.nr VS 16
.nr PI 0
.nr PD 0.14i
.nr HY 0
.pl 29.7c
.fam H
.ad l
.defcolor accent rgb #154E59
.defcolor muted rgb #475569
.ds LH \m[muted]LAZYFINANCE\m[]
.ds RH \m[muted]PROYECTO APT · FASE 3\m[]
.ds CH
.ds CF \m[muted]\\n% / 2\m[]
.de PageTitle
.sp .28i
.ft B
.ps 28
.vs 34
\\m[accent]\\$*\\m[]
.br
.ft R
.ps \\n[PS]
.vs \\n[VS]
.sp .08i
..
.de SectionTitle
.br
.in 0
.sp .18i
.ne 4
.ft B
.ps 15
\\m[accent]\\$*\\m[]
.br
.ft R
.ps \\n[PS]
..
.PageTitle Visión del producto
.LP
\f[B]Entender mis finanzas sin rehacer mi cartola.\f[P]
.LP
LazyFinance · Proyecto APT (APT122) · 24 de noviembre de 2026
.SectionTitle El problema
.LP
Una cartola muestra saldos y movimientos, pero no explica por sí sola cuánto
gasté, qué consumió mi presupuesto o cuánto dinero recibí efectivamente.
Conciliar cuentas a mano hace fácil contar dos veces una transferencia,
tratar deuda de tarjeta como efectivo o confundir un dato antiguo con uno
actual. El objetivo es reducir ese trabajo sin ocultar de dónde sale una cifra.
.SectionTitle Para quién
.LP
El público inicial son personas que quieren gestionar sus finanzas personales
en Chile, con cuentas corrientes, de ahorro o tarjetas. El producto usa CLP y
períodos del calendario de Santiago. La persona puede preferir un panel visual
o una consulta en español; un cliente compatible con MCP es un canal adicional
solo cuando ella lo autoriza.
.SectionTitle Propuesta de valor
.LP
LazyFinance convierte registros financieros en explicaciones consultables.
El panel, el asistente y los clientes autorizados comparten las mismas reglas
de gasto, períodos, presupuestos y metas. Los hechos de origen y las decisiones
del titular se mantienen separados. Una respuesta puede enlazar a sus fuentes
y debe reconocer datos insuficientes, en vez de rellenarlos con supuestos.
.LP
\f[B]Ejemplo.\f[P] Al preguntar «¿cuánto me queda para supermercado este mes?»,
la persona puede revisar el período y los movimientos que explican el resultado
y contrastarlo con el panel. El asistente no compra ni mueve dinero. Si propone
un cambio, la persona revisa y aprueba su versión exacta por separado.
.bp
.PageTitle Alcance y criterios de éxito
.SectionTitle Qué abarca el incremento
.IP \(bu 3
Consultar cuentas y movimientos, corregir su clasificación y gestionar
presupuestos, metas e ingresos con importes y períodos trazables.
.IP \(bu 3
Elegir cuentas conectadas y distinguir acceso, sincronización y frescura.
Fintoc admite actualización bajo configuración y adhesión explícita. La
demostración dispone de un banco simulado de sincronización manual.
.IP \(bu 3
Usar un asistente persistente de texto con fuentes y voz opcional. El titular
puede revocar el acceso MCP; conceder lectura no concede escritura.
.SectionTitle Cómo sabremos si aporta valor
.IP \(bu 3
La misma pregunta sobre un titular y período produce cifras coherentes en
las interfaces y permite localizar la evidencia que las explica.
.IP \(bu 3
Una falla o un dato desactualizado es visible y no borra el último resultado
confirmado. Otro titular no puede usar la misma ruta para ver esos datos.
.IP \(bu 3
En una evaluación de usuarios, observar si pueden explicar un resultado y
elegir qué hacer con menos conciliación manual. Ese beneficio es una hipótesis,
no una medición de usabilidad del proyecto.
.SectionTitle Límites y siguiente paso
.LP
Primero se validó el núcleo con datos controlados, luego se conectaron las
interfaces y finalmente se amplió la experiencia. La Etapa C cerró como
incremento de desarrollo. Cotizaciones externas, alertas, WhatsApp y acciones
bancarias simuladas dirigidas por un agente no se entregaron. No hay compraventa,
transferencias reales ni aprobación de producción. El cierre final y los planes
de prueba distinguen resultados, confirmaciones en vivo y riesgos pendientes.
.LP
\f[B]Evidencias:\f[P] https://github.com/ig-peralta/LazyFinance (sección Fase 3).

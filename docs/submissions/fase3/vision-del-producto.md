# LazyFinance — Visión del producto

**Proyecto APT · APT122 · Fase 3**

## Problema y público

Una cartola muestra saldos y movimientos, pero no explica cuánto se gastó, qué
consumió un presupuesto o qué ingresos se recibieron. Conciliar todo a mano hace
fácil contar dos veces una transferencia, confundir deuda de tarjeta con efectivo
o tratar un saldo antiguo como actual.

LazyFinance está dirigido a personas que gestionan sus finanzas personales en
Chile, con cuentas corrientes, de ahorro o tarjetas. La experiencia está en español
y usa CLP y períodos del calendario de Santiago.

## Propuesta de valor

El panel, el asistente y los clientes autorizados mediante MCP (Model Context
Protocol) consultan las mismas reglas financieras. El usuario puede comprobar
qué movimientos explican un importe y distinguir datos confirmados, estimados o
incompletos. Por ejemplo, al preguntar «¿cuánto me queda para supermercado este
mes?», puede revisar el período, abrir los movimientos y contrastar el resultado
con su presupuesto.

## Alcance

- Consultar saldos y movimientos, corregir su clasificación y gestionar
  presupuestos, metas e ingresos.
- Elegir qué cuentas bancarias se sincronizan y distinguir acceso, importación
  y frescura. La sincronización automática de Fintoc requiere configuración y
  adhesión explícita; el banco simulado se sincroniza de forma manual.
- Usar un asistente de texto con fuentes y voz opcional. Las propuestas no
  se ejecutan por conversación: requieren aprobación explícita. Los permisos
  MCP son revocables y el permiso de lectura no concede escritura.

El incremento no ejecuta transferencias ni compras reales y no supone una salida
a producción. Cotizaciones, alertas, WhatsApp y acciones bancarias simuladas
dirigidas por un agente quedaron fuera de la entrega.

## Criterios de éxito

- Una consulta sobre el mismo titular y período produce cifras coherentes entre
  interfaces y permite encontrar la evidencia que las explica.
- Una falla de sincronización no borra el último resultado confirmado. Los datos
  desactualizados se identifican y ningún titular puede acceder a los datos de otro.
- Una evaluación con usuarios deberá comprobar si pueden explicar un resultado
  con menos conciliación manual. Ese beneficio aún no se ha medido.

[Visión y evolución del producto](../../product/product-vision.md) ·
[Índice de Fase 3](README.md)

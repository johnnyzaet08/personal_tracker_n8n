# ADR 0007: Gastos comprometidos en el resumen del período

Estado: aceptada (2026-10-11)

El indicador `expenses` del dashboard y el balance disponible incluyen los débitos
confirmados más las obligaciones recurrentes pendientes del mismo tenant, mes y
moneda. El balance se calcula con los ingresos manuales registrados menos ese gasto
comprometido. Así, el resumen presenta los compromisos del período que ya aparecen
en `committed` por grupo presupuestario, aunque todavía no se hayan pagado.

Cuando se paga una obligación, la reserva pendiente se reemplaza por la transacción
canónica. El total de gastos comprometidos no cambia por esa sustitución y no se
contabiliza dos veces. Las obligaciones de otros períodos, monedas o tenants quedan
fuera del cálculo.

`timeline`, `byCategory` y `topMerchants` continúan representando transacciones
confirmadas y no incorporan reservas: no hay fecha efectiva de gasto ni comercio
confirmado para una obligación aún pendiente. El indicador de gastos del resumen es
por tanto un total comprometido, no un total de salidas bancarias ya liquidadas.

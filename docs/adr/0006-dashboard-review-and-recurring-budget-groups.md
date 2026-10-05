# ADR 0006: Resumen accionable y grupo de gastos recurrentes

Estado: aceptada (2026-10-04)

El indicador de ingresos del dashboard usa la suma de ingresos manuales del tenant,
mes y moneda, la misma fuente que determina los montos asignados del presupuesto.
No se suma con créditos de transacciones porque el registro manual puede representar
el mismo ingreso y no existe una relación de conciliación entre ambos registros.
El balance resta los gastos confirmados de ese ingreso declarado.

El contador de pendientes de revisión representa el trabajo visible en Alertas y
revisión: alertas pendientes de la cola, más gastos confirmados sin categoría del
período y moneda seleccionados. Las alertas de la cola siguen siendo globales porque
esa página no las filtra por período o moneda.

Las transacciones recurrentes pagadas y las obligaciones recurrentes pendientes se
asignan al grupo presupuestario de su categoría. Si una obligación recurrente no
tiene categoría o grupo, se reserva en Gastos necesarios. Esta regla reemplaza la
asignación fija de todos los recurrentes a Gastos necesarios descrita en ADR 0002;
los recurrentes siguen sin ser un grupo presupuestario independiente y la reserva
pendiente se sustituye por la transacción al pagarse.

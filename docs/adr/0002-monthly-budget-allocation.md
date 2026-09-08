# ADR 0002: Presupuesto mensual y agrupación de categorías

Estado: aceptada (2026-09-07)

Cada tenant puede configurar un presupuesto por período y moneda. El ingreso base es planificación y no crea una transacción. Las asignaciones de Ahorro, Gastos necesarios, Provisiones y Monto de play deben sumar 100%; cada presupuesto conserva sus porcentajes históricos.

Las categorías de gasto se vinculan a uno de esos cuatro grupos. Los movimientos sin categoría quedan fuera del utilizado por grupo hasta que el usuario los clasifique. Los recurrentes no son un quinto grupo: mientras están pendientes se reservan dentro de Gastos necesarios y, al pagarse, la reserva se sustituye por la transacción canónica para evitar doble contabilización. Tanto el pago manual como una conciliación automática normalizan esa transacción a `recurring_payment`; la creación de la transacción, el enlace de la obligación y el estado del evento fuente se confirman de forma atómica.

Los cálculos se realizan en la API con `Decimal` y nunca mezclan monedas. El período presupuestario usa el mes de la obligación para reservas y la fecha efectiva para movimientos ordinarios.

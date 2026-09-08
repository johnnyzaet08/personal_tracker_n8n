# Finance implementation status

Entrega activa: 2 — categorías, presupuesto y dashboard.

- Implementado: patrones mensuales manuales, categoría mínima, materialización idempotente, obligaciones por período, vencimiento ajustable, pago manual y vista mensual.
- Decisión: ADR 0001 conserva el gasto canónico separado del compromiso y usa `source_event` con origen manual.
- Validaciones vigentes: formato, lint, typecheck, build y workflows pasan. Las cuatro migraciones se aplicaron desde cero en un entorno desechable y en la pila principal. API, web, PostgreSQL y n8n están saludables; la conectividad n8n → API → PostgreSQL está verificada. Las pruebas sintéticas confirmaron clasificación de gastos, totales presupuestarios, sustitución atómica de la reserva recurrente al pagar, idempotencia secuencial y conservación de la reserva cuando el movimiento requiere revisión.
- Implementado en entrega 2: presupuesto mensual por moneda, cuatro grupos configurables, categorías agrupadas, asignación de gastos sin categoría, resumen por grupo y visualización circular en el dashboard.
- Política: recurrentes pendientes se comprometen en Gastos necesarios y se sustituyen por gasto real al pagar; no existe un quinto grupo Recurrentes.

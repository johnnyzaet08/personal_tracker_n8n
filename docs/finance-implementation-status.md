# Finance implementation status

Entrega activa: 2 — categorías, presupuesto y dashboard.

- Implementado: patrones mensuales manuales editables, categoría mínima, sincronización idempotente de obligaciones por período, vencimiento manual protegido, pago manual y vista mensual.
- Decisión: ADR 0001 conserva el gasto canónico separado del compromiso y usa `source_event` con origen manual.
- Validaciones vigentes: formato, lint, typecheck, build y workflows pasan. Las ocho migraciones se aplicaron desde cero en un entorno desechable y en la pila principal. API, web, PostgreSQL y n8n están saludables; la conectividad n8n → API → PostgreSQL está verificada. Las pruebas sintéticas confirmaron clasificación de gastos, totales presupuestarios, sincronización concurrente sin duplicados, sustitución atómica de la reserva recurrente al pagar, aislamiento por tenant y conservación de la reserva cuando el movimiento requiere revisión.
- Implementado en entrega 2: presupuesto mensual por moneda, cuatro grupos configurables, categorías editables, asignación de gastos sin categoría desde Alertas y revisión, resumen por grupo y visualización circular accesible en Plan mensual y dashboard. Evolución temporal se retiró por no representar una serie confiable.
- Política: recurrentes pendientes se comprometen en Gastos necesarios y se sustituyen por gasto real al pagar; no existe un quinto grupo Recurrentes.
- Sincronización: crea obligaciones faltantes y actualiza sólo pendientes no conciliadas; separa creadas, actualizadas, sin cambios y protegidas. Nunca reescribe pagos/conciliaciones y conserva vencimientos manuales. Véanse ADR 0003 y ADR 0004.
- Integración Gmail: preview y selección viven en Integraciones. Al procesar un cargo recurrente, Gmail sustituye atómicamente la reserva por una sola transacción canónica y comparte bloqueo por tenant con el pago manual. La prueba concurrente dejó exactamente una transacción enlazada por obligación.

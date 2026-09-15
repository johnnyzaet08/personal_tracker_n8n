# ADR 0003: Sincronización mensual de obligaciones recurrentes

Estado: aceptada (2026-09-14)

La acción antes presentada como «Generar mes» se define como una sincronización
idempotente del período. Para cada patrón recurrente activo crea la obligación que
falte y, cuando ya existe, actualiza sus datos derivados si todavía está pendiente,
sin transacción enlazada y sin conciliación. Ejecutar la acción repetidamente con
los mismos datos no crea duplicados ni produce cambios adicionales.

La sincronización puede ajustar el monto esperado, la moneda, la categoría y la
fecha de vencimiento derivada de una obligación pendiente para reflejar la
configuración vigente del patrón. Una fecha ajustada manualmente tiene precedencia
y se conserva en sincronizaciones posteriores. Las obligaciones pagadas, omitidas,
conciliadas o enlazadas a una transacción son historial financiero y nunca se
reescriben. Pausar un patrón evita obligaciones nuevas, pero no elimina ni altera
las ya materializadas.

La unicidad por tenant, patrón y período continúa siendo la última barrera contra
duplicados. Esta regla complementa ADR 0001: la obligación sigue siendo una
reserva prevista y el gasto canónico sólo aparece al pagar o conciliar.

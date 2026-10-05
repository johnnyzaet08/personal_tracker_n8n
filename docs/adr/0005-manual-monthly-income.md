# ADR 0005: Ingresos manuales del mes y montos del presupuesto

Estado: aceptada (2026-09-27)

El presupuesto mensual conserva únicamente las asignaciones porcentuales por grupo. El monto asignado a cada grupo se calcula en la API como porcentaje de la suma de los ingresos manuales registrados para el mismo tenant, mes y moneda.

Los ingresos manuales son registros financieros separados de `transactions`. Permiten declarar el ingreso base y agregar ventas o servicios recibidos durante el mes sin crear movimientos bancarios duplicados. Cada registro requiere fecha, descripción, monto positivo y moneda; la fecha debe pertenecer al período elegido. La tabla queda directamente asociada al tenant y las consultas siempre filtran tenant, período y moneda.

Las asignaciones porcentuales históricas se conservan. Al cambiar los ingresos de un mes, sus montos asignados y disponibles se recalculan con el total actualizado. El indicador de ingresos del dashboard usa la misma suma de registros manuales del mes, sin sumarlos a los créditos de transacciones, para evitar duplicar un ingreso registrado en ambos lugares. El balance del dashboard resta los gastos confirmados a ese ingreso registrado.

La columna anterior `monthly_budgets.income_base` queda como dato legado para no perder valores históricos, pero la API y la web dejan de leerla o escribirla; los presupuestos nuevos reciben cero por defecto. Las bases antiguas no se convierten en ingresos: hacerlo las presentaría como recibos reales sin evidencia. Los meses existentes mantienen porcentajes y su monto asignado pasa a cero hasta registrar ingresos.

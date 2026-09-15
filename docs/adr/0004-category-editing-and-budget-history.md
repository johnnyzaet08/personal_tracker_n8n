# ADR 0004: Edición de categorías y lectura histórica del presupuesto

Estado: aceptada (2026-09-14)

El nombre, color y grupo presupuestario de una categoría son configurables. Su
`slug` permanece estable al renombrarla para conservar una identidad apta para
clasificadores e integraciones. Una categoría vinculada a transacciones o patrones
recurrentes no puede cambiar entre `expense` e `income`; esta restricción evita
reinterpretar débitos existentes o volver inválidas sus reservas.

La pertenencia al grupo presupuestario se resuelve desde la categoría vigente y no
se guarda como snapshot mensual en cada transacción. Por tanto, cambiar el grupo de
una categoría reclasifica su gasto en todos los resúmenes históricos. Esta decisión
mantiene el modelo actual simple y hace que una corrección de clasificación sea
consistente entre meses; si el producto necesita planes históricos inmutables hará
falta un modelo explícito de vigencias o snapshots.

La asignación manual de gastos y los patrones recurrentes sólo aceptan categorías
activas de tipo `expense`. Una corrección humana de categoría actualiza la marca de
modificación manual de la transacción.

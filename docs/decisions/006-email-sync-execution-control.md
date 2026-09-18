# ADR-006: Control y límite de ejecuciones manuales de Gmail

- Estado: aceptado.
- Fecha: 2026-09-17.
- Alcance: ejecuciones manuales de reconciliación Gmail iniciadas desde Integraciones.

## Contexto

Una credencial OAuth inválida o una llamada externa detenida podía dejar una
ejecución visible como activa durante demasiado tiempo. El usuario tampoco podía
cancelarla mientras estaba en `pending`, `fetching` o `processing`; la acción de
descarte existía únicamente después de llegar a `awaiting_selection`.

## Decisión

Las fases que ejecutan trabajo externo (`pending`, `fetching` y `processing`)
tienen un límite duro de 180 segundos tanto en el estado durable de la API como
en los workflows n8n 02 y 03. `awaiting_selection` conserva treinta minutos porque
ya no ejecuta trabajo externo y requiere una decisión humana.

La API permite cancelar cualquier ejecución activa, incluida la espera de
selección. La cancelación es un estado terminal. Los callbacks tardíos de n8n no
pueden reabrir ni sobrescribir una ejecución cancelada o expirada porque cada
transición valida el estado actual bajo el lock tenant-scoped existente.

n8n clasifica respuestas conocidas del proveedor en un conjunto cerrado de
códigos (`GMAIL_CREDENTIALS_INVALID`, `GMAIL_RATE_LIMITED`,
`GMAIL_SERVICE_UNAVAILABLE` y `GMAIL_REQUEST_FAILED`). La API acepta solamente
ese conjunto y sustituye cualquier otro valor por `GMAIL_EXECUTION_FAILED`; no
propaga cuerpos, mensajes OAuth, tokens ni detalles privados. El dashboard
traduce estos códigos a mensajes accionables. Un timeout informa expresamente
que se revise la credencial Gmail y la conectividad con n8n.

## Consecuencias

- Una ejecución bloqueada libera la fuente en un máximo de tres minutos, o antes
  si el usuario la cancela.
- Cancelar no revoca una petición HTTP ya enviada al proveedor, pero impide que
  su resultado tardío produzca cambios mediante ese run.
- La detección exacta de una credencial inválida depende de recibir 401/403. Si
  el proveedor o n8n se detienen antes de emitir una respuesta clasificable, el
  cierre usa `RUN_TIMEOUT` con orientación para revisar credenciales y conexión.
- No hay cambios de esquema ni migraciones.

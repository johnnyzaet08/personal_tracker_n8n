# Automatización n8n

Los JSON de `workflows/` son la fuente versionada. `n8n-import` los importa a la base separada `n8n` antes de iniciar el editor.

| Workflow                             | Estado inicial       | Responsabilidad                                         |
| ------------------------------------ | -------------------- | ------------------------------------------------------- |
| 00 - Gmail - Ingestion               | Inactivo             | Gmail → `EmailSourceEvent` → API → router               |
| 01 - Email - Router                  | Inactivo/subworkflow | Rutas independientes financiera, importante y revisión  |
| 05 - Local - Email Fixture Ingestion | Inactivo             | Webhook de payload normalizado; mismo router            |
| 10 - Finance - Process Candidate     | Inactivo/subworkflow | Frontera de bank-adapter; revisión si no existe adapter |
| 20 - Important Email - Process       | Inactivo/subworkflow | Política de prioridad, vencimiento y acción             |
| 90 - Review Queue                    | Inactivo/subworkflow | Persistencia idempotente de ambigüedades                |
| 98 - System - Connectivity Check     | Inactivo/manual      | n8n → API → PostgreSQL sin datos de dominio             |
| 99 - Error Handler                   | Inactivo/error       | Sanitiza y registra fallos como action runs             |

No actives `00` hasta seleccionar una credencial Gmail OAuth2 real. Los subworkflows se invocan por IDs estables y pueden permanecer inactivos. Si editas un workflow en la UI, expórtalo de vuelta, revisa que no contenga credenciales y ejecuta `pnpm workflows:validate`.

La ruta local `/webhook/email-fixture` solo existe después de activar `05`. Debe recibir un `EmailSourceEvent` con `source=email_fixture` o `email_forward`; no acepta `.eml` crudo todavía.

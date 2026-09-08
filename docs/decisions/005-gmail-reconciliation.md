# ADR-005: Fuentes de correo y reconciliación conservadora

- Estado: aceptado para implementación por la solicitud de Gmail reconciliation.
- Fecha: 2026-09-04.
- Alcance: configuración, privacidad, contratos y reconciliación local de Gmail.

## Decisión antes de migrar

La configuración vive en `core.email_sources`, vinculada al tenant, a una
integración Gmail y opcionalmente a una cuenta financiera. No se amplía
`core.integrations.metadata` como EAV. Las ejecuciones y previews viven en
`core.email_sync_runs` y `core.email_sync_candidates`: son estado del conector,
no movimientos financieros. Cada tabla nueva lleva `tenant_id`; las relaciones
de estas tablas deben comprobar también el tenant.

La API NestJS conserva la autoridad sobre permisos, configuración, período,
selección, idempotencia y persistencia. El dashboard usa solamente la API pública.
n8n recibe solicitudes por webhooks autenticados y reporta resultados a la API
interna; solo n8n tiene acceso a la credencial OAuth cifrada. No se cambian ni se
exportan sus secretos. Los JSON versionados usan un placeholder de credencial.

El parser MIME y el adapter de plantilla son componentes separados en la API.
Los caminos automático y manual usan la misma implementación. El conector
normaliza a `EmailSourceEvent`; el adapter financiero no conoce el formato de
los nodos Gmail. HTML, texto y MIME son entradas transitorias en memoria.

## Privacidad y autenticidad

No se persisten cuerpos, HTML, adjuntos, headers de transporte ni archivos EML
en `tracker`. La observación conserva Gmail message ID, hash financiero,
remitente normalizado, fechas mínimas, adapter/version y resultado sanitizado.
El preview guarda únicamente campos financieros estructurados necesarios para
seleccionar, sin asunto ni cuerpo. Los logs no incluyen consultas con direcciones
ni payloads. El guardado de datos de ejecución n8n se deshabilita para éxito,
error, ejecución manual y progreso.

El remitente se compara por dirección exacta normalizada contra una fuente
habilitada del tenant. SPF, DKIM y DMARC disponibles se evalúan; fallos o evidencia
insuficiente requieren una decisión conservadora, nunca inventar autenticidad.
La lectura usa Gmail readonly y no marca mensajes como leídos.

## Período, selección y ejecución

El período permitido es el mes calendario actual de `America/Costa_Rica`.
Una fecha exacta debe pertenecer a ese mes. La búsqueda obtiene como máximo diez
mensajes no leídos de una fuente. La fecha financiera extraída decide la vigencia
definitiva, comprobada de nuevo al procesar para cubrir cambios de mes.

La API crea una ejecución durable y devuelve HTTP 202. Un índice único parcial
impide ejecuciones activas concurrentes para la misma fuente y tenant. El preview
no crea observaciones financieras ni transacciones. Solo IDs explícitamente
seleccionados y pertenecientes al preview pueden procesarse; los mensajes se
recuperan y validan de nuevo. Los estados y conteos se consultan por la API.

## Idempotencia y reconciliación

1. La clave de observación sigue siendo `(tenant_id, source, external_id)`;
   para Gmail, `external_id` es el message ID real. Un hash no lo sustituye.
2. SHA-256 cubre una representación canónica de campos financieros normalizados,
   independiente de headers de transporte, IDs de ejecución y timestamps de fetch.
3. Una clave de reconciliación financiera única por tenant usa institución,
   cuenta o identificador enmascarado y referencia bancaria estable. El fallback
   combina institución, cuenta, fecha, dirección, moneda, monto decimal y comercio
   normalizados; los casos ambiguos se envían a revisión.

Una transacción nueva válida se inserta después de su observación. Una existente
idéntica no se modifica. Cualquier diferencia se registra en la cola de revisión;
no hay actualizaciones automáticas de campos financieros ni sobreescritura de
correcciones manuales. La cola guarda una propuesta financiera de contrato fijo
y su hash en columnas explícitas para comparar diferencias sin recuperar el correo.
Los conteos de conflictos corresponden a revisión y el
contador de actualizados permanece en cero.

## Compatibilidad y operación

Se agregan tres migraciones aditivas; no se modifica la inicial. La clave de reconciliación
es nullable para movimientos anteriores; la API debe comparar también evidencia
anterior cuando sea pertinente. La aplicación continúa en modo de autorización
local; esta decisión no introduce identidad de producción ni habilita RLS.

Antes de la primera escritura real se crea un dump lógico privado de `tracker`.
La validación incluye migración existente y vacía, contratos, parser sintético y
privado, aislamiento, reconciliación, workflows importados y ejecución Gmail real.
La evidencia ejecutada y cualquier limitación se registran al cerrar la tarea.

## Registro de errores tenant-scoped

La revisión final amplía `automation.action_runs` con tenant directo e idempotencia
por tenant, porque 99 puede registrar errores sin source event. Una migración
aditiva infiere ownership desde el evento, o desde el único tenant de la base
local; si existen huérfanos ambiguos en una base multitenant, falla sin inventar
propietario. Las nuevas escrituras requieren tenant en contrato y columna NOT NULL.

## Datos transitorios de ejecución n8n

La verificación de 2.37.4 mostró que save=none no evita guardar la entrada inicial
antes de ejecutar un workflow. Se usa N8N_EXECUTION_DATA_STORAGE_MODE=filesystem
y N8N_STORAGE_PATH sobre tmpfs privado, modo 0700 y límite de 128 MiB, tanto en n8n
como en los jobs CLI. Así MIME y headers de servicio permanecen únicamente en
memoria; no se escriben en execution_data de PostgreSQL ni en volúmenes durables.
Las credenciales continúan cifradas en n8n y los volúmenes anteriores se conservan.
No se migra automáticamente almacenamiento legacy al tmpfs. Al reiniciar se
pierden snapshots, y la API reintenta los runs durables por su contrato idempotente.
Este diseño corresponde al modo regular local; distribuir workers requiere otra
decisión explícita de almacenamiento y privacidad antes de habilitar queue.

Compose fija `regular` y bloquea el worker del perfil scale con un error explícito
hasta contar con ese diseño. No se habilita queue usando discos persistentes
ni PostgreSQL como sustituto del almacenamiento transitorio.

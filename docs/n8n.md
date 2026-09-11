# n8n

n8n 2.37.4 usa exclusivamente su base `n8n` y el rol `n8n_app`. Los diez
workflows versionados se importan con `import-preserving-gmail.mjs`; consulta
`gmail-setup.md` antes de reimportar una instancia con credenciales configuradas.

## Flujos

- 00 Gmail Ingestion: trigger no leído, metadata mínima, validación de fuente
  mediante la API, recuperación full y router compartido.
- 01 Email Router y 10 Finance Process Candidate: delegan al parser y la
  reconciliación centralizados en NestJS, sin extracción duplicada en Code nodes.
- 02 Gmail Reconciliation Preview: contexto autorizado, últimos diez no leídos,
  lectura full y preview financiero sin crear observaciones ni transacciones.
- 03 Gmail Process Selected Messages: consulta IDs seleccionados autorizados,
  recupera los mensajes otra vez, procesa mediante 01/10 y reporta resultado.
- 05 Local Email Fixture Ingestion y 20 Important Email Process mantienen sus IDs.
- 90 Review Queue usa la API interna y mantiene la frontera de revisión.
- 98 System Connectivity Check comprueba n8n → API → PostgreSQL sin datos de dominio.
- 99 Error Handler reduce fallos a códigos controlados sin cuerpos ni headers.

## Autenticación y privacidad

Antes de cualquier acción Gmail manual, el header enviado por el llamante se
valida en el endpoint interno de contexto. No se reemplaza por la clave del entorno
antes de autenticar. HTTP202 del webhook significa recepción asíncrona; el estado
real se consulta exclusivamente por la API pública.

Los cuerpos son transitorios. Compose y cada workflow deshabilitan el guardado
de datos de ejecuciones exitosas, fallidas, manuales y de progreso. En 2.37.4
esas opciones por sí solas todavía escriben la entrada inicial en PostgreSQL.
Por eso `N8N_EXECUTION_DATA_STORAGE_MODE=filesystem` apunta a
`N8N_STORAGE_PATH=/run/n8n-transient`, un tmpfs de 128 MiB con permisos 0700.
Los payloads de ejecuciones nuevas permanecen en RAM y se pierden al reiniciar; no entran en
`execution_data` ni en volúmenes durables. El prune escanea cada minuto y elimina las ejecuciones marcadas y elegibles
y sus archivos temporales, sin buffer de borrado. Los volúmenes y
el historial anteriores se conservan, sin migrarlos automáticamente al tmpfs. Las llamadas Gmail son GET, no cambian UNREAD y
no descargan imágenes inline ni adjuntos. OAuth permanece cifrado dentro de n8n.

## Operación

```text
pnpm workflows:validate
node --test automation/n8n/scripts/test-gmail-workflows.mjs
docker compose stop n8n
docker compose run --rm --no-deps n8n-import
docker compose up -d --no-deps n8n
pnpm workflows:connectivity
```

La conectividad detiene n8n brevemente: CLI y servidor no pueden compartir el
puerto del task broker. Nunca borrar volúmenes para aplicar workflows.

## Sondeo Gmail y conservación del cursor

El nodo Gmail Trigger `typeVersion: 1.4` de n8n 2.37.4 usa
`pollTimes.item: [{ mode: "everyMinute" }]`. Su cursor tiene dos niveles:
`staticData["node:Gmail Trigger - Credential Required"]["Gmail Trigger - Credential Required"]`.
Dentro de ese objeto están `lastTimeChecked` (segundos Unix),
`possibleDuplicates` y `pendingMessageIds`. Poner `lastTimeChecked` directamente
en el primer nivel no inicializa el cursor efectivo. El importador conserva
íntegro el objeto existente bajo la clave `node:...`, incluida esta anidación;
no reinicia el cursor al desplegar.

En sondeo automático, Gmail agrega `after:lastTimeChecked` a la búsqueda
configurada y limita a diez los mensajes recuperados por poll. La ejecución
manual del nodo omite ese límite temporal incremental y obtiene un mensaje;
por eso una prueba manual exitosa no demuestra que el sondeo automático esté
recorriendo el mismo período. Para una validación histórica acotada, cualquier
cursor temporal debe usar la estructura anidada y mantenerse dentro de la
ventana autorizada. La operación habitual conserva el cursor existente.

La inspección del código instalado y una prueba aislada con transporte simulado
confirmaron la diferencia entre el cursor plano y el anidado, sin llamadas a
Gmail ni acceso a credenciales. También se ejecutó el sondeo automático real
con la ventana autorizada y se confirmó su persistencia idempotente; los conteos
se registran en el informe de validación.

La auditoría disponible es `docker compose exec -T n8n n8n audit`. Inspeccionar
privadamente la salida porque puede contener referencias internas; comunicar solo
un resumen sanitizado. Code y HTTP Request siguen siendo superficies de revisión.

Esta composición fija el modo `regular`. El perfil `scale` conserva su definición,
pero el worker falla explícitamente con `QUEUE_REQUIRES_VALIDATED_TRANSIENT_STORAGE`:
los workers no pueden compartir el tmpfs privado del servidor. Habilitar queue
requiere un ADR y validación de almacenamiento transitorio compartido. Cambiar
a PostgreSQL o a un volumen durable reintroduciría retención de cuerpos.

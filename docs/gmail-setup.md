# Gmail: conexión existente y alcance de lectura

El usuario confirmó OAuth2 operativo y recepción previa de un mensaje en el
Gmail Trigger. Esta funcionalidad reutiliza esa conexión cifrada en n8n. No pide
client ID, client secret ni tokens, y no los mueve a tracker ni al dashboard.

## Vinculación al importar

Los JSON versionados conservan `GMAIL_OAUTH_CREDENTIAL_REQUIRED`. El servicio
`n8n-import` ejecuta `automation/n8n/scripts/import-preserving-gmail.mjs` dentro de
la imagen n8n. Consulta únicamente referencias y nombres de credenciales, conserva
la vinculación existente de 00 y la aplica a nodos Gmail de 00/02/03. Si no había
vinculación y existe exactamente una credencial Gmail, puede reutilizarla. Si hay
varias y ninguna vinculada, falla de forma explícita sin escoger una arbitraria.
Nunca consulta, exporta ni descifra el campo de datos de la credencial.
Detén n8n antes de importar; los temporales de importación se crean con permisos
restrictivos dentro del contenedor y se eliminan al terminar:

```text
docker compose stop n8n
docker compose run --rm --no-deps n8n-import
docker compose up -d --no-deps n8n
```

La importación conserva el estado activo previo de 00 y habilita los webhooks
02/03 cuando hay una vinculación válida. Sin credencial quedan inactivos. No usar
la importación CLI directa de los placeholders para actualizar el runtime.

## Scope mínimo

Las nuevas operaciones son GET de listado y lectura de mensajes. Requieren
`https://www.googleapis.com/auth/gmail.readonly`; no marcan mensajes como leídos,
no modifican etiquetas y no descargan adjuntos relacionados.
n8n 2.37.4 permite Custom Scopes en Gmail OAuth2. Sus scopes predeterminados son
más amplios que readonly. La inspección del editor de la conexión existente mostró
Custom Scopes desactivado; no se inspeccionó el token concedido. Por tanto, una
prueba de lectura exitosa no certifica un grant mínimo. Para reducir un grant
anterior se debe configurar únicamente readonly y completar la reconexión de
Google, conservando el cliente existente; no compartir secretos en chat.

## Validación privada acotada

Las muestras locales viven bajo `.private/`, ignorada por Git, Docker y Prettier.
La fixture versionada es completamente sintética. No imprimir la muestra ni los
resultados financieros reales de sus campos en terminal o documentación.
El importador admite `GMAIL_VALIDATION_BEFORE=YYYY-MM-DD` y
`GMAIL_VALIDATION_SOURCE_FILE=/run/private/gmail-source-config.json`, montando solo
ese archivo privado de configuración. Aplica a 00/02 una búsqueda de no leídos de
la fuente desde el inicio del mes hasta el día indicado exclusivo, en Costa Rica.
Se usa para restringir la ejecución autorizada a los primeros cuatro días. Estos
filtros se aplican solo a temporales del runtime. Reimportar sin esas opciones
restaura la búsqueda normal del mes actual sin perder la vinculación OAuth.
Los resultados efectivamente ejecutados se registran por separado en la memoria
durable y en el informe de validación; no inferir validación real de pruebas sintéticas.

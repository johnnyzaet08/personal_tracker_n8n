# Configuración futura de Gmail

## Estado actual

No existe credencial OAuth, no se leyó un correo y Gmail no está validado. `00 - Gmail - Ingestion` está importado e inactivo, con el placeholder `GMAIL_OAUTH_CREDENTIAL_REQUIRED`.

## Pasos manuales

1. En Google Cloud crea o selecciona un proyecto y habilita Gmail API.
2. Configura la pantalla de consentimiento OAuth con datos reales del responsable.
3. Selecciona el tipo de publicación apropiado; para pruebas usa usuarios de test explícitos.
4. Crea un OAuth client Web Application y añade exactamente el callback que n8n muestra al crear la credencial Gmail OAuth2.
5. En n8n crea la credencial Gmail OAuth2. Guarda client ID y secret solo en el almacén cifrado de n8n; nunca en Git.
6. Abre `00`, selecciona la credencial en `Gmail Trigger - Credential Required` y ejecuta una prueba manual con un buzón no productivo.
7. Confirma que el payload normalizado no contiene más datos de los necesarios y que la API responde creado/duplicado correctamente.
8. Solo entonces activa `00`. Mantén deshabilitado `Future Gmail labeling` hasta aprobar el scope adicional.

## Scopes

Empieza con el scope mínimo que permita leer los mensajes requeridos. `gmail.readonly` es restringido y puede requerir verificación y evaluación de seguridad cuando datos de scope restringido se transmiten o almacenan. `gmail.modify` solo se justifica si se activa etiquetado. No solicites `mail.google.com`.

Para comercializar se necesitarán dominio verificado, política de privacidad, términos, justificación de scopes, OAuth verification y, según alcance/almacenamiento, una evaluación de seguridad externa.

## Evolución

Gmail API + Pub/Sub sustituirá el trigger de polling: la notificación será verificada, se recuperará el mensaje por history/message ID y se producirá el mismo `EmailSourceEvent`. Un Gmail add-on podrá enviar el mensaje seleccionado bajo interacción del usuario. El reenvío a una dirección dedicada será otro conector. Ninguna alternativa cambia el modelo financiero.

La documentación de referencia descargada por el usuario permanece en `documentation/Google/`.

# Despliegue inicial en servidor

Esta guía prepara un primer servidor único; no afirma que exista un despliegue público validado.

## Host

Usa Linux mantenido, Docker Engine/Compose actualizados, firewall, usuario sin login root directo, disco cifrado cuando sea posible y sincronización NTP. Publica solo 80/443. Mantén 3000, 3001, 5432 y 5678 cerrados externamente; los bindings locales ya usan `127.0.0.1`.

## Preparación

1. Clona el repositorio en un directorio dedicado.
2. Crea `.env` con secretos aleatorios gestionados fuera de Git. Cambia todos los `change-me`.
3. Define `LOCAL_AUTH_ENABLED=false`; implementa autenticación real antes de usuarios externos.
4. Configura `APP_DOMAIN`, `ACME_EMAIL`, DNS A/AAAA y CORS HTTPS exacto.
5. Define `N8N_SECURE_COOKIE=true`, `N8N_PROTOCOL=https` y hostname público si expones el editor; preferiblemente protégelo por VPN/SSO y una ruta separada.
6. Ejecuta backup inicial y prueba restauración en staging.
7. Levanta `docker compose --profile production up --build -d`.

Caddy solicita y renueva TLS. El Caddyfile enruta `/api/*` a la API y el resto al dashboard. Antes de producción revisa el manejo de prefijo según el dominio definitivo; Swagger puede deshabilitarse o restringirse.

## Rollout

- Construye imágenes inmutables en CI, escanéalas y publícalas en un registro privado.
- Ejecuta `prisma migrate deploy` como job antes de cambiar la API.
- Usa health checks y conserva la versión anterior para rollback del proceso. No reviertas una migración destructiva automáticamente.
- Verifica endpoints vacíos, dashboard, n8n → API → DB y conteo de workflows.

## Escala n8n

Establece `EXECUTIONS_MODE=queue` y habilita `--profile scale`. Redis y el worker usan red interna y password. Para más de un host usa PostgreSQL/Redis administrados o endurecidos, almacenamiento binario compartido y task runners externos aislados.

## Pendientes obligatorios antes de comercializar

Autenticación y sesiones, autorización/RLS, gestión cifrada de refresh tokens con KMS y rotación, rate limiting, WAF, auditoría de acceso, política de retención, observabilidad/alertas, pruebas de recuperación, análisis de privacidad, OAuth verification y respuesta a incidentes.

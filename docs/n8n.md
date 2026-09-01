# n8n

n8n 2.37.4 usa exclusivamente la base `n8n` y el rol `n8n_app`. Los workflows viven como JSON en `automation/n8n/workflows` y se importan antes de iniciar el editor.

## Contratos y seguridad

Los nodos de proveedor producen `EmailSourceEvent v1`. Solo los HTTP Request nodes llaman a la API interna y envían `x-internal-api-key` desde variables de entorno. Los Code nodes no leen tokens ni registran cuerpos. Gmail queda inactivo; el nodo de etiquetado futuro está deshabilitado para no ampliar scopes.

La retención de ejecuciones está limitada por `EXECUTIONS_DATA_PRUNE=true` y `EXECUTIONS_DATA_MAX_AGE=168` horas. Los binarios usan volumen filesystem. Para producción, aplica una política de retención adicional a `source_events.payload`.

## Conectividad

`98` es manual y no escribe dominio. Su resultado esperado incluye:

```json
{
  "status": "healthy",
  "path": "n8n -> api -> postgresql",
  "api": "reachable",
  "database": "connected"
}
```

Ejecuta `pnpm workflows:connectivity`. El proceso detiene n8n brevemente porque el CLI y el servidor no pueden compartir el mismo puerto del task broker.

## Auditoría

Revisa la instancia periódicamente con la herramienta de auditoría disponible en la versión instalada (`docker compose exec n8n n8n audit --help`) y desde Settings > Security audit cuando la UI lo permita. También revisa imágenes, dependencias y secretos en CI. Ningún resultado de auditoría sustituye hardening del host, TLS, backups y OAuth verification.

## Scale

El perfil `scale` implementa Redis persistente y un worker. Establece `EXECUTIONS_MODE=queue` para el main y usa la misma encryption key en main y workers. Aumenta `N8N_WORKERS` solo después de medir PostgreSQL y Redis.

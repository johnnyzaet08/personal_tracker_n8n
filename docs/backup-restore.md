# Backup y restauración

## Backup lógico

Guarda cada base por separado y cifra los archivos fuera del host:

```text
docker compose exec -T postgres pg_dump -U postgres -Fc tracker > tracker.dump
docker compose exec -T postgres pg_dump -U postgres -Fc n8n > n8n.dump
```

Respalda también el volumen de configuración de n8n y conserva de forma segura el `N8N_ENCRYPTION_KEY`; sin esa clave las credenciales restauradas no serán utilizables. No incluyas dumps ni claves en Git.

## Restauración ensayada

En un entorno aislado con las mismas versiones mayores:

1. Levanta solo PostgreSQL y espera health.
2. Restaura `tracker` y `n8n` con `pg_restore --clean --if-exists --no-owner` usando el rol administrativo.
3. Reasigna ownership/grants a `tracker_app` y `n8n_app` si procede.
4. Restaura el volumen n8n y configura exactamente la misma encryption key.
5. Ejecuta `prisma migrate deploy`, inicia API/n8n/web y valida health, conteos y conectividad.

Ejemplo dentro del contenedor, después de copiar el dump mediante un mecanismo seguro:

```text
pg_restore -U postgres -d tracker --clean --if-exists --no-owner /backup/tracker.dump
```

## Política

Define RPO/RTO antes de producción. Como base: backup diario, WAL/PITR para datos comerciales, retención cifrada 30-90 días, copia fuera del host, prueba mensual de restauración y alertas ante fallos. Una copia no probada no cuenta como backup operativo.

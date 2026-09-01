# Seguridad

## Implementado

- Secretos solo por entorno; `.env` ignorado y example sin valores reales.
- Roles y bases PostgreSQL separados; sin puerto PostgreSQL publicado.
- Endpoint interno con secreto mínimo de 32 caracteres y comparación constante.
- Validación Zod/class-validator, configuración fail-fast y CORS explícito.
- Helmet, correlation IDs, errores sanitizados y logs JSON con redacción.
- IDs idempotentes, checks de dominio e índices únicos.
- n8n con encryption key, telemetry deshabilitada, retención de ejecuciones y community packages no verificadas deshabilitadas.
- Imágenes y dependencias fijadas; no se usan tags `latest`.

## Secretos futuros

Los refresh tokens OAuth deben cifrarse por sobre con una data key por integración, protegida por KMS/HSM, con key version, rotación y auditoría. Nunca deben entrar en `core.integrations.metadata`. Hasta diseñar ese almacén, n8n mantiene la credencial cifrada con `N8N_ENCRYPTION_KEY`.

## Pendientes

- Autenticación/OIDC, sesiones seguras, rate limiting y RLS.
- Task runners externos aislados para n8n en producción.
- Política y job de retención/redacción de cuerpos de correo.
- Escaneo SAST/SCA/container, SBOM y firma de imágenes en CI.
- Métricas, alertas, audit log de acciones humanas y SIEM.
- Rotación automatizada, secrets manager y procedimiento de incidente.
- OAuth verification y revisión legal/privacidad.

No expongas el editor n8n directamente a Internet sin VPN/SSO o una capa de acceso equivalente.

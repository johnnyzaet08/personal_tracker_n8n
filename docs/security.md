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
- Revisión de retención del historial anterior al procesamiento sin cuerpos.
- Escaneo SAST/SCA/container, SBOM y firma de imágenes en CI.
- Métricas, alertas, audit log de acciones humanas y SIEM.
- Rotación automatizada, secrets manager y procedimiento de incidente.
- OAuth verification y revisión legal/privacidad.

No expongas el editor n8n directamente a Internet sin VPN/SSO o una capa de acceso equivalente.

## Reconciliación de correo

Las rutas nuevas aceptan MIME solo en memoria y guardan proyecciones explícitas.
El parser no renderiza HTML ni carga recursos remotos; limita tamaño y complejidad.
Sender exacto y fuente habilitada son obligatorios. Autenticación faltante o
fallida requiere revisión. Los importes usan decimal strings y NUMERIC.

Los logs excluyen query strings, headers y cuerpos; correlation IDs se restringen
a identificadores opacos. Los fallos Gmail se reducen a códigos constantes.
`.private/` queda fuera de Git y de imágenes. Las correcciones manuales permanecen
intactas. El scope efectivo requiere comprobación separada de las operaciones GET;
véase `gmail-setup.md`.

En n8n 2.37.4 se comprobó que save=none deja inicialmente el input en la base.
La composición ahora usa almacenamiento de ejecuciones filesystem sobre tmpfs
privado, sin migrar el almacenamiento anterior. Una repetición real de diez
mensajes produjo cero filas nuevas en execution_data. Se eliminaron únicamente
catorce ejecuciones de prueba de esta tarea ya marcadas para borrado; no se tocó
el historial anterior del usuario. Este hallazgo y su corrección se detallan en
`gmail-reconciliation-validation.md`. La política no certifica ni elimina
cuerpos que pudieran existir en ejecuciones históricas anteriores.

# ADR-002: n8n escribe solo mediante la API

- Estado: aceptado
- Fecha: 2026-08-31

## Decisión

n8n no recibe acceso al rol `tracker_app` ni SQL. Los workflows normalizan proveedores y llaman endpoints internos protegidos.

## Consecuencia

Validación, idempotencia y reglas permanecen en una frontera auditable. Cambiar Gmail Trigger por Pub/Sub no cambia el dominio. La API interna debe versionarse y mantenerse compatible con workflows publicados.

# ADR-003: Tenant explícito e idempotencia desde el ingreso

- Estado: aceptado
- Fecha: 2026-08-31

## Decisión

Cada agregado almacena `tenant_id`; source events se deduplican por proveedor y external ID, transactions por source event/reference y acciones por key.

## Consecuencia

Reintentos de n8n son seguros y la base está lista para RLS. El tenant local es una conveniencia deliberadamente bloqueable, no un sustituto de autenticación.

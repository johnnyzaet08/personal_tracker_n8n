# Base de datos

## Bases, roles y schemas

Un servidor PostgreSQL contiene:

- `tracker`, propiedad de `tracker_app`.
- `n8n`, propiedad de `n8n_app`.
- `postgres` se usa solo para bootstrap y operación administrativa.

Se revoca acceso `PUBLIC` a ambas bases. PostgreSQL no publica puerto al host. `tracker` contiene `core`, `finance`, `automation`, `habits` y `health`; los dos últimos están vacíos y reservados.

## Tablas

| Schema     | Tabla              | Papel                                |
| ---------- | ------------------ | ------------------------------------ |
| core       | tenants            | límite de aislamiento, zona y moneda |
| core       | users              | identidad normalizada                |
| core       | tenant_memberships | relación y rol por tenant            |
| core       | integrations       | estado y metadata sin secretos       |
| core       | source_events      | entrada idempotente de proveedores   |
| finance    | accounts           | cuentas financieras                  |
| finance    | merchants          | normalización de comercios           |
| finance    | categories         | árbol de categorías                  |
| finance    | transactions       | movimientos en `NUMERIC(20,4)`       |
| finance    | recurring_payments | patrón recurrente inicial            |
| automation | classifications    | resultados versionados               |
| automation | action_runs        | acciones con idempotency key         |
| automation | review_queue       | decisiones humanas pendientes        |
| automation | notifications      | entregas futuras por canal           |

Todos los timestamps usan `TIMESTAMPTZ(6)`. UUIDs usan `gen_random_uuid()` y los IDs de source event pueden venir del contrato. Triggers compartidos mantienen `updated_at` también ante mantenimiento SQL.

## Constraints e índices

La migración agrega checks para monedas ISO en mayúsculas, estados, roles, dirección debit/credit, montos positivos, confianza 0..1, frecuencias y secuencia temporal. Hay índices por tenant y fechas para dashboard, además de cuenta, categoría, comercio, moneda, estado y revisión.

No se usa EAV. Los strings con checks se prefieren a enums PostgreSQL para permitir migraciones de estado controladas sin acoplar el runtime a tipos nativos. Prisma refleja relaciones y tipos; la migración SQL agrega checks, triggers e índices parciales que Prisma no expresa.

## Borrado y cascadas

- Borrar tenant elimina configuración, catálogo, membresías, review queue y notificaciones.
- Source events y transactions usan `RESTRICT` para impedir pérdida accidental de trazabilidad.
- Merchant, category y account usan `SET NULL` desde transactions para conservar el ledger.
- Classifications y reviews desaparecen con su source event solo si este se elimina mediante una operación administrativa explícita.

No se implementa soft delete genérico: estados `inactive`, `archived`, `void` o `disabled` representan la vida funcional. La eliminación física queda reservada para retención y cumplimiento.

## Migraciones

`20260831211500_init` crea todo desde una base vacía. En despliegue se ejecuta `prisma migrate deploy`; nunca `migrate dev`. El seed local es idempotente y está bloqueado si `LOCAL_AUTH_ENABLED` no es `true`.

## RLS futuro

Las columnas e índices de tenant ya están presentes. Antes de habilitar RLS hay que añadir autenticación real, usar un rol sin `BYPASSRLS`, establecer el tenant dentro de cada transacción y crear pruebas de aislamiento cruzado.

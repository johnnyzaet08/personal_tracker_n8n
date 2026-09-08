# Base de datos

## Bases, roles y schemas

Un servidor PostgreSQL contiene:

- `tracker`, propiedad de `tracker_app`.

- `n8n`, propiedad de `n8n_app`.

- `postgres` se usa solo para bootstrap y operación administrativa.

Se revoca acceso `PUBLIC` a ambas bases. PostgreSQL no publica puerto al host. `tracker` contiene `core`, `finance`, `automation`, `habits` y `health`; los dos últimos están vacíos y reservados.

## Tablas

| Schema | Tabla | Papel |

| ---------- | ------------------ | ------------------------------------ |

| core | tenants | límite de aislamiento, zona y moneda |

| core | users | identidad normalizada |

| core | tenant_memberships | relación y rol por tenant |

| core | integrations | estado y metadata sin secretos |

| core | source_events | entrada idempotente de proveedores |

| core | email_sources | remitentes y adapters por integración |

| core | email_sync_runs | ejecuciones asíncronas y selección |

| core | email_sync_candidates | preview financiero sin correo |

| finance | accounts | cuentas financieras |

| finance | merchants | normalización de comercios |

| finance | categories | árbol de categorías |

| finance | transactions | movimientos en `NUMERIC(20,4)` |

| finance | recurring_payments | patrón recurrente inicial |

| automation | classifications | resultados versionados |

| automation | action_runs | acciones con idempotency key |

| automation | review_queue | decisiones humanas pendientes |

| automation | notifications | entregas futuras por canal |

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

## Migraciones de reconciliación Gmail

- `20260904190000_email_reconciliation`: tablas explícitas de fuente/run/candidato,

  FKs compuestas de tenant, índices y checks; agrega `reconciliation_key`,

  `financial_hash` y `manually_modified_at` nullable a transactions.

- `20260905063000_review_candidate_evidence`: propuesta financiera normalizada y

  hash opcionales en review_queue para comparar diferencias sin retener correos.

La migración inicial permanece intacta. El índice parcial de ejecuciones activas

bloquea dos previews/procesamientos simultáneos por tenant y fuente. Los estados

pendientes caducan; una selección pendiente se puede cancelar. Los advisory locks

transaccionales por tenant serializan decisiones financieras que podrían competir.

Los movimientos anteriores sin reconciliation_key se comparan también por su

referencia y contexto institucional. No se reescriben valores del ledger existente.

Prisma declara los índices de soporte; la migración SQL declara los FKs compuestos,

checks e índice parcial que no se representan completamente en el cliente.

### Tenant directo en errores de orquestación

`20260906032000_action_run_tenant_scope` agrega tenant_id obligatorio a action_runs,
idempotencia única por tenant y FK compuesta al source event. Backfill por evento
o por el único tenant de una base local; huérfanos ambiguos multitenant detienen
la migración transaccional para requerir mapeo explícito. No se elimina ningún registro.

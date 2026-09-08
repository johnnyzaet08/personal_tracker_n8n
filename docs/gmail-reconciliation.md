# Gmail reconciliation

## Arquitectura y modelos

El dashboard llama a la API NestJS. La API crea un run durable y responde 202;
n8n recibe su ID, autentica la solicitud consultando la API interna, lee Gmail y
devuelve el contenido transitoriamente a la API. MIME, adapter y reconciliación
son compartidos por los caminos automático y manual. PostgreSQL `tracker` es la
fuente oficial y la base `n8n` mantiene únicamente estado del orquestador.

ADR-005 documentó la ubicación antes de migrar: `core.email_sources`,
`core.email_sync_runs` y `core.email_sync_candidates`. No se usa metadata como
EAV. Las tres tablas incluyen tenant y sus nuevas relaciones usan claves
compuestas con tenant. Un índice parcial impide dos runs activos de una fuente.
Los runs pendientes se reintentan; una operación vence en 15 minutos y una
selección pendiente en 30 minutos. El cambio de mes invalida runs anteriores.

Migraciones aditivas, sin modificar la inicial:

- `20260904190000_email_reconciliation`: fuentes, runs, previews, restricciones
  y claves financieras de reconciliación.
- `20260905063000_review_candidate_evidence`: propuesta financiera y hash
  explícitos en la cola de revisión para comparar sin recuperar el correo.
- `20260906032000_action_run_tenant_scope`: tenant obligatorio en action_runs,
  idempotencia por tenant, backfill conservador y FK compuesta de eventos.

## Contratos y API

`packages/contracts/src/index.ts` conserva el barrel público y exporta módulos
de contratos. `email-reconciliation.ts` define Zod v1 para configuración,
preview, candidato, selección, run, contadores, resultado y adapter.

| Método     | Ruta pública                              | Función                                       |
| ---------- | ----------------------------------------- | --------------------------------------------- |
| GET        | `/api/v1/email-sources/options`           | Conexiones, cuentas, adapters y período local |
| GET / POST | `/api/v1/email-sources`                   | Listar o crear fuentes                        |
| PATCH      | `/api/v1/email-sources/:id`               | Editar y habilitar operaciones                |
| POST       | `/api/v1/email-sources/:id/preview`       | Crear búsqueda asíncrona, 202                 |
| POST       | `/api/v1/email-sync-previews/:id/process` | Selección explícita, 202                      |
| GET        | `/api/v1/email-sync-runs`                 | Historial paginado, filtro sourceId           |
| GET        | `/api/v1/email-sync-runs/:id`             | Preview, progreso y resultado                 |
| POST       | `/api/v1/email-sync-runs/:id/cancel`      | Descartar preview pendiente                   |

| Método | Ruta interna                                       | Función                                    |
| ------ | -------------------------------------------------- | ------------------------------------------ |
| GET    | `/internal/v1/email-sources/match`                 | Comparar sender exacto y fuente habilitada |
| POST   | `/internal/v1/email-ingestion/automatic`           | Ingestión automática compartida            |
| GET    | `/internal/v1/email-sync-runs/:id/context`         | Contexto y selección autoritativa          |
| POST   | `/internal/v1/email-sync-runs/:id/progress`        | Transición de estado validada              |
| POST   | `/internal/v1/email-sync-runs/:id/candidates`      | Preview sin observaciones ni ledger        |
| POST   | `/internal/v1/email-sync-runs/:id/process-message` | Reconciliar solo un seleccionado           |
| POST   | `/internal/v1/email-sync-runs/:id/complete`        | Contadores y estado terminal               |

Las rutas adicionales de contexto, procesamiento unitario, opciones y cancelación
mantienen en NestJS la autoridad sobre selección y configuración. Los listados
usan page/pageSize. Los handlers validan Zod/DTO, documentan OpenAPI y usan errores
estructurados y correlation ID. La autorización pública sigue siendo el modo
local explícito; no equivale a autenticación de producción. El guard interno
compara la clave de servicio sin filtrar su valor a respuestas o logs.

## Parser y período

`mime-parser.ts` procesa MIME con límites de tamaño, profundidad y partes;
soporta HTML sin text/plain, base64, quoted-printable y multipart/related.
Ignora imágenes y adjuntos, no renderiza HTML ni descarga recursos remotos.
`bank-purchase-adapter.ts` reconoce las etiquetas de la plantilla observada,
con fixture completamente sintética y comprobación privada independiente.

Extrae monto decimal string, moneda explícita o default configurado, fecha de
Costa Rica, comercio, tarjeta enmascarada, referencia y tipo de compra. La falta
de información necesaria, valores ambiguos o autenticación ausente/fallida lleva
a revisión. La evidencia SPF/DKIM/DMARC se toma de Authentication-Results de
Gmail; no se afirma verificar criptográficamente firmas DKIM de un EML local.

Solo se admite el mes calendario actual en America/Costa_Rica. La búsqueda
recupera hasta diez no leídos de una dirección; la fecha financiera controla la
elegibilidad y se comprueba de nuevo al procesar. Una fecha exacta debe estar en
ese mes. Seleccionar no cambia las etiquetas Gmail. La selección se recupera
desde PostgreSQL y cada mensaje se vuelve a leer antes de persistir.

## Idempotencia y revisión

La observación usa `(tenant_id, gmail, message.id)`. Un SHA-256 canónico incluye
campos financieros y excluye transporte. La transacción tiene además una clave
única por tenant: institución, cuenta o máscara y referencia bancaria; el
fallback añade fecha, dirección, moneda, monto y comercio normalizados.

`new` crea una transacción después de su observación. `already_processed` y
`exact_duplicate` no crean otra. `conflict` y `requires_review` conservan una
propuesta financiera sanitizada en review queue. `ignored_outside_period` no
crea ni actualiza una transacción. Ninguna diferencia modifica automáticamente
un movimiento, incluidos los corregidos manualmente. `updated` siempre vale 0.

El preview guarda únicamente una proyección financiera y metadata mínima. Ni
tracker ni los JSON versionados contienen HTML, cuerpos, adjuntos, EML o tokens.
Los workflows deshabilitan la retención de datos de ejecución y Compose dirige
los inputs iniciales a tmpfs privado; save=none por sí solo no evita escritura
inicial en n8n 2.37.4. El importador
restaura las referencias OAuth en temporales privados sin leer datos cifrados;
véanse `gmail-setup.md` y `n8n.md`.

## Verificación y operación

Ejecutar los comandos completos de AGENTS.md y los tests del parser, política,
workflows e integración PostgreSQL. La prueba de integración solo acepta una
base cuyo nombre termine en `_verify`; nunca debe apuntar a tracker.
`scripts/verify-private-email.cjs` comprueba todas las muestras privadas y emite
únicamente conteos. `scripts/verify_email_privacy.py` revisa el contenido que
entraría a Git contra las muestras y patrones de secretos.

El resultado ejecutado, los conteos reales y las limitaciones se documentan en
`gmail-reconciliation-validation.md`. Un test sintético no valida Gmail real.

## Integración y rollback

La rama `codex/gmail-reconciliation` parte de main y vive en el worktree aislado.
Revisar el commit, repetir las validaciones y llevarlo a main por
PR o merge revisado. No copiar `.env` ni `.private` a Git. El despliegue necesita
la configuración local existente y la credencial cifrada de n8n.

Antes de aplicar migraciones se debe crear un backup lógico privado de tracker.
Las migraciones existentes se conservan; no ejecutar reset ni down con volúmenes.
Para volver al código anterior, deshabilitar las fuentes automáticas y los
webhooks nuevos, desplegar la revisión anterior y conservar las columnas/tablas
aditivas. Restaurar un dump requiere una decisión explícita sobre datos creados
después del backup; no se automatiza un restore destructivo.

# Gmail reconciliation: evidencia de ejecución

Fecha de cierre técnico: 2026-09-06, America/Costa_Rica. Rama:
`codex/gmail-reconciliation`, creada desde main
`eef015f3a5ff6e212935ff8fc61b22fe839a274e` en worktree aislado.

## 1. Resumen y estado

La funcionalidad está implementada, desplegada y ejercitada con Gmail real:
fuentes, preview asíncrono, selección explícita, trigger automático, persistencia,
idempotencia y dashboard. Queda pendiente reducir y verificar el grant OAuth
existente a gmail.readonly mediante reconexión de Google. Por ese requisito no
se declara cumplida todavía la definición de terminado completa.

La conexión existente funcionó; no se solicitaron ni consultaron client secret,
tokens ni el campo cifrado de credenciales. El editor mostró Account connected y
Custom Scopes desactivado. Las operaciones implementadas son exclusivamente GET;
esto prueba ausencia de modificaciones Gmail en el flujo, pero no un grant mínimo.

## 2. Arquitectura

Dashboard → API pública NestJS → run durable/HTTP 202 → webhook n8n autenticado
→ Gmail → parser MIME y adapter compartidos en NestJS → API interna → tracker.
El dashboard consulta estados y resultados mediante la API pública. Finance
recibe FinancialTransactionCandidate y no conoce nodos Gmail. Las bases tracker
y n8n siguen separadas; cada tabla nueva tiene tenant_id.

ADR-005 decidió core.email_sources, core.email_sync_runs y
core.email_sync_candidates antes de migrar. No se usó integrations.metadata como
EAV. La API controla permisos, período, concurrencia y selección.

## 3. Archivos y ownership

- Data/API: apps/api/src/email-sync y email-ingestion; contratos por dominio.
- Web: componentes email-source-editor, email-sources-manager, email-sync-panel,
  email-feedback, acciones de Integraciones y estilos responsivos.
- n8n: generador, importador que conserva OAuth, tests y diez workflows JSON.
- Lead: schema.prisma, tres migraciones aditivas, barrel de contratos, app.module,
  compose.yaml, privacidad de logs, scripts de comprobación y documentación.
- Verification: tests de política, integración PostgreSQL y revisión de seguridad.

La lista exacta se obtiene con git diff --name-status main...codex/gmail-reconciliation
una vez creado el commit. No se modificó el checkout original ni sus cambios.

## 4. Migraciones

La inicial 20260831211500_init permanece intacta. Se agregaron:

1. 20260904190000_email_reconciliation: fuentes, runs y candidatos, restricciones
   de tenant/concurrencia y claves financieras.
2. 20260905063000_review_candidate_evidence: propuesta financiera fija y hash
   en review queue, sin cuerpos.
3. 20260906032000_action_run_tenant_scope: tenant obligatorio, idempotencia por
   tenant y FK compuesta para errores de orquestación.

Las cuatro migraciones se aplicaron a tracker y desde cero a la base desechable
tracker_gmail_release_verify. Las pruebas sintéticas se ejecutaron únicamente
en bases con sufijo \_verify. Antes de la primera escritura real se creó un dump
lógico privado de tracker, de 55 384 bytes, bajo .private/backups. No se borraron
ni reinicializaron volúmenes reales. El backfill de action_runs falla si existen
huérfanos con ownership ambiguo en una base multitenant.

## 5. Contratos y endpoints

Zod v1: EmailSourceConfiguration, EmailSyncPreviewRequest, EmailSyncPreview,
EmailSyncCandidate, EmailSyncSelectionRequest, EmailSyncRun, EmailSyncRunResult,
EmailProcessingResult y BankEmailAdapterResult.

Las rutas solicitadas están implementadas. Se agregaron options, context,
process-message y cancel para mantener configuración, selección y transiciones
bajo autoridad de la API. La tabla completa está en gmail-reconciliation.md.

Listados paginados, tenant scope, DTO/Zod, OpenAPI, correlation ID, errores
estructurados, modo local explícito e internal service authentication.
Comprobaciones HTTP reales: 202 preview/selección, 401 sin clave interna,
404 para otro tenant, 400 para fecha fuera del mes y 409 para fuente ocupada.

## 6. Workflows

Diez workflows importados; siete publicados en runtime: 00, 01, 02, 03, 10, 90 y 99. 05, 20 y 98 conservan sus IDs y permanecen inactivos; 98 se ejecutó por CLI.
Cinco nodos Gmail tienen vinculación runtime restaurada. Los nodos que requieren Gmail usan
GMAIL_OAUTH_CREDENTIAL_REQUIRED; los JSON carecen de pinData.

Se inspeccionó n8n 2.37.4 instalado: el trigger 1.4 admite búsqueda y filtros,
recupera hasta diez por sondeo y mantiene un cursor anidado por nombre del nodo.
La prueba manual del nodo recupera un mensaje y no sustituye el sondeo programado.
El importador conserva ese cursor y la activación previa de 00; importa inactivo
y publica dependencias porque esta versión rechaza --activeState=fromJson en
modo regular. La prueba real detectó y corrigió dependencias sin publicar.

La validación aplicó filtros temporales privados para 1–4 de septiembre. Al
terminar se restauraron los filtros versionados y se avanzó el cursor al presente
para evitar un replay histórico fuera de la ventana autorizada. El importer
preserva ese cursor en posteriores despliegues.

## 7. Parser

Una muestra privada disponible, HTML sin text/plain, multipart/related e imagen
inline: once comprobaciones locales pasaron. Se verificaron HTML, sender exacto,
monto decimal, moneda, fecha, comercio, máscara, referencia, ausencia de review
por fallo de extracción y exclusión de cuerpos/adjuntos del evento normalizado.
No se copiaron sus valores reales a fixtures, reportes o salidas.

La fixture sintética conserva estructura, etiquetas y codificación necesarias.
El parser limita tamaño, profundidad y partes; interpreta MIME/QP/base64 sin
renderizar ni cargar imágenes. El adapter interpreta la plantilla por separado.
SPF/DKIM/DMARC se evalúan desde Authentication-Results de Gmail; no se afirma
validación criptográfica DKIM independiente. Evidencia ausente o fallida pasa
a revisión. Los importes no usan float.

## 8. Idempotencia y reconciliación

Observación por tenant+gmail+message.id, hash SHA-256 financiero canónico y clave
única financiera por referencia institucional/cuenta. Fallback por campos
financieros normalizados, documentado en ADR-005. El hash no sustituye el ID Gmail.

new crea; exact_duplicate/already_processed no modifican; diferencias o evidencia
insuficiente pasan a review queue con propuesta estructurada. updated permanece
cero. Se probó que una corrección manual no es sobrescrita y que una referencia
igual con diferencias produce revisión, en PostgreSQL desechable.

## 9. Evidencia Gmail real y dashboard

Se usó la conexión OAuth cifrada existente y únicamente mensajes de los primeros
cuatro días del mes. No se enviaron correos ni se marcaron como leídos.

| Ejecución real                          | Encontrados | Elegibles | Seleccionados | Nuevos | Duplicados | En revisión |
| --------------------------------------- | ----------: | --------: | ------------: | -----: | ---------: | ----------: |
| Preview inicial desde dashboard         |          10 |        10 |             0 |      0 |          0 |           0 |
| Selección inicial desde dashboard       |          10 |        10 |             2 |      2 |          0 |           0 |
| Sondeo automático programado de 00      |           — |         — |             — |      8 |          — |           — |
| Repetición de diez desde dashboard      |          10 |        10 |            10 |      0 |         10 |           0 |
| Repetición de diez tras cambiar a tmpfs |          10 |        10 |            10 |      0 |         10 |           0 |

El sondeo programado se midió por diferencia de conteos del ledger; no se
registró un contador agregado de duplicados de esa ejecución.

La prueba manual adicional de 00 recibió un mensaje ya procesado y no duplicó
la transacción. El preview inicial dejó ledger y observaciones vacíos; seleccionar
dos dejó exactamente dos observaciones y transacciones, antes del sondeo automático.

La búsqueda por fecha exacta del 4 de septiembre encontró diez mensajes pero
clasificó los diez fuera de esa fecha financiera: cero elegibles y cero escrituras
financieras. Se canceló ese preview. La repetición mensual volvió a encontrar
los mismos diez no leídos, sin selección automática.

Se ejecutaron en el dashboard búsqueda, selección parcial, procesamiento,
repetición, filtro exacto, cancelación y activación automática de la fuente. Se
verificaron resultado completado, historial y persistencia tras reinicio. La vista
móvil de 390 px no presenta desbordamiento horizontal; se corrigió una columna
grid que inicialmente ampliaba la página. No se guardaron screenshots privados.

## 10. Conteos finales

tracker: diez transacciones únicas, diez observaciones y cero revisiones financieras.
Las dos repeticiones de diez produjeron diez duplicados cada una, sin inserts;
son veinte decisiones repetidas sobre los mismos diez mensajes, no veinte correos
distintos. Ningún conflicto real se observó. Su política y la protección manual
están verificadas mediante datos sintéticos, no atribuidas a Gmail real.

## 11. Pruebas y comandos ejecutados

Todos los siguientes terminaron con exit code 0:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm workflows:validate
docker compose config --quiet
docker compose up --build -d
docker compose ps -a
pnpm workflows:connectivity
```

Suites: once tests de parser, cuatro de política, nueve de workflows y un test
integral PostgreSQL con múltiples escenarios: 25 tests pasaron. Incluyen MIME
HTML-only/imagen, extracción, sender, autenticación inválida/ausente, ID/hash/
referencia duplicados, conflicto, aislamiento, fecha/mes, límite diez, exclusión
de leídos, selección explícita, corrección manual y proyecciones sin cuerpos.

Comandos de reproducción desde la raíz:

```text
pnpm exec tsc -p apps/api/tsconfig.json --outDir apps/api/dist-tests --incremental false
node --test apps/api/dist-tests/email-ingestion/bank-purchase-adapter.spec.js apps/api/dist-tests/email-sync/email-sync.policy.spec.js
node --test automation/n8n/scripts/test-gmail-workflows.mjs
node scripts/verify-private-email.cjs
python -X utf8 scripts/verify_email_privacy.py
python -X utf8 scripts/verify_email_runtime_privacy.py
```

Para el test PostgreSQL, crear primero una base tracker\_\*verify vacía, aplicar
migrate deploy y proporcionar EMAIL_TEST_DATABASE_URL mediante entorno privado;
no imprimir la URL. Ejecutar el spec compilado email-sync.integration.spec.js
con dependencias disponibles. La ejecución realizada usó la imagen API, un mount
del directorio compilado y la base tracker_gmail_release_verify. Sin esa variable
el test se omite; una omisión no cuenta como éxito de integración.

El reinicio de postgres, api, web y n8n conservó conteos y un fingerprint privado
de todos los movimientos financieros sin cambios. Health checks y conectividad
n8n → API → PostgreSQL pasaron. Jobs migrate/import finalizaron en 0.

## 12. Seguridad y privacidad

La revisión descubrió que save=none en n8n aún escribe el input inicial hasta
podarlo. Se cambió a filesystem sobre tmpfs privado de 128 MiB y modo 0700,
sin migrar almacenamiento anterior. Una ejecución real nueva completa dejó
cero filas de payload en execution_data de PostgreSQL. El reinicio eliminó un
marcador temporal del tmpfs y conservó los datos de dominio.

Se eliminaron exactamente catorce ejecuciones de prueba de esta tarea que ya
estaban marcadas para borrado, incluidos sus payloads iniciales. No se eliminó
historial previo del usuario. No se certifica la ausencia de cuerpos en ese
historial antiguo; su revisión de retención sigue pendiente.

El escaneo del diff y archivos nuevos contra identificadores de la muestra y
patrones de tokens pasó; también los logs API/web/n8n, con cero coincidencias.
.private continúa ignorada, excluida de Docker/Prettier. No se versionaron secretos,
IDs de credencial runtime ni mensajes reales. Los reportes crudos y el backup
permanecen en .private, fuera de Git.

n8n audit terminó en 0. Reporta Code/HTTP Request como superficies de riesgo y
la instancia fijada 2.37.4 como desactualizada. No equivale a ausencia de riesgos;
la actualización requiere trabajo de compatibilidad separado. Un intento de audit
durante recreación del contenedor falló porque el servicio no estaba iniciado;
se repitió después del despliegue y pasó.

## 13. Limitaciones explícitas

- Falta reconectar la credencial con Custom Scopes exclusivamente gmail.readonly
  y verificar el grant. No se leyó ni descifró un token para inferirlo.
- Autenticación pública local, sin OIDC/RLS de producción.
- Un adapter de plantilla; otros bancos necesitan su adapter y fixture sanitizada.
- No hubo diferencias reales que llevar a revisión; sí pruebas sintéticas reales
  contra PostgreSQL de esa política.
- El perfil scale está bloqueado y su guard de arranque se ejecutó: terminó con
  el código 1 esperado y el error constante documentado. Compartir snapshots requiere
  diseño de almacenamiento transitorio. La composición validada usa regular.
- Snapshots de n8n en RAM se pierden al reiniciar; el estado autoritativo del run
  y la idempotencia viven en tracker. No se hizo una prueba de corte eléctrico
  durante una llamada Gmail activa.
- No se validaron beta comercial, despliegue público ni toda combinación de
  estados visuales con fallos inyectados; existen estados loading/empty/error/
  partial/completed implementados.

## 14. Integración desde el worktree

1. Revisar el commit de codex/gmail-reconciliation y este informe. El checkout main
   mantiene cambios ajenos: no hacer reset ni sobreescribirlos.
2. Integrar por PR o merge revisado cuando main esté preparado. El commit local
   se creó sin firma: Git tiene GPG activado pero no dispone de la clave privada
   en este entorno. No se cambió esa configuración; firmar antes de integrar si
   la política del proyecto lo exige. No se hizo push ni merge automáticamente.
3. Conservar el entorno privado existente y respaldar tracker antes de migrar.
4. Detener n8n con docker compose stop n8n antes de importar. Ejecutar la
   validación completa de AGENTS.md, incluido up --build -d. El
   importador restaura la credencial desde el almacén cifrado y mantiene el cursor.
5. Verificar health, workflows:connectivity y una lectura del dashboard. No
   reejecutar un catchup histórico sin una ventana explícitamente autorizada.

Rollback: deshabilitar fuentes automáticas/webhooks nuevos, volver al código
anterior y conservar las tablas/columnas aditivas. Restaurar un backup afectaría
movimientos posteriores y requiere decisión explícita; no se automatiza.

## 15. Próximo paso requerido

En la conexión Gmail existente de n8n: activar Custom Scopes, introducir solo
https://www.googleapis.com/auth/gmail.readonly y completar la reconexión Google
con el mismo cliente. La política de uso del navegador exige que el usuario
complete un cambio de credencial de autenticación. No necesita compartir client
ID, client secret ni tokens. Después se repetirá una lectura acotada e idempotente
para cerrar ese requisito y actualizar la evidencia del scope.

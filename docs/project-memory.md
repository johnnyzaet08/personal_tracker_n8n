# Durable Project Memory

This document is the compact starting context for future tasks. It records verified facts, not desired future behavior. Refresh it after releases or material architecture changes.

## Baseline

- Repository: `personal_tracker_n8n`.
- Baseline commit: `b6b5467 feat: initialize financial tracker platform`.
- Default branch: `main`.
- Baseline checked on: 2026-09-10, America/Costa_Rica. Finance delivery 2 and the Gmail workstream are integrated on `codex/finance-monthly-budget`; see their validation reports.
- Local status at that check: PostgreSQL, API, web, and n8n healthy; migration and workflow-import jobs exited successfully with code 0.
- Baseline integration status was Gmail pending. OAuth and real Gmail preview/selected processing were subsequently exercised by the Gmail reconciliation workstream.

Runtime state can change. Re-run `docker compose ps -a` and the health endpoints instead of treating this section as live telemetry.

## Fixed technology baseline

| Component                             | Version       |
| ------------------------------------- | ------------- |
| Node.js                               | 24.19.0       |
| pnpm                                  | 11.19.0       |
| TypeScript                            | 5.9.3         |
| Next.js                               | 16.3.4        |
| React                                 | 19.2.8        |
| NestJS                                | 12.0.1        |
| Prisma                                | 7.10.0        |
| PostgreSQL                            | 18.6          |
| n8n                                   | 2.37.4        |
| Redis (optional `scale` profile)      | 8.2.1-alpine  |
| Caddy (optional `production` profile) | 2.10.2-alpine |

Update versions only through an explicit dependency task with compatibility research, lockfile changes, clean builds, container rebuilds, and an ADR update when the decision is architectural.

## Implemented topology

- `apps/api`: NestJS modular monolith exposing `/health`, `/api/v1`, and protected `/internal/v1` routes.
- `apps/web`: Next.js App Router dashboard rendered against the API only.
- `packages/contracts`: versioned Zod and TypeScript contracts shared by API and web.
- `packages/database`: Prisma schema, generated client boundary, initial migration, and development-only seed.
- `automation/n8n`: ten versioned workflows plus validation and connectivity scripts.
- `tracker` database: `core`, `finance`, `automation`, `habits`, and `health` schemas.
- `n8n` database: n8n internal state only.
- Docker networks: a public application edge and an internal data network. PostgreSQL has no host port.

## Implemented domain state

- Core tenancy, users, memberships, integrations, and idempotent source events exist.
- Finance accounts, merchants, categories, transactions, recurring payment patterns and obligations, monthly budgets and allocations, classification, action runs, review queue, and notifications exist.
- `habits` and `health` schemas are reserved but intentionally contain no domain tables.
- The development seed creates one deterministic tenant, user, membership, and a Gmail integration while preserving an existing connection state. It creates no fake financial data.
- Empty dashboard and list responses are valid supported states.

## Automation state

Imported workflows:

1. `00 - Gmail - Ingestion`
2. `01 - Email - Router`
3. `02 - Gmail - Reconciliation Preview`
4. `03 - Gmail - Process Selected Messages`
5. `05 - Local - Email Fixture Ingestion`
6. `10 - Finance - Process Candidate`
7. `20 - Important Email - Process`
8. `90 - Review Queue`
9. `98 - System - Connectivity Check`
10. `99 - Error Handler`

Versioned JSONs remain inactive and contain only `GMAIL_OAUTH_CREDENTIAL_REQUIRED`. The runtime importer preserves the existing encrypted Gmail credential reference, publishes manual webhooks and their dependency closure, and preserves the prior activation of 00. n8n 2.37.4 regular mode rejects import `--activeState=fromJson`; import inactive then publish through CLI. Subworkflows must also be published. Actual Gmail evidence and current limitations are recorded in `gmail-reconciliation-validation.md`.

## Gmail reconciliation workstream

- The former isolated branch `codex/gmail-reconciliation` is integrated into the Finance delivery branch. Its original base was main commit `eef015f3a5ff6e212935ff8fc61b22fe839a274e`.
- ADR-005 locates sources/runs/previews in core before additive migrations. No EAV extension.
- The API owns one MIME parser and bank-template adapter, shared by automatic/manual paths. Finance receives a connector-independent candidate.
- Dashboard configuration, current-month/exact-date preview, explicit selection, polling, history and counters are implemented.
- Exact-date mode constrains the Gmail query to that Costa Rica calendar day before applying the ten-message cap.
- Message ID, canonical financial SHA-256 and tenant financial identity prevent duplicates. Conflicts retain a safe proposal in review queue; no financial fields or manual corrections are overwritten.
- Gmail ingestion and manual recurring payments share a tenant advisory lock and recurring-obligation match policy. A recurring reserve is atomically replaced by one canonical `recurring_payment`; concurrent paths cannot double-book it.
- All four migrations passed on existing tracker and a fresh disposable database. A logical private backup preceded the first write.
- Private HTML-only EML passed eleven structural/extraction checks. Synthetic parser/policy and PostgreSQL integration suites passed.
- The real preview returned ten unread eligible messages and created no observations/transactions; the first selection created exactly two transactions. Scheduled Gmail polling added eight; reprocessing ten selected messages reported ten duplicates with no new transactions. Final tracker count is ten transactions, ten observations and zero financial reviews. See the validation report.
- On 2026-09-10, after Finance integration, a new real monthly preview reached `awaiting_selection` with ten eligible rows, zero selected, zero new transactions and no errors. The UI was verified in `/integrations`; no message was processed during this validation.
- n8n execution inputs use private tmpfs: save=none alone still stored initial inputs in 2.37.4. A new real ten-message replay produced zero new execution_data payloads. Fourteen task-owned soft-deleted test executions were removed; earlier user history was preserved. Compose pins regular mode and blocks scale until transient shared storage is designed.
- `.private/` is excluded from Git, Docker build context and formatting. Real messages, tokens, credential IDs and financial values must never be copied into reports or fixtures.

## Security baseline

- Internal endpoints require the service key and return 401 without it.
- API logs redact the internal key and use structured correlation IDs.
- n8n public API, community packages, templates, diagnostics, and version notifications are disabled.
- n8n security audit reports the expected built-in Code and HTTP Request nodes as review surfaces; no community nodes are installed.
- `.env` is ignored. `.env.example` contains placeholders only.
- Application and n8n database users cannot connect to each other's database.

## Deliberately unimplemented

- Production authentication, authorization enforcement, and RLS activation.
- Public rate limiting and a durable application audit log.
- Production retention policy for financial previews and legacy data; encrypted token storage backed by KMS/HSM. New Gmail ingestion stores no bodies or attachments. Reducing the pre-existing OAuth grant to readonly needs a Google reconnection; its editor had Custom Scopes disabled.
- Garmin, health domain models, MCP server, Gmail add-on, and Gmail Pub/Sub.
- Public production deployment, certificate issuance, and runtime validation of the scale profile.
- Full observability, SAST/SCA, container scanning, SBOM generation, and image signing.

## Expansion risks requiring decisions

- The public API currently trusts a development-only `x-tenant-id`; production identity must derive tenant and user membership from an authenticated session.
- n8n currently uses one internal service key and supplies tenant context in payloads. A commercial design must constrain which tenants each machine identity may address.
- RLS is not active, and migration ownership is not yet separated from the runtime database role. Enabling RLS without that split can leave owner bypasses.
- Some foreign keys use resource IDs without composite tenant constraints, so database-level prevention of cross-tenant relationships is incomplete.
- `automation.classifications` still lacks direct tenant_id. `automation.action_runs` now requires tenant_id, tenant-scoped idempotency and a composite event FK; the error handler supplies tenant explicitly.
- Integration uniqueness currently permits one `(tenant, provider, type)` tuple. Decide whether multiple accounts per provider are required before commercial connector work.
- Gmail has parser, policy, workflow and disposable PostgreSQL integration tests, including cross-tenant negatives. A repository CI pipeline and production authorization tests remain pending.

Recommended decision order: product/tenant model, identity and sessions, tenant isolation and RLS, privacy and retention, connector credential boundaries, deployment/recovery, then observability and beta scope. Capture accepted choices in new ADRs rather than editing the existing accepted ADRs.

## Regression boundaries

Do not claim an integration is validated without exercising the real external dependency. Do not couple finance or habits to Gmail, n8n storage, or development tenant behavior. Do not mutate applied migrations; add a new migration. Do not introduce cross-tenant queries without an explicit tenant predicate and tests.

## Refresh checklist

```text
git status --short
git log -1 --oneline
pnpm lint
pnpm typecheck
pnpm build
pnpm workflows:validate
docker compose config --quiet
docker compose ps -a
curl http://localhost:3001/health/database
curl http://localhost:3001/api/v1/integrations/status
```

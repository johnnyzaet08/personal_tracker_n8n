# Durable Project Memory

This document is the compact starting context for future tasks. It records verified facts, not desired future behavior. Refresh it after releases or material architecture changes.

## Baseline

- Repository: `personal_tracker_n8n`.
- Baseline commit: `b6b5467 feat: initialize financial tracker platform`.
- Default branch: `main`.
- Baseline checked on: 2026-09-03, America/Costa_Rica.
- Local status at that check: PostgreSQL, API, web, and n8n healthy; migration and workflow-import jobs exited successfully with code 0.
- Integration status: API available, PostgreSQL connected, n8n running, Gmail pending.

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
- `automation/n8n`: eight versioned workflows plus validation and connectivity scripts.
- `tracker` database: `core`, `finance`, `automation`, `habits`, and `health` schemas.
- `n8n` database: n8n internal state only.
- Docker networks: a public application edge and an internal data network. PostgreSQL has no host port.

## Implemented domain state

- Core tenancy, users, memberships, integrations, and idempotent source events exist.
- Finance accounts, merchants, categories, transactions, recurring payments, classification, action runs, review queue, and notifications exist.
- `habits` and `health` schemas are reserved but intentionally contain no domain tables.
- The development seed creates one deterministic tenant, user, membership, and a pending Gmail integration. It creates no fake financial data.
- Empty dashboard and list responses are valid supported states.

## Automation state

Imported workflows:

1. `00 - Gmail - Ingestion`
2. `01 - Email - Router`
3. `05 - Local - Email Fixture Ingestion`
4. `10 - Finance - Process Candidate`
5. `20 - Important Email - Process`
6. `90 - Review Queue`
7. `98 - System - Connectivity Check`
8. `99 - Error Handler`

All are inactive by default. The Gmail workflow contains `GMAIL_OAUTH_CREDENTIAL_REQUIRED`; Gmail OAuth has not been configured or validated. The connectivity workflow has verified n8n to API to PostgreSQL without inserting domain data.

## Security baseline

- Internal endpoints require the service key and return 401 without it.
- API logs redact the internal key and use structured correlation IDs.
- n8n public API, community packages, templates, diagnostics, and version notifications are disabled.
- n8n security audit reports the expected built-in Code and HTTP Request nodes as review surfaces; no community nodes are installed.
- `.env` is ignored. `.env.example` contains placeholders only.
- Application and n8n database users cannot connect to each other's database.

## Deliberately unimplemented

- Real Gmail OAuth and processing of real mail.
- Bank-specific parsers or extraction rules; anonymized fixtures are required first.
- Raw `.eml` parsing; the local workflow currently accepts the normalized email contract.
- Production authentication, authorization enforcement, and RLS activation.
- Public rate limiting and a durable application audit log.
- Automated retention/redaction of stored email bodies and encrypted token storage backed by KMS/HSM.
- Garmin, health domain models, MCP server, Gmail add-on, and Gmail Pub/Sub.
- Public production deployment, certificate issuance, and runtime validation of the scale profile.
- Full observability, SAST/SCA, container scanning, SBOM generation, and image signing.

## Expansion risks requiring decisions

- The public API currently trusts a development-only `x-tenant-id`; production identity must derive tenant and user membership from an authenticated session.
- n8n currently uses one internal service key and supplies tenant context in payloads. A commercial design must constrain which tenants each machine identity may address.
- RLS is not active, and migration ownership is not yet separated from the runtime database role. Enabling RLS without that split can leave owner bypasses.
- Some foreign keys use resource IDs without composite tenant constraints, so database-level prevention of cross-tenant relationships is incomplete.
- `automation.classifications` and `automation.action_runs` do not carry a direct `tenant_id`; this blocks safe tenant-scoped autonomous actions when no source event exists.
- Integration uniqueness currently permits one `(tenant, provider, type)` tuple. Decide whether multiple accounts per provider are required before commercial connector work.
- There is no automated test suite or CI pipeline yet. Negative cross-tenant tests are mandatory before multiuser release.

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

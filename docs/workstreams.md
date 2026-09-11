# Parallel Workstreams

This repository uses domain-oriented workstreams inside a modular monolith. Parallelism is useful when ownership is explicit; it is harmful when several workers rewrite the same contract, migration, or registration file.

## Active workstreams

### Architecture and product expansion

Purpose: discuss and sequence decisions that affect more than one domain. Typical subjects are authentication, tenant isolation and RLS, public deployment, privacy and retention, observability, integration strategy, product packaging, and commercial readiness.

Outputs are decision proposals, ADRs, risk registers, and ordered implementation slices. This stream does not silently implement decisions while they are still under discussion.

### Financial core

Purpose: preserve and evolve the current finance foundation. The Gmail purchase adapter now has a synthetic fixture and local private validation; new institutions still require representative sanitized structures. Gmail is a replaceable connector and is not part of the finance domain model.

### Habits product stream

Purpose: develop habits as a separate domain using the existing tenant, API, dashboard, and automation boundaries. Initial work must define the product behavior before adding schema objects.

The first habits proposal should decide:

- Habit types and measurement semantics.
- Schedules, timezone behavior, streak definition, and missed-day policy.
- Manual check-ins versus automated evidence.
- Editing and correction history.
- Reminders and notification consent.
- Retention, privacy, and export requirements.
- MVP dashboard views and accessibility expectations.

Until those decisions are approved, do not create speculative health or Garmin models. Habits-specific objects belong in the `habits` schema and should use tenant-scoped IDs, timestamptz timestamps, constraints, and explicit idempotency where automation can repeat.

Known design blockers must be resolved before implementation:

- The current request context resolves `tenantId` but not an authenticated `userId`. Personal habits should not be persisted until ownership is represented explicitly and membership is verified.
- `core.source_events` is nominally generic but its current contract and ingestion path represent email events. Habit check-ins must not reuse it without an approved generalization.
- `automation.action_runs` now has a direct `tenant_id`; future habit reminders must supply validated tenant context and a domain-specific action contract.
- Schedule changes need effective dates; overwriting a schedule would rewrite historical streak semantics.
- A missed day should normally be calculated from schedule plus check-ins, not stored as a fabricated check-in.

Recommended MVP defaults, subject to product approval, are user-owned habits, one aggregated check-in per local day, daily and weekly schedules, a timezone stored on the habit, calculated streaks, and no reminders or gamification in the first vertical slice.

## Suggested implementation workers

Once a vertical slice is approved, the stream lead may delegate:

1. **Domain/database worker:** data invariants, Prisma models, additive migration, indexes, deletion behavior.
2. **API/contracts worker:** versioned shared contracts, DTO validation, tenant-scoped services, OpenAPI and error behavior.
3. **Web worker:** module registry entry, accessible responsive pages, loading/empty/error states, API-only data access.
4. **Automation worker:** optional n8n workflows that use internal APIs and are inactive by default until configured.
5. **Verification worker:** read-only regression review, clean builds, fresh migration, endpoint checks, container health and security checks.

The stream lead owns integration. Workers should not merge independent versions of `schema.prisma`, `contracts/src/index.ts`, `app.module.ts`, or `modules.ts`.

## Branch and integration model

- Create one branch or worktree per approved vertical slice, using the `codex/` prefix for Codex-created branches.
- Start from a clean committed baseline.
- Keep database migrations additive and ordered.
- Rebase or merge the latest baseline before final validation.
- Integrate shared collision files once, after domain-specific work is ready.
- Run the complete validation suite from `AGENTS.md` before merging.

## Decision routing

Use an ADR when a decision changes data ownership, tenant isolation, public contracts, security posture, deployment topology, or a cross-domain boundary. Use an issue or implementation note for local reversible details. Update `docs/project-memory.md` only after the resulting behavior is implemented and verified.

## Gmail reconciliation vertical slice

The lead owns shared Prisma/migrations, contract barrel, app registration and Compose.
Data/API, Gmail/n8n and Web workers implemented separate paths; Verification reviewed
security and exercised tests in a disposable database. Runtime Gmail validation and
private evidence remain under lead control to prevent conflicting imports or expanding
the authorized date window. See ADR-005 and gmail-reconciliation-validation.md.

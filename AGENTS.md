# Agent Operating Guide

Read `docs/project-memory.md`, `docs/architecture.md`, and the relevant ADRs before changing this repository. This file is the durable coordination contract for Codex tasks and subagents.

## Product invariants

- PostgreSQL `tracker` is the source of truth for application data.
- The web application consumes only the NestJS API. It never connects to PostgreSQL or n8n.
- n8n is an orchestrator. It writes domain data only through protected `/internal/v1` API endpoints.
- `tracker` and `n8n` remain separate databases with separate least-privilege users.
- Every domain table is tenant-scoped. Development's default tenant is not a production authentication model.
- External connectors normalize input before it enters a domain. Finance must not depend on Gmail-specific fields.
- Idempotency, structured errors, correlation IDs, secret redaction, and strict input validation are regression boundaries.
- Do not add real credentials, OAuth tokens, email bodies, personal financial data, or generated `.env` files to Git.

## Workstream roles

Use one lead per workstream. A lead may delegate bounded, non-overlapping subtasks to subagents.

| Role                                  | Primary ownership                                                                               | Must coordinate before editing                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Architecture & Product Expansion Lead | `docs/architecture.md`, ADR proposals, cross-domain roadmap                                     | Any runtime code, accepted ADRs, public contracts             |
| Platform/Core Lead                    | `compose.yaml`, `infrastructure/`, `packages/config/`, `core` schema, API common infrastructure | Shared contracts, domain modules, production topology         |
| Finance Lead                          | Finance Prisma models, finance API module, finance dashboard pages                              | Core tenancy, shared ingestion, n8n routing                   |
| Habits Lead                           | Habits domain model, API module, UI module and habits-specific contracts                        | Core tenancy, global navigation, shared contracts, migrations |
| Automation Lead                       | `automation/n8n/`, internal API integration                                                     | Public API, domain persistence rules, connector contracts     |
| Verification & Release Lead           | Read-only review, builds, migrations, health and security checks                                | No product ownership; reports regressions to the owning lead  |

Files with high collision risk require a single assigned editor per change: `packages/database/prisma/schema.prisma`, migration history, `packages/contracts/src/index.ts`, `apps/api/src/app.module.ts`, `apps/web/src/lib/modules.ts`, `compose.yaml`, and the root lockfile.

Before multiple domain streams add contracts, split `packages/contracts/src/index.ts` into domain modules while preserving one stable public barrel. Treat that refactor as an integration task, not as an incidental change inside a feature worker.

## Change protocol

1. State the workstream, outcome, files in scope, and acceptance criteria.
2. Inspect the current branch and dirty files. Never overwrite unrelated user changes.
3. Reserve high-collision files to one agent. Other agents return patches or recommendations to the lead.
4. Keep domain changes vertical when practical: contract, migration, API, UI, automation, tests, and docs.
5. Record durable cross-domain decisions as an ADR. Do not use chat history as the only record.
6. Run proportionate validation before handoff and report commands plus exact results.
7. Handoff with changed files, migrations, environment changes, known limitations, and rollback notes.

For concurrent implementation, prefer separate Git worktrees created from committed state. The saved Codex project currently points to the parent directory, so configure a saved project whose root is `personal_tracker_n8n` before relying on automatic worktree isolation.

## Mandatory validation

Run the checks affected by the change. Before merging a cross-cutting feature, run the complete set:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm workflows:validate
docker compose config --quiet
docker compose up --build -d
pnpm workflows:connectivity
docker compose ps -a
```

Database changes must also prove migration from an empty database in a disposable environment. Never remove persistent volumes unless the user explicitly authorizes the exact destructive scope.

## Handoff template

Every agent handoff should contain:

- Outcome and workstream.
- Files changed and ownership boundaries touched.
- Decisions made or still pending.
- Migration and compatibility impact.
- Commands executed and results.
- Security/privacy review.
- Known limitations and recommended next action.

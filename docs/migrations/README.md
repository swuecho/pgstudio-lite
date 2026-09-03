# Migration Discipline (Drizzle)

## Required checklist for every migration

1. Constraints/defaults

- Define nullability intentionally.
- Add safe defaults when introducing `NOT NULL` columns.
- Avoid behavior-changing defaults unless explicitly documented.

2. Backfill plan

- State whether backfill is needed.
- If needed, include deterministic SQL in the same migration or a staged follow-up.
- Ensure rerun safety (`WHERE` guards or idempotent operations where possible).

3. Rollback note

- Add a brief rollback strategy note.
- For SQLite column removals: document table-rebuild rollback approach.

4. Backward-compatibility note

- Explain why old app versions can still read/write safely during rollout.
- If not backward-compatible, mark the migration as breaking and gate deployment.

## One source of truth

- Runtime always runs `migrate()` on the journal in `drizzle/migrations`; there is no opt-out flag.
- Never mirror a migration in `lib/meta-db.ts` (no `CREATE TABLE IF NOT EXISTS`, no `ALTER TABLE ... ADD COLUMN` fallbacks). A column that exists only in code is invisible to the journal and eventually blocks a real migration, which is exactly what happened with `notebook_cells.last_result_json` (fixed by 0012 plus a one-time repair).
- Remember that Drizzle applies every migration newer than the last recorded `created_at` in one transaction. Recording a migration by hand as "already applied" therefore skips everything older than it that is still pending; only do that for the newest migration, and only when the schema change is already present.

## Usage

- Start from `docs/migrations/MIGRATION_TEMPLATE.sql`.
- Keep checklist notes at the top of each migration SQL file.
- Do not merge migrations missing checklist sections.

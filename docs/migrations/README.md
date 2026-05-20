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

## Usage

- Start from `docs/migrations/MIGRATION_TEMPLATE.sql`.
- Keep checklist notes at the top of each migration SQL file.
- Do not merge migrations missing checklist sections.

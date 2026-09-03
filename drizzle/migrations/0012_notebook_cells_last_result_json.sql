-- Migration: notebook_cells.last_result_json + idx_notebooks_connection_name
-- Checklist:
-- 1) Constraints/defaults:
--    - `last_result_json` is nullable text; a cell with no stored result is NULL.
--    - The index is additive and created IF NOT EXISTS.
-- 2) Backfill:
--    - None in SQL. Until now this column existed only because lib/meta-db.ts added it
--      outside the migration system. Databases that already carry it are handled by a
--      one-time repair in lib/meta-db.ts: the drifted column is renamed aside before
--      this migration runs, then its data is copied back and the alias dropped.
-- 3) Rollback note:
--    - DROP INDEX idx_notebooks_connection_name;
--    - SQLite 3.35+: ALTER TABLE notebook_cells DROP COLUMN last_result_json;
-- Backward-compatibility notes:
-- - Every app version since the column was introduced reads and writes it; this only
--   moves its definition into the migration journal.

ALTER TABLE `notebook_cells` ADD COLUMN `last_result_json` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notebooks_connection_name` ON `notebooks` (`connection_name`);

-- Migration: notebook_cells.notebook_id references notebooks.id (ON DELETE CASCADE)
-- Checklist:
-- 1) Constraints/defaults:
--    - Adds the foreign key that drizzle/schema.ts has declared since 0003 but no
--      migration created. Column definitions, nullability, and defaults are unchanged.
--    - SQLite cannot add a constraint in place, so the table is rebuilt: copy into
--      `__new_notebook_cells`, drop, rename, recreate both indexes.
--    - `PRAGMA foreign_keys` cannot be toggled inside the migrator's transaction, so
--      the rebuild runs with enforcement on. That is safe here because nothing
--      references notebook_cells and the orphan cleanup below runs first.
-- 2) Backfill:
--    - Cells whose notebook no longer exists would violate the new constraint and
--      are deleted first. The application has always deleted cells with their
--      notebook (lib/notebook-db/notebooks.ts), so such rows are leftovers from
--      crashes or hand edits, not reachable data.
-- 3) Rollback note:
--    - Rebuild again without the FOREIGN KEY clause (same statements, same indexes).
-- Backward-compatibility notes:
-- - Every app version deletes cells explicitly before the notebook, so the cascade
--   never fires for code paths that exist today; it is a safety net.
-- - Older app versions read and write the same columns and keep working.

DELETE FROM `notebook_cells` WHERE `notebook_id` NOT IN (SELECT `id` FROM `notebooks`);
--> statement-breakpoint
CREATE TABLE `__new_notebook_cells` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`collapsed` integer DEFAULT false NOT NULL,
	`last_run_status` text,
	`last_run_at` text,
	`last_duration_ms` integer,
	`last_row_count` integer,
	`last_result_json` text,
	`last_error` text,
	`metadata_json` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notebook_cells` (`id`, `notebook_id`, `position`, `type`, `content`, `collapsed`, `last_run_status`, `last_run_at`, `last_duration_ms`, `last_row_count`, `last_result_json`, `last_error`, `metadata_json`, `updated_at`)
SELECT `id`, `notebook_id`, `position`, `type`, `content`, `collapsed`, `last_run_status`, `last_run_at`, `last_duration_ms`, `last_row_count`, `last_result_json`, `last_error`, `metadata_json`, `updated_at`
FROM `notebook_cells`;
--> statement-breakpoint
DROP TABLE `notebook_cells`;
--> statement-breakpoint
ALTER TABLE `__new_notebook_cells` RENAME TO `notebook_cells`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notebook_cells_notebook_position` ON `notebook_cells` (`notebook_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_notebook_cells_updated_at` ON `notebook_cells` (`updated_at`);

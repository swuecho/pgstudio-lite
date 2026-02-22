-- Migration: add notebooks.description
-- Checklist:
-- 1) Constraints/defaults:
--    - `description` is `NOT NULL DEFAULT ''` to keep inserts backward-compatible.
-- 2) Backfill:
--    - Existing rows receive `''` via default and an explicit normalization update.
-- 3) Rollback note:
--    - SQLite cannot drop a column directly; rollback requires table rebuild without `description`.
-- Backward-compatibility notes:
-- - Old code paths that do not write `description` continue to work because of the default.
-- - Read paths are backward-compatible because the new column is additive.
ALTER TABLE `notebooks` ADD COLUMN `description` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `notebooks` SET `description` = '' WHERE `description` IS NULL;

-- Migration: add notebooks.metadata_json
-- Checklist:
-- 1) Constraints/defaults:
--    - `metadata_json` is `NOT NULL DEFAULT '{}'` to keep inserts backward-compatible.
-- 2) Backfill:
--    - Existing rows receive `'{}'` via default and an explicit normalization update.
-- 3) Rollback note:
--    - SQLite cannot drop a column directly; rollback requires table rebuild without `metadata_json`.
-- Backward-compatibility notes:
-- - Old code paths that do not write `metadata_json` continue to work because of the default.
-- - Read paths remain backward-compatible because the new column is additive.
ALTER TABLE `notebooks` ADD COLUMN `metadata_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `notebooks` SET `metadata_json` = '{}' WHERE `metadata_json` IS NULL OR trim(`metadata_json`) = '';

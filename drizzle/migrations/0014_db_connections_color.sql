-- Migration: db_connections.color
-- Checklist:
-- 1) Constraints/defaults:
--    - `color` is nullable text holding a palette id from lib/connection-color.ts
--      ('red', 'blue', ...). NULL means no color, which renders exactly as before.
--    - Not an enum/CHECK on purpose: the palette lives in application code, and the
--      API validates the id, so adding a color later needs no migration.
-- 2) Backfill:
--    - None. Existing connections stay NULL and keep the untinted editor background.
-- 3) Rollback note:
--    - SQLite 3.35+: ALTER TABLE db_connections DROP COLUMN color;
--      Older engines: rebuild db_connections without the column.
-- Backward-compatibility notes:
-- - Additive and nullable, so an older app version ignores the column and keeps
--   reading and writing connections normally.

ALTER TABLE `db_connections` ADD `color` text;

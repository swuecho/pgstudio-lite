-- Migration: notebook_runs + notebook_schedules
-- Checklist:
-- 1) Constraints/defaults:
--    - Both tables are new; every NOT NULL column has a default or is always written by the app.
--    - notebook_runs.status is 'running' | 'success' | 'error'; trigger is 'manual' | 'scheduled'.
--    - notebook_schedules.notebook_id is the primary key, so a notebook has at most one schedule.
--    - Both reference notebooks(id) ON DELETE CASCADE so deleting a notebook removes its history.
-- 2) Backfill:
--    - None. Existing notebooks simply have no runs and no schedule row (read as "disabled").
-- 3) Rollback note:
--    - DROP INDEX idx_notebook_schedules_due; DROP TABLE notebook_schedules;
--    - DROP INDEX idx_notebook_runs_notebook_started; DROP TABLE notebook_runs;
-- Backward-compatibility notes:
-- - Additive only. Older app versions never read these tables and keep working unchanged.

CREATE TABLE `notebook_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`cell_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`notebook_title` text NOT NULL,
	`connection_name` text NOT NULL,
	`input_values_json` text DEFAULT '{}' NOT NULL,
	`snapshot_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notebook_runs_notebook_started` ON `notebook_runs` (`notebook_id`,`started_at`);
--> statement-breakpoint
CREATE TABLE `notebook_schedules` (
	`notebook_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_minutes` integer DEFAULT 60 NOT NULL,
	`next_run_at` text,
	`last_run_at` text,
	`last_run_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notebook_schedules_due` ON `notebook_schedules` (`enabled`,`next_run_at`);

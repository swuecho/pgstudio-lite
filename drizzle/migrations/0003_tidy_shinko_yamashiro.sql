CREATE TABLE `notebook_cells` (
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
	`last_error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notebook_cells_notebook_position` ON `notebook_cells` (`notebook_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_notebook_cells_updated_at` ON `notebook_cells` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`connection_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notebooks_updated_at` ON `notebooks` (`updated_at`);

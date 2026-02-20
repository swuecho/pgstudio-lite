CREATE TABLE IF NOT EXISTS `query_history` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_name` text NOT NULL,
	`query_text` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`row_count` integer,
	`error_text` text,
	`executed_at` text NOT NULL,
	`started_at` text NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_history_executed_at` ON `query_history` (`executed_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `query_snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`query_text` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_snippets_updated_at` ON `query_snippets` (`updated_at`);

CREATE TABLE IF NOT EXISTS `db_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`connection_string` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_db_connections_name` ON `db_connections` (`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_db_connections_default` ON `db_connections` (`is_default`);

CREATE TABLE `__new_query_snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`query_text` text NOT NULL,
	`connection_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_query_snippets` (`id`, `title`, `query_text`, `connection_name`, `created_at`, `updated_at`)
SELECT
	`id`,
	`title`,
	`query_text`,
	COALESCE(
		NULLIF((SELECT `name` FROM `db_connections` WHERE `is_default` = 1 LIMIT 1), ''),
		NULLIF((SELECT `name` FROM `db_connections` ORDER BY `name` LIMIT 1), ''),
		'default'
	),
	`created_at`,
	`updated_at`
FROM `query_snippets`;
--> statement-breakpoint
DROP TABLE `query_snippets`;
--> statement-breakpoint
ALTER TABLE `__new_query_snippets` RENAME TO `query_snippets`;
--> statement-breakpoint
CREATE INDEX `idx_query_snippets_connection_updated_at` ON `query_snippets` (`connection_name`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_query_snippets_updated_at` ON `query_snippets` (`updated_at`);

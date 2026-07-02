CREATE TABLE `table_foreign_key_display` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_name` text NOT NULL,
	`schema_name` text NOT NULL,
	`table_name` text NOT NULL,
	`display_columns_json` text NOT NULL,
	`display_template` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_table_foreign_key_display_target` ON `table_foreign_key_display` (`connection_name`,`schema_name`,`table_name`);

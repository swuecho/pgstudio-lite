CREATE TABLE `table_editor_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_name` text NOT NULL,
	`title` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`active_table` text NOT NULL,
	`filter_column` text,
	`filter_mode` text,
	`filter_value` text,
	`filter_value_end` text,
	`view_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_table_editor_bookmarks_connection_view_key` ON `table_editor_bookmarks` (`connection_name`,`view_key`);
--> statement-breakpoint
CREATE INDEX `idx_table_editor_bookmarks_connection_updated` ON `table_editor_bookmarks` (`connection_name`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `table_editor_recent_views` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_name` text NOT NULL,
	`active_table` text NOT NULL,
	`filter_column` text,
	`filter_mode` text,
	`filter_value` text,
	`filter_value_end` text,
	`view_key` text NOT NULL,
	`visited_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_table_editor_recent_views_connection_view_key` ON `table_editor_recent_views` (`connection_name`,`view_key`);
--> statement-breakpoint
CREATE INDEX `idx_table_editor_recent_views_connection_visited` ON `table_editor_recent_views` (`connection_name`,`visited_at`);

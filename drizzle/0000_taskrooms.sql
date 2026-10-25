CREATE TABLE `draft_image_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`message_id` text,
	`owner_site_user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_image_attachments_client` ON `draft_image_attachments` (`owner_site_user_id`,`task_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `draft_image_attachments_cleanup` ON `draft_image_attachments` (`owner_site_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `image_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`message_id` text,
	`owner_site_user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_attachments_client` ON `image_attachments` (`owner_site_user_id`,`task_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `image_attachments_message` ON `image_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `mcp_event_deliveries` (
	`message_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`event_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_event_deliveries_claim_id_unique` ON `mcp_event_deliveries` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_event_deliveries_message_subscription` ON `mcp_event_deliveries` (`message_id`,`subscription_id`);--> statement-breakpoint
CREATE TABLE `mcp_event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_site_user_id` text NOT NULL,
	`event_name` text NOT NULL,
	`task_id` text,
	`sealed_delivery` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_event_subscriptions_owner_expiry` ON `mcp_event_subscriptions` (`owner_site_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`message_id` text PRIMARY KEY NOT NULL,
	`owner_site_user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`author_verified` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`attachment_json` text DEFAULT '[]' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`client_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`delivery` text DEFAULT 'pending' NOT NULL,
	`author_verified` integer DEFAULT false NOT NULL,
	`author_site_user_id` text,
	`reply_to` text,
	`context_message_id` text,
	`historical_summary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_client_id_unique` ON `messages` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_reply_to_unique` ON `messages` (`reply_to`);--> statement-breakpoint
CREATE INDEX `messages_task_time` ON `messages` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`message_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`status` text DEFAULT 'attempted' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_deliveries_claim_id_unique` ON `push_deliveries` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_deliveries_message_subscription` ON `push_deliveries` (`message_id`,`subscription_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_site_user_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`create_request_hash` text,
	`progress_json` text,
	`activity_json` text,
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '相談' NOT NULL,
	`updated_at` text NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`author_site_user_id` text,
	`last_viewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_client_id_unique` ON `tasks` (`client_id`);
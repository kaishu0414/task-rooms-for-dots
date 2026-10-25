CREATE INDEX `messages_task_role_time` ON `messages` (`task_id`,`role`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_role_delivery_time` ON `messages` (`role`,`delivery`,`created_at`);
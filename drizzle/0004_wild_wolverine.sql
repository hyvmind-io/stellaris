ALTER TABLE `modules` ADD `tags` text;--> statement-breakpoint
UPDATE `modules` SET `tags` = json_array(`provider`) WHERE `tags` IS NULL;
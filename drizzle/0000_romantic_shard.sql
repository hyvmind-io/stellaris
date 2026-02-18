CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key_hash` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`permissions` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `gpg_public_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` integer NOT NULL,
	`key_id` text NOT NULL,
	`ascii_armor` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`source_url` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gpg_keys_provider_idx` ON `gpg_public_keys` (`provider_id`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`namespace` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`version` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`description` text,
	`source` text,
	`location` text,
	`definition` text,
	`downloads` integer DEFAULT 0 NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_unique_idx` ON `modules` (`namespace`,`name`,`provider`,`version`);--> statement-breakpoint
CREATE INDEX `modules_namespace_idx` ON `modules` (`namespace`);--> statement-breakpoint
CREATE INDEX `modules_published_at_idx` ON `modules` (`published_at`);--> statement-breakpoint
CREATE TABLE `provider_platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` integer NOT NULL,
	`os` text NOT NULL,
	`arch` text NOT NULL,
	`filename` text NOT NULL,
	`shasum` text NOT NULL,
	`location` text,
	`shasum_url` text,
	`shasum_signature_url` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_platforms_unique_idx` ON `provider_platforms` (`provider_id`,`os`,`arch`);--> statement-breakpoint
CREATE INDEX `provider_platforms_provider_idx` ON `provider_platforms` (`provider_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`namespace` text NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`protocols` text NOT NULL,
	`published_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `providers_unique_idx` ON `providers` (`namespace`,`type`,`version`);--> statement-breakpoint
CREATE INDEX `providers_namespace_idx` ON `providers` (`namespace`);
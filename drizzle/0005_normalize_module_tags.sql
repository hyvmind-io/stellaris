-- Normalize modules.tags to valid JSON arrays of strings.
-- Fixes legacy rows where tags was stored as plain text (e.g. "aws")
-- causing JSON.parse crashes at the ORM level.

-- Step 1: NULL or empty → default to json_array(provider)
UPDATE `modules` SET `tags` = json_array(`provider`) WHERE `tags` IS NULL OR `tags` = '';--> statement-breakpoint

-- Step 2: Invalid JSON (plain text like "aws") → wrap as single-element array
UPDATE `modules` SET `tags` = json_array(`tags`) WHERE json_valid(`tags`) = 0;--> statement-breakpoint

-- Step 3: Valid JSON but not an array (e.g. a bare JSON string, number, object) → wrap in array
UPDATE `modules` SET `tags` = json_array(json_extract(`tags`, '$')) WHERE json_valid(`tags`) = 1 AND json_type(`tags`) != 'array';

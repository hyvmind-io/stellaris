-- Login/signup throttling moved to the Workers Rate Limiting binding.
-- Hand-written, forward-only (see 0007 for the convention).
DROP TABLE IF EXISTS `rate_limits`;

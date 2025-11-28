-- Migration 013: Fix mood_rating enum to match application code
-- File: infrastructure/postgres/migrations/013_fix_mood_rating_enum.sql

BEGIN;

-- Drop the old enum type and recreate with correct values
-- First, we need to alter the column to use varchar temporarily
ALTER TABLE mood_entries ALTER COLUMN mood_rating TYPE VARCHAR(20);

-- Drop the old enum type
DROP TYPE IF EXISTS mood_rating;

-- Create the new enum type with correct values
CREATE TYPE mood_rating AS ENUM ('very_poor', 'poor', 'neutral', 'good', 'very_good');

-- Convert the column back to use the enum
ALTER TABLE mood_entries ALTER COLUMN mood_rating TYPE mood_rating USING mood_rating::mood_rating;

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('013_fix_mood_rating_enum');

COMMIT;

-- Migration 006: Remove unique constraint on mood_entries to allow multiple entries per day
-- File: infrastructure/postgres/migrations/006_remove_mood_entry_unique_constraint.sql

BEGIN;

-- Drop the unique constraint on (user_id, entry_date)
ALTER TABLE mood_entries DROP CONSTRAINT IF EXISTS mood_entries_user_id_entry_date_key;

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('006_remove_mood_entry_unique_constraint');

COMMIT;

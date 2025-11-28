-- Migration 012: Add category and recommendation to mood insights
-- File: infrastructure/postgres/migrations/012_mood_insights_enhancements.sql

BEGIN;

-- Add new columns to mood_insights
ALTER TABLE mood_insights 
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS recommendation TEXT,
ADD COLUMN IF NOT EXISTS related_entity_id UUID;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_mood_insights_category ON mood_insights(category);
CREATE INDEX IF NOT EXISTS idx_mood_insights_related_entity ON mood_insights(related_entity_id);

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('012_mood_insights_enhancements');

COMMIT;

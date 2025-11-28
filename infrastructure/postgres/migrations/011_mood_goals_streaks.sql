-- Migration 011: Add streak tracking to mood goals
-- File: infrastructure/postgres/migrations/011_mood_goals_streaks.sql

BEGIN;

-- Add streak tracking columns to mood_goals
ALTER TABLE mood_goals 
ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_mood_goals_current_streak ON mood_goals(current_streak);
CREATE INDEX IF NOT EXISTS idx_mood_goals_longest_streak ON mood_goals(longest_streak);

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('011_mood_goals_streaks');

COMMIT;

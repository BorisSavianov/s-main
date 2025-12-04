-- Migration: 014_counselor_queue.sql
-- Description: Add counselor queue table for anonymous chat matching

-- Create enum for queue status
DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM ('waiting', 'matched', 'left');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create counselor_queue table
CREATE TABLE IF NOT EXISTS counselor_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    matched_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_queue_status CHECK (status IN ('waiting', 'matched', 'left'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_counselor_queue_counselor_id ON counselor_queue(counselor_id);
CREATE INDEX IF NOT EXISTS idx_counselor_queue_status ON counselor_queue(status);
CREATE INDEX IF NOT EXISTS idx_counselor_queue_waiting ON counselor_queue(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_counselor_queue_joined_at ON counselor_queue(joined_at);

-- Trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_counselor_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_counselor_queue_updated_at ON counselor_queue;
CREATE TRIGGER trigger_counselor_queue_updated_at
    BEFORE UPDATE ON counselor_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_counselor_queue_updated_at();

-- Comment on table
COMMENT ON TABLE counselor_queue IS 'Tracks counselors waiting to be matched with users for anonymous chat';
COMMENT ON COLUMN counselor_queue.status IS 'Current queue status: waiting, matched, or left';
COMMENT ON COLUMN counselor_queue.matched_session_id IS 'Session ID when counselor is matched with a user';

-- Migration 004: Chat System Tables
-- File: infrastructure/postgres/migrations/004_chat_system.sql

BEGIN;

-- Chat sessions table
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    counselor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    is_anonymous BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    summary TEXT,
    overall_sentiment DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages table
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('user', 'ai', 'counselor')),
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text',
    sentiment_score DECIMAL(3,2),
    is_flagged BOOLEAN DEFAULT false,
    flag_reason TEXT,
    embedding VECTOR(1536), -- For semantic search
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat session summaries table
CREATE TABLE chat_session_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    key_topics TEXT[],
    sentiment_analysis JSONB,
    recommendations TEXT[],
    created_by VARCHAR(20) DEFAULT 'ai',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI conversation context table
CREATE TABLE ai_context (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    context_data JSONB NOT NULL,
    personality_traits JSONB,
    conversation_history JSONB,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id)
);

-- Message attachments table
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(100),
    is_image BOOLEAN DEFAULT false,
    is_document BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_counselor_id ON chat_sessions(counselor_id);
CREATE INDEX idx_chat_sessions_token ON chat_sessions(session_token);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(is_active);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX idx_chat_messages_sender_type ON chat_messages(sender_type);
CREATE INDEX idx_chat_messages_flagged ON chat_messages(is_flagged);
CREATE INDEX idx_chat_session_summaries_session_id ON chat_session_summaries(session_id);
CREATE INDEX idx_ai_context_session_id ON ai_context(session_id);
CREATE INDEX idx_ai_context_user_id ON ai_context(user_id);
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);

-- Vector search index for semantic search
CREATE INDEX idx_chat_messages_embedding ON chat_messages USING ivfflat (embedding vector_cosine_ops);

-- Create triggers for updated_at columns
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_session_summaries_updated_at BEFORE UPDATE ON chat_session_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically end inactive sessions
CREATE OR REPLACE FUNCTION end_inactive_sessions()
RETURNS void AS $$
BEGIN
    UPDATE chat_sessions 
    SET 
        is_active = false,
        ended_at = CURRENT_TIMESTAMP
    WHERE 
        is_active = true 
        AND started_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND ended_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('004_chat_system');

COMMIT;
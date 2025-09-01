-- Migration 009: Video Chat Service Tables
-- File: infrastructure/postgres/migrations/009_video_service.sql

BEGIN;

-- Create custom types for video service
CREATE TYPE room_status AS ENUM ('waiting', 'active', 'ended', 'cancelled');
CREATE TYPE participant_role AS ENUM ('host', 'moderator', 'participant', 'observer');
CREATE TYPE participant_status AS ENUM ('connecting', 'connected', 'reconnecting', 'disconnected');
CREATE TYPE session_type AS ENUM ('video_call', 'screen_share', 'recording', 'live_stream');

-- Video rooms table
CREATE TABLE video_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) UNIQUE NOT NULL,
    meeting_id UUID REFERENCES scheduled_meetings(id) ON DELETE SET NULL,
    host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Access control
    access_code VARCHAR(50) NOT NULL,
    moderator_code VARCHAR(50) NOT NULL,
    max_participants INTEGER DEFAULT 2,
    
    -- Recording settings
    is_recording_enabled BOOLEAN DEFAULT false,
    is_recording_active BOOLEAN DEFAULT false,
    recording_url TEXT,
    
    -- Room configuration
    room_settings JSONB DEFAULT '{
        "audioEnabled": true,
        "videoEnabled": true,
        "screenShareEnabled": true,
        "chatEnabled": true,
        "waitingRoomEnabled": false,
        "muteOnEntry": false,
        "backgroundBlurEnabled": false,
        "maxVideosVisible": 4
    }',
    
    -- WebRTC configuration
    rtc_configuration JSONB DEFAULT '{
        "iceServers": [
            {
                "urls": [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302"
                ]
            }
        ]
    }',
    
    -- Room state
    status room_status DEFAULT 'waiting',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Video participants table
CREATE TABLE video_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL REFERENCES video_rooms(room_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Participant info
    display_name VARCHAR(255) NOT NULL,
    role participant_role DEFAULT 'participant',
    status participant_status DEFAULT 'connecting',
    
    -- Device capabilities
    device_capabilities JSONB DEFAULT '{
        "video": true,
        "audio": true,
        "screenShare": false,
        "recording": false
    }',
    
    -- Current media state
    media_state JSONB DEFAULT '{
        "video": true,
        "audio": true,
        "screenShare": false,
        "speaking": false,
        "dominantSpeaker": false
    }',
    
    -- Connection statistics
    connection_stats JSONB DEFAULT '{}',
    
    -- Additional info
    avatar_url TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata for IP, user agent, etc.
    metadata JSONB DEFAULT '{}',
    
    -- System fields
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(room_id, user_id)
);

-- Video sessions table (for detailed session tracking)
CREATE TABLE video_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL REFERENCES video_rooms(room_id) ON DELETE CASCADE,
    initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session details
    type session_type DEFAULT 'video_call',
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Session data and events
    session_data JSONB DEFAULT '{}',
    recording_metadata JSONB DEFAULT '{}',
    
    -- System fields
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Video chat messages table (optional - for persistent chat)
CREATE TABLE video_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL REFERENCES video_rooms(room_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Message content
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text', -- 'text', 'emoji', 'system', 'file'
    
    -- File attachment info (if applicable)
    file_url TEXT,
    file_name VARCHAR(255),
    file_size INTEGER,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Video room invitations table (for scheduled meetings)
CREATE TABLE video_room_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL REFERENCES video_rooms(room_id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Invitation details
    invitation_token VARCHAR(255) UNIQUE,
    role participant_role DEFAULT 'participant',
    
    -- Response tracking
    response VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    responded_at TIMESTAMP WITH TIME ZONE,
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(room_id, invited_user_id)
);

-- Create comprehensive indexes
CREATE INDEX idx_video_rooms_room_id ON video_rooms(room_id);
CREATE INDEX idx_video_rooms_meeting_id ON video_rooms(meeting_id);
CREATE INDEX idx_video_rooms_host_user_id ON video_rooms(host_user_id);
CREATE INDEX idx_video_rooms_status ON video_rooms(status);
CREATE INDEX idx_video_rooms_created_at ON video_rooms(created_at);
CREATE INDEX idx_video_rooms_started_at ON video_rooms(started_at);

CREATE INDEX idx_video_participants_room_id ON video_participants(room_id);
CREATE INDEX idx_video_participants_user_id ON video_participants(user_id);
CREATE INDEX idx_video_participants_status ON video_participants(status);
CREATE INDEX idx_video_participants_role ON video_participants(role);
CREATE INDEX idx_video_participants_joined_at ON video_participants(joined_at);

CREATE INDEX idx_video_sessions_room_id ON video_sessions(room_id);
CREATE INDEX idx_video_sessions_initiator_user_id ON video_sessions(initiator_user_id);
CREATE INDEX idx_video_sessions_type ON video_sessions(type);
CREATE INDEX idx_video_sessions_started_at ON video_sessions(started_at);

CREATE INDEX idx_video_chat_messages_room_id ON video_chat_messages(room_id);
CREATE INDEX idx_video_chat_messages_user_id ON video_chat_messages(user_id);
CREATE INDEX idx_video_chat_messages_created_at ON video_chat_messages(created_at);

CREATE INDEX idx_video_room_invitations_room_id ON video_room_invitations(room_id);
CREATE INDEX idx_video_room_invitations_invited_user_id ON video_room_invitations(invited_user_id);
CREATE INDEX idx_video_room_invitations_response ON video_room_invitations(response);
CREATE INDEX idx_video_room_invitations_expires_at ON video_room_invitations(expires_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_video_rooms_updated_at 
    BEFORE UPDATE ON video_rooms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_participants_updated_at 
    BEFORE UPDATE ON video_participants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_sessions_updated_at 
    BEFORE UPDATE ON video_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_chat_messages_updated_at 
    BEFORE UPDATE ON video_chat_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_room_invitations_updated_at 
    BEFORE UPDATE ON video_room_invitations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create video session when room becomes active
CREATE OR REPLACE FUNCTION create_video_session_on_room_start()
RETURNS TRIGGER AS $
BEGIN
    -- When room status changes from 'waiting' to 'active', create a session
    IF OLD.status = 'waiting' AND NEW.status = 'active' THEN
        INSERT INTO video_sessions (room_id, initiator_user_id, type)
        VALUES (NEW.room_id, NEW.host_user_id, 'video_call');
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER create_video_session_on_room_start_trigger
    AFTER UPDATE ON video_rooms
    FOR EACH ROW EXECUTE FUNCTION create_video_session_on_room_start();

-- Function to end video session when room ends
CREATE OR REPLACE FUNCTION end_video_session_on_room_end()
RETURNS TRIGGER AS $
BEGIN
    -- When room status changes to 'ended', end all active sessions
    IF OLD.status = 'active' AND NEW.status = 'ended' THEN
        UPDATE video_sessions 
        SET 
            ended_at = NEW.ended_at,
            session_data = COALESCE(session_data, '{}'::jsonb) || jsonb_build_object(
                'duration', EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) * 1000,
                'endReason', 'room_ended'
            )
        WHERE room_id = NEW.room_id AND ended_at IS NULL;
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER end_video_session_on_room_end_trigger
    AFTER UPDATE ON video_rooms
    FOR EACH ROW EXECUTE FUNCTION end_video_session_on_room_end();

-- Function to update participant last_seen timestamp
CREATE OR REPLACE FUNCTION update_participant_last_seen()
RETURNS TRIGGER AS $
BEGIN
    -- Update last_seen when media_state or connection_stats change
    IF OLD.media_state IS DISTINCT FROM NEW.media_state OR 
       OLD.connection_stats IS DISTINCT FROM NEW.connection_stats THEN
        NEW.last_seen = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER update_participant_last_seen_trigger
    BEFORE UPDATE ON video_participants
    FOR EACH ROW EXECUTE FUNCTION update_participant_last_seen();

-- Function to automatically clean up expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $
BEGIN
    DELETE FROM video_room_invitations 
    WHERE expires_at < CURRENT_TIMESTAMP 
      AND response = 'pending';
END;
$ LANGUAGE plpgsql;

-- Function to automatically cleanup old ended rooms (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_video_rooms()
RETURNS INTEGER AS $
DECLARE
    cleanup_count INTEGER;
BEGIN
    -- Delete rooms that have been ended for more than 7 days
    -- This also cascades to delete participants, sessions, chat messages, etc.
    DELETE FROM video_rooms 
    WHERE status = 'ended' 
      AND ended_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    RETURN cleanup_count;
END;
$ LANGUAGE plpgsql;

-- Add some sample data for testing (optional)
-- This would typically be done through the application, but useful for development

-- Insert a test video room linked to the first scheduled meeting (if any exist)
INSERT INTO video_rooms (
    room_id,
    meeting_id,
    host_user_id,
    access_code,
    moderator_code,
    max_participants,
    room_settings,
    metadata
)
SELECT 
    'room_test_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::TEXT,
    sm.id,
    sm.counselor_id,
    'JOIN123',
    'MOD456',
    2,
    '{
        "audioEnabled": true,
        "videoEnabled": true,
        "screenShareEnabled": true,
        "chatEnabled": true,
        "waitingRoomEnabled": false,
        "muteOnEntry": false,
        "backgroundBlurEnabled": true,
        "maxVideosVisible": 2
    }'::jsonb,
    '{
        "topic": "Counseling Session",
        "createdFor": "testing"
    }'::jsonb
FROM scheduled_meetings sm 
WHERE sm.status = 'scheduled'
  AND sm.scheduled_start > CURRENT_TIMESTAMP
  AND NOT EXISTS (
      SELECT 1 FROM video_rooms vr WHERE vr.meeting_id = sm.id
  )
LIMIT 1;

-- Create view for active rooms with participant counts
CREATE VIEW active_video_rooms_summary AS
SELECT 
    vr.id,
    vr.room_id,
    vr.meeting_id,
    vr.host_user_id,
    vr.status,
    vr.started_at,
    vr.room_settings,
    COUNT(vp.id) FILTER (WHERE vp.status = 'connected') as active_participants,
    COUNT(vp.id) as total_participants,
    vr.max_participants,
    CASE 
        WHEN vr.started_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (COALESCE(vr.ended_at, CURRENT_TIMESTAMP) - vr.started_at)) * 1000
        ELSE 0
    END as duration_ms,
    vr.created_at,
    vr.updated_at
FROM video_rooms vr
LEFT JOIN video_participants vp ON vr.room_id = vp.room_id
WHERE vr.status IN ('waiting', 'active')
GROUP BY vr.id, vr.room_id, vr.meeting_id, vr.host_user_id, vr.status, 
         vr.started_at, vr.ended_at, vr.room_settings, vr.max_participants, 
         vr.created_at, vr.updated_at;

-- Create view for room statistics
CREATE VIEW video_room_statistics AS
SELECT 
    DATE_TRUNC('day', vr.created_at) as date,
    COUNT(*) as total_rooms_created,
    COUNT(*) FILTER (WHERE vr.status = 'ended') as completed_rooms,
    COUNT(*) FILTER (WHERE vr.status = 'cancelled') as cancelled_rooms,
    AVG(
        CASE WHEN vr.ended_at IS NOT NULL AND vr.started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (vr.ended_at - vr.started_at)) / 60.0 
        END
    ) as avg_duration_minutes,
    SUM(
        (SELECT COUNT(*) FROM video_participants vp WHERE vp.room_id = vr.room_id)
    ) as total_participants
FROM video_rooms vr
WHERE vr.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', vr.created_at)
ORDER BY date DESC;

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('009_video_service');

COMMIT;
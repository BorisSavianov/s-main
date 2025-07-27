-- Migration 007: System Configuration Tables
-- File: infrastructure/postgres/migrations/007_system_config.sql

BEGIN;

-- System configuration table
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    data_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    is_sensitive BOOLEAN DEFAULT false,
    is_editable BOOLEAN DEFAULT true,
    category VARCHAR(50) DEFAULT 'general',
    validation_rules JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    request_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System health metrics table
CREATE TABLE system_health_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    metric_type VARCHAR(20) DEFAULT 'gauge', -- 'gauge', 'counter', 'histogram'
    tags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Feature flags table
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    flag_key VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_users UUID[],
    target_roles user_role[],
    conditions JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API rate limits table
CREATE TABLE api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(200) NOT NULL,
    requests_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    window_duration_seconds INTEGER DEFAULT 3600,
    max_requests INTEGER DEFAULT 1000,
    is_blocked BOOLEAN DEFAULT false,
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint, window_start)
);

-- System announcements table
CREATE TABLE system_announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    announcement_type VARCHAR(50) DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
    target_roles user_role[],
    is_active BOOLEAN DEFAULT true,
    is_dismissible BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User announcement dismissals table
CREATE TABLE user_announcement_dismissals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    announcement_id UUID NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, announcement_id)
);

-- Create indexes
CREATE INDEX idx_system_config_key ON system_config(key);
CREATE INDEX idx_system_config_category ON system_config(category);
CREATE INDEX idx_system_config_sensitive ON system_config(is_sensitive);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_system_health_metrics_service ON system_health_metrics(service_name);
CREATE INDEX idx_system_health_metrics_metric ON system_health_metrics(metric_name);
CREATE INDEX idx_system_health_metrics_timestamp ON system_health_metrics(timestamp);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled);
CREATE INDEX idx_feature_flags_name ON feature_flags(flag_name);
CREATE INDEX idx_api_rate_limits_user_id ON api_rate_limits(user_id);
CREATE INDEX idx_api_rate_limits_endpoint ON api_rate_limits(endpoint);
CREATE INDEX idx_api_rate_limits_window_start ON api_rate_limits(window_start);
CREATE INDEX idx_api_rate_limits_blocked ON api_rate_limits(is_blocked);
CREATE INDEX idx_system_announcements_active ON system_announcements(is_active);
CREATE INDEX idx_system_announcements_dates ON system_announcements(starts_at, ends_at);
CREATE INDEX idx_user_announcement_dismissals_user_id ON user_announcement_dismissals(user_id);

-- Create triggers for updated_at columns
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_rate_limits_updated_at BEFORE UPDATE ON api_rate_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_announcements_updated_at BEFORE UPDATE ON system_announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add configuration for embedding model
INSERT INTO system_config (key, value, description, is_sensitive) VALUES
('ollama_embedding_model', 'nomic-embed-text', 'Ollama embedding model name', false),
('embedding_dimensions', '768', 'Embedding vector dimensions', false),
('semantic_search_threshold', '0.7', 'Default semantic search similarity threshold', false),
('max_semantic_results', '10', 'Maximum results for semantic search', false)
ON CONFLICT (key) DO UPDATE SET 
value = EXCLUDED.value,
updated_at = CURRENT_TIMESTAMP;


-- Insert default system configuration
INSERT INTO system_config (key, value, description, is_sensitive) VALUES
('app_name', 'Mental Health Support Platform', 'Application name', false),
('app_version', '1.0.0', 'Current application version', false),
('max_session_duration', '3600', 'Maximum session duration in seconds', false),
('default_appointment_duration', '60', 'Default appointment duration in minutes', false),
('ai_model_name', 'llama3.2:3b', 'Default AI model for chat', false),
('max_daily_ai_messages', '50', 'Maximum AI messages per user per day', false),
('enable_anonymous_chat', 'true', 'Allow anonymous chat sessions', false),
('maintenance_mode', 'false', 'Enable maintenance mode', false);

-- Create default admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, is_verified) VALUES
('admin@mentalhealth.app', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewUL3cQIGm/vG.bO', 'System', 'Administrator', 'admin', true, true);

-- Create a sample counselor user
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, is_verified) VALUES
('counselor@mentalhealth.app', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewUL3cQIGm/vG.bO', 'Dr. Sarah', 'Johnson', 'counselor', true, true);

-- Create counselor profile for the sample counselor
INSERT INTO counselor_profiles (user_id, license_number, specialties, qualifications, experience_years, hourly_rate, bio, languages)
SELECT 
    id,
    'PSY-2024-001',
    ARRAY['Anxiety', 'Depression', 'Trauma', 'Relationship Issues'],
    ARRAY['PhD in Clinical Psychology', 'Licensed Clinical Psychologist', 'Trauma-Informed Care Certification'],
    8,
    120.00,
    'Dr. Sarah Johnson is a licensed clinical psychologist with over 8 years of experience helping individuals overcome anxiety, depression, and trauma. She specializes in cognitive behavioral therapy and trauma-informed care approaches.',
    ARRAY['English', 'Spanish']
FROM users 
WHERE email = 'counselor@mentalhealth.app';

-- Set default availability for the counselor (Monday-Friday, 9 AM - 5 PM)
INSERT INTO counselor_availability (counselor_id, day_of_week, start_time, end_time)
SELECT 
    id,
    generate_series(1, 5), -- Monday to Friday
    '09:00'::time,
    '17:00'::time
FROM users 
WHERE email = 'counselor@mentalhealth.app';

COMMIT;

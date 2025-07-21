-- Migration 006: Notification System Tables
-- File: infrastructure/postgres/migrations/006_notifications.sql

BEGIN;

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    status notification_status DEFAULT 'pending',
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_category VARCHAR(50) NOT NULL, -- 'appointments', 'mood_reminders', 'system', 'marketing'
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    frequency VARCHAR(20) DEFAULT 'immediate', -- 'immediate', 'daily', 'weekly', 'disabled'
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, notification_category)
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(100) UNIQUE NOT NULL,
    template_category VARCHAR(50) NOT NULL,
    subject_template TEXT,
    body_template TEXT NOT NULL,
    supported_channels notification_type[],
    variables JSONB, -- Array of variable names used in template
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Push notification subscriptions table
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

-- Notification batch jobs table
CREATE TABLE notification_batch_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL, -- 'scheduled', 'bulk', 'campaign'
    target_users UUID[],
    template_id UUID REFERENCES notification_templates(id),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    total_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_category ON notification_preferences(notification_category);
CREATE INDEX idx_notification_templates_category ON notification_templates(template_category);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active);
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(is_active);
CREATE INDEX idx_notification_batch_jobs_status ON notification_batch_jobs(status);
CREATE INDEX idx_notification_batch_jobs_scheduled_for ON notification_batch_jobs(scheduled_for);

-- Create triggers for updated_at columns
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_push_subscriptions_updated_at BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_batch_jobs_updated_at BEFORE UPDATE ON notification_batch_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check notification preferences
CREATE OR REPLACE FUNCTION should_send_notification(
    p_user_id UUID,
    p_category VARCHAR(50),
    p_type notification_type,
    p_scheduled_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS BOOLEAN AS $$
DECLARE
    prefs RECORD;
    is_quiet_hours BOOLEAN DEFAULT false;
    current_time TIME;
BEGIN
    -- Get user preferences
    SELECT * INTO prefs 
    FROM notification_preferences 
    WHERE user_id = p_user_id AND notification_category = p_category;
    
    -- If no preferences found, use defaults
    IF NOT FOUND THEN
        RETURN true;
    END IF;
    
    -- Check if notification type is enabled
    CASE p_type
        WHEN 'email' THEN
            IF NOT prefs.email_enabled THEN RETURN false; END IF;
        WHEN 'sms' THEN
            IF NOT prefs.sms_enabled THEN RETURN false; END IF;
        WHEN 'push' THEN
            IF NOT prefs.push_enabled THEN RETURN false; END IF;
        WHEN 'in_app' THEN
            IF NOT prefs.in_app_enabled THEN RETURN false; END IF;
    END CASE;
    
    -- Check quiet hours
    IF prefs.quiet_hours_start IS NOT NULL AND prefs.quiet_hours_end IS NOT NULL THEN
        current_time := p_scheduled_time::TIME;
        
        IF prefs.quiet_hours_start <= prefs.quiet_hours_end THEN
            -- Same day quiet hours
            is_quiet_hours := current_time BETWEEN prefs.quiet_hours_start AND prefs.quiet_hours_end;
        ELSE
            -- Overnight quiet hours
            is_quiet_hours := current_time >= prefs.quiet_hours_start OR current_time <= prefs.quiet_hours_end;
        END IF;
        
        IF is_quiet_hours THEN RETURN false; END IF;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Insert default notification templates
INSERT INTO notification_templates (template_name, template_category, subject_template, body_template, supported_channels, variables) VALUES
('appointment_reminder', 'appointments', 'Appointment Reminder', 'Hi {{user_name}}, you have an appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}}.', ARRAY['email', 'sms', 'push'], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('mood_reminder', 'mood_reminders', 'Daily Mood Check-in', 'Don''t forget to log your mood for today! It only takes a minute.', ARRAY['push', 'in_app'], '["user_name"]'),
('appointment_confirmed', 'appointments', 'Appointment Confirmed', 'Your appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}} has been confirmed.', ARRAY['email', 'push', 'in_app'], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('appointment_cancelled', 'appointments', 'Appointment Cancelled', 'Your appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}} has been cancelled.', ARRAY['email', 'push', 'in_app'], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('welcome', 'system', 'Welcome to Mental Health Support', 'Welcome {{user_name}}! We''re here to support you on your mental health journey.', ARRAY['email', 'in_app'], '["user_name"]'),
('password_reset', 'system', 'Password Reset Request', 'Click the link below to reset your password: {{reset_link}}', ARRAY['email'], '["user_name", "reset_link"]');

-- Insert default notification preferences for common categories
INSERT INTO notification_preferences (user_id, notification_category, email_enabled, sms_enabled, push_enabled, in_app_enabled, frequency)
SELECT 
    id,
    unnest(ARRAY['appointments', 'mood_reminders', 'system', 'marketing']),
    true,
    false,
    true,
    true,
    'immediate'
FROM users;

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('006_notifications');

COMMIT;
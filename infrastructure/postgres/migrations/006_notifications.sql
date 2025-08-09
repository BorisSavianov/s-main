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
  p_user_id        UUID,
  p_category       VARCHAR(50),
  p_type           notification_type,
  p_scheduled_time TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
  prefs            RECORD;
  is_quiet_hours   BOOLEAN DEFAULT false;
  v_scheduled_time TIME;            -- rename variable
BEGIN
  -- Load preferences
  SELECT * INTO prefs
    FROM notification_preferences
   WHERE user_id = p_user_id
     AND notification_category = p_category;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Check channel enabled
  CASE p_type
    WHEN 'email'   THEN IF NOT prefs.email_enabled   THEN RETURN false; END IF;
    WHEN 'sms'     THEN IF NOT prefs.sms_enabled     THEN RETURN false; END IF;
    WHEN 'push'    THEN IF NOT prefs.push_enabled    THEN RETURN false; END IF;
    WHEN 'in_app'  THEN IF NOT prefs.in_app_enabled  THEN RETURN false; END IF;
  END CASE;

  -- Quiet‐hours
  IF prefs.quiet_hours_start IS NOT NULL
     AND prefs.quiet_hours_end IS NOT NULL THEN

    -- cast once into our renamed variable
    v_scheduled_time := p_scheduled_time::TIME;

    IF prefs.quiet_hours_start <= prefs.quiet_hours_end THEN
      is_quiet_hours := v_scheduled_time
                        BETWEEN prefs.quiet_hours_start
                            AND prefs.quiet_hours_end;
    ELSE
      is_quiet_hours := v_scheduled_time >= prefs.quiet_hours_start
                      OR v_scheduled_time <= prefs.quiet_hours_end;
    END IF;

    IF is_quiet_hours THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;



-- Insert default notification templates
INSERT INTO notification_templates (
    template_name,
    template_category,
    subject_template,
    body_template,
    supported_channels,
    variables
) VALUES
-- Existing ones
('appointment-reminder', 'appointments', 'Appointment Reminder', 'Hi {{user_name}}, you have an appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}}.',
 ARRAY['email'::notification_type, 'sms'::notification_type, 'push'::notification_type], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('mood-reminder', 'mood_reminders', 'Daily Mood Check-in', 'Don''t forget to log your mood for today! It only takes a minute.',
 ARRAY['push'::notification_type, 'in_app'::notification_type], '["user_name"]'),
('appointment-confirmed', 'appointments', 'Appointment Confirmed', 'Your appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}} has been confirmed.',
 ARRAY['email'::notification_type, 'push'::notification_type, 'in_app'::notification_type], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('appointment-cancelled', 'appointments', 'Appointment Cancelled', 'Your appointment with {{counselor_name}} on {{appointment_date}} at {{appointment_time}} has been cancelled.',
 ARRAY['email'::notification_type, 'push'::notification_type, 'in_app'::notification_type], '["user_name", "counselor_name", "appointment_date", "appointment_time"]'),
('welcome', 'system', 'Welcome to Mental Health Support', 'Welcome {{user_name}}! We''re here to support you on your mental health journey.',
 ARRAY['email'::notification_type, 'in_app'::notification_type], '["user_name"]'),
('password-reset', 'system', 'Password Reset Request', 'Click the link below to reset your password: {{reset_link}}',
 ARRAY['email'::notification_type], '["user_name", "reset_link"]'),

-- New ones from missing templates
('account-deactivated', 'system', 'Account Deactivated', 'Hello {{user_name}}, your account has been deactivated. Your data will be retained for {{reactivation_period}} days. Contact {{support_email}} to reactivate.',
 ARRAY['email'::notification_type], '["user_name", "reactivation_period", "support_email"]'),
('chat-service-alert', 'alerts', '[{{severity}}] Chat Service Alert', 'Type: {{type}}, Session ID: {{session_id}}, Message ID: {{message_id}}, Reason: {{reason}}',
 ARRAY['email'::notification_type, 'push'::notification_type], '["severity", "type", "session_id", "message_id", "reason"]'),
('crisis-intervention', 'alerts', '🚨 URGENT - Crisis Intervention Required', 'Session ID: {{session_id}}, Message ID: {{message_id}}, Crisis Type: {{crisis_type}}, Confidence: {{confidence}}',
 ARRAY['email'::notification_type, 'push'::notification_type], '["session_id", "message_id", "crisis_type", "confidence"]'),
('email-verification', 'system', 'Verify Your Email Address', 'Welcome to {{platform_name}}! Click here to verify your email: {{verification_url}}',
 ARRAY['email'::notification_type], '["platform_name", "verification_url"]'),
('password-changed', 'security', 'Password Changed Successfully', 'Hello {{user_name}}, your password was changed on {{timestamp}}. If this wasn''t you, contact {{support_email}} immediately.',
 ARRAY['email'::notification_type, 'push'::notification_type], '["user_name", "timestamp", "support_email"]'),
('suspicious-activity', 'security', 'Suspicious Activity Alert', 'Hello {{user_name}}, we detected suspicious activity: {{activity_type}} at {{timestamp}}. Review settings here: {{security_url}}.',
 ARRAY['email'::notification_type, 'push'::notification_type], '["user_name", "activity_type", "timestamp", "security_url", "support_email"]'),
('login-alert', 'security', 'New Login Alert', 'Hello {{user_name}}, we detected a new login to your account. Time: {{timestamp}}, IP Address: {{ip_address}}, Device: {{user_agent}}. If this was you, no action is needed. If you don''t recognize this login, please change your password immediately and contact {{support_email}}.',
 ARRAY['email'::notification_type, 'push'::notification_type], '["user_name", "timestamp", "ip_address", "user_agent", "support_email"]');


-- First, let's see what templates you currently have
SELECT template_name, subject_template, body_template, variables 
FROM notification_templates 
WHERE template_name IN ('login-alert', 'email-verification', 'password-reset', 'welcome');

-- Now let's fix the templates with proper Handlebars syntax
-- Update login-alert template
UPDATE notification_templates 
SET 
  subject_template = 'New Login Alert',
  body_template = '<h2>New Login Detected</h2>
<p>Hello {{user_name}},</p>
<p>We detected a new login to your account:</p>
<ul>
<li><strong>Time:</strong> {{timestamp}}</li>
<li><strong>IP Address:</strong> {{ip_address}}</li>
<li><strong>Device:</strong> {{user_agent}}</li>
</ul>
<p>If this was you, no action is needed. If you don''t recognize this login, please change your password immediately and contact <a href="mailto:{{support_email}}">{{support_email}}</a>.</p>
<p>Best regards,<br>The Serenity Space Team</p>',
  variables = '["user_name", "timestamp", "ip_address", "user_agent", "support_email"]'::jsonb
WHERE template_name = 'login-alert';

-- Update email-verification template  
UPDATE notification_templates 
SET 
  subject_template = 'Verify Your Email Address',
  body_template = '<h2>Welcome to {{platform_name}}!</h2>
<p>Thank you for signing up. To complete your registration, please verify your email address by clicking the button below:</p>
<p style="text-align: center;">
<a href="{{verification_url}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email Address</a>
</p>
<p>If the button doesn''t work, you can copy and paste this link into your browser:</p>
<p>{{verification_url}}</p>
<p>This link will expire in 24 hours for security reasons.</p>
<p>Best regards,<br>The {{platform_name}} Team</p>',
  variables = '["platform_name", "verification_url"]'::jsonb
WHERE template_name = 'email-verification';

-- Insert email-verification template if it doesn't exist
INSERT INTO notification_templates (
    template_name,
    template_category,
    subject_template,
    body_template,
    supported_channels,
    variables
) 
SELECT 
    'email-verification',
    'system',
    'Verify Your Email Address',
    '<h2>Welcome to {{platform_name}}!</h2>
<p>Thank you for signing up. To complete your registration, please verify your email address by clicking the button below:</p>
<p style="text-align: center;">
<a href="{{verification_url}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email Address</a>
</p>
<p>If the button doesn''t work, you can copy and paste this link into your browser:</p>
<p>{{verification_url}}</p>
<p>This link will expire in 24 hours for security reasons.</p>
<p>Best regards,<br>The {{platform_name}} Team</p>',
    ARRAY['email'::notification_type],
    '["platform_name", "verification_url"]'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates 
    WHERE template_name = 'email-verification'
);

-- Update password-reset template
UPDATE notification_templates 
SET 
  subject_template = 'Password Reset Request',
  body_template = '<h2>Password Reset Request</h2>
<p>Hello {{user_name}},</p>
<p>You requested to reset your password. Click the button below to set a new password:</p>
<p style="text-align: center;">
<a href="{{reset_link}}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
</p>
<p>If the button doesn''t work, you can copy and paste this link into your browser:</p>
<p>{{reset_link}}</p>
<p>This link will expire in 1 hour for security reasons.</p>
<p>If you didn''t request this password reset, please ignore this email.</p>
<p>Best regards,<br>The Serenity Space Team</p>',
  variables = '["user_name", "reset_link"]'::jsonb
WHERE template_name = 'password-reset';

-- Insert password-reset template if it doesn't exist
INSERT INTO notification_templates (
    template_name,
    template_category,
    subject_template,
    body_template,
    supported_channels,
    variables
) 
SELECT 
    'password-reset',
    'system',
    'Password Reset Request',
    '<h2>Password Reset Request</h2>
<p>Hello {{user_name}},</p>
<p>You requested to reset your password. Click the button below to set a new password:</p>
<p style="text-align: center;">
<a href="{{reset_link}}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
</p>
<p>If the button doesn''t work, you can copy and paste this link into your browser:</p>
<p>{{reset_link}}</p>
<p>This link will expire in 1 hour for security reasons.</p>
<p>If you didn''t request this password reset, please ignore this email.</p>
<p>Best regards,<br>The Serenity Space Team</p>',
    ARRAY['email'::notification_type],
    '["user_name", "reset_link"]'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates 
    WHERE template_name = 'password-reset'
);


-- Clean up all the corrupted supported_channels
UPDATE notification_templates 
SET supported_channels = ARRAY['email']::notification_type[]
WHERE template_name = 'email-verification';

UPDATE notification_templates 
SET supported_channels = ARRAY['email']::notification_type[]
WHERE template_name = 'password-reset';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push']::notification_type[]
WHERE template_name = 'login-alert';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push']::notification_type[]
WHERE template_name = 'password-changed';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push']::notification_type[]
WHERE template_name = 'suspicious-activity';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push']::notification_type[]
WHERE template_name = 'chat-service-alert';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push']::notification_type[]
WHERE template_name = 'crisis-intervention';

UPDATE notification_templates 
SET supported_channels = ARRAY['email']::notification_type[]
WHERE template_name = 'account-deactivated';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push', 'in_app']::notification_type[]
WHERE template_name = 'appointment-confirmed';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'push', 'in_app']::notification_type[]
WHERE template_name = 'appointment-cancelled';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'sms', 'push']::notification_type[]
WHERE template_name = 'appointment-reminder';

UPDATE notification_templates 
SET supported_channels = ARRAY['push', 'in_app']::notification_type[]
WHERE template_name = 'mood-reminder';

UPDATE notification_templates 
SET supported_channels = ARRAY['email', 'in_app']::notification_type[]
WHERE template_name = 'welcome';

-- Verify the changes
SELECT template_name, supported_channels, variables 
FROM notification_templates 
ORDER BY template_name;


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
-- Migration 008: Advanced Scheduling Service
-- File: infrastructure/postgres/migrations/008_scheduling_service.sql

BEGIN;

-- Create custom types for scheduling
CREATE TYPE meeting_type AS ENUM ('audio_only', 'video_call', 'phone_call', 'in_person');
CREATE TYPE meeting_status AS ENUM ('scheduled', 'confirmed', 'rescheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE recurring_pattern AS ENUM ('none', 'daily', 'weekly', 'biweekly', 'monthly');
CREATE TYPE reminder_type AS ENUM ('email', 'sms', 'push', 'in_app');

-- Enhanced scheduling table (extends appointments)
CREATE TABLE scheduled_meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Meeting details
    title VARCHAR(200) DEFAULT 'Counseling Session',
    description TEXT,
    meeting_type meeting_type DEFAULT 'video_call',
    
    -- Timing
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    buffer_before_minutes INTEGER DEFAULT 5,
    buffer_after_minutes INTEGER DEFAULT 5,
    
    -- Status and workflow
    status meeting_status DEFAULT 'scheduled',
    confirmation_required BOOLEAN DEFAULT true,
    confirmed_by_user BOOLEAN DEFAULT false,
    confirmed_by_counselor BOOLEAN DEFAULT false,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    -- Recurring meetings
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern recurring_pattern DEFAULT 'none',
    recurring_interval INTEGER DEFAULT 1, -- every N weeks/months
    recurring_until DATE,
    parent_meeting_id UUID REFERENCES scheduled_meetings(id) ON DELETE SET NULL,
    
    -- Video/communication details
    meeting_room_id VARCHAR(255),
    meeting_room_url TEXT,
    meeting_room_password VARCHAR(100),
    phone_number VARCHAR(50),
    dial_in_code VARCHAR(20),
    
    -- Location (for in-person meetings)
    location_name VARCHAR(200),
    location_address TEXT,
    location_room VARCHAR(100),
    
    -- Preparation and notes
    preparation_notes TEXT,
    session_notes TEXT,
    session_summary TEXT,
    
    -- Cancellation/rescheduling
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    rescheduled_from UUID REFERENCES scheduled_meetings(id) ON DELETE SET NULL,
    rescheduled_to UUID REFERENCES scheduled_meetings(id) ON DELETE SET NULL,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    CONSTRAINT valid_end_time CHECK (scheduled_end > scheduled_start),
    CONSTRAINT valid_buffer_times CHECK (buffer_before_minutes >= 0 AND buffer_after_minutes >= 0)
);

-- Meeting reminders table
CREATE TABLE meeting_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES scheduled_meetings(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_type reminder_type NOT NULL,
    
    -- Timing
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    minutes_before INTEGER NOT NULL,
    
    -- Status
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Content
    title VARCHAR(200),
    message TEXT,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(meeting_id, recipient_id, minutes_before, reminder_type)
);

-- Time slots table for availability management
CREATE TABLE counselor_time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Slot timing
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Availability
    is_available BOOLEAN DEFAULT true,
    is_booked BOOLEAN DEFAULT false,
    meeting_id UUID REFERENCES scheduled_meetings(id) ON DELETE SET NULL,
    
    -- Slot configuration
    slot_duration_minutes INTEGER DEFAULT 60,
    buffer_minutes INTEGER DEFAULT 15,
    max_bookings INTEGER DEFAULT 1,
    current_bookings INTEGER DEFAULT 0,
    
    -- Pricing (can override counselor default)
    custom_rate DECIMAL(10,2),
    
    -- Recurring slot configuration
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern recurring_pattern DEFAULT 'none',
    recurring_until DATE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_slot_time CHECK (end_time > start_time),
    CONSTRAINT valid_bookings CHECK (current_bookings <= max_bookings)
);

-- Meeting participants table (for group sessions in the future)
CREATE TABLE meeting_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES scheduled_meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Participation details
    role VARCHAR(50) DEFAULT 'participant', -- 'participant', 'observer', 'facilitator'
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invitation_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Response
    response VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'tentative'
    responded_at TIMESTAMP WITH TIME ZONE,
    
    -- Attendance
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    attendance_status VARCHAR(20) DEFAULT 'invited', -- 'invited', 'joined', 'left', 'no_show'
    
    -- Communication preferences
    can_share_video BOOLEAN DEFAULT true,
    can_share_audio BOOLEAN DEFAULT true,
    can_share_screen BOOLEAN DEFAULT false,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(meeting_id, user_id)
);

-- Meeting recordings table (for future video service)
CREATE TABLE meeting_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES scheduled_meetings(id) ON DELETE CASCADE,
    
    -- Recording details
    recording_url TEXT,
    recording_size_bytes BIGINT,
    duration_seconds INTEGER,
    
    -- Access control
    is_available BOOLEAN DEFAULT false,
    is_processed BOOLEAN DEFAULT false,
    access_expires_at TIMESTAMP WITH TIME ZONE,
    download_count INTEGER DEFAULT 0,
    max_downloads INTEGER DEFAULT 10,
    
    -- Permissions
    accessible_to_user BOOLEAN DEFAULT true,
    accessible_to_counselor BOOLEAN DEFAULT true,
    requires_consent BOOLEAN DEFAULT true,
    consent_given_by UUID[] DEFAULT '{}',
    
    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    processing_error TEXT,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Scheduling preferences table
CREATE TABLE scheduling_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Default preferences
    preferred_meeting_type meeting_type DEFAULT 'video_call',
    preferred_duration_minutes INTEGER DEFAULT 60,
    preferred_buffer_minutes INTEGER DEFAULT 5,
    
    -- Notification preferences
    enable_reminders BOOLEAN DEFAULT true,
    reminder_times INTEGER[] DEFAULT ARRAY[1440, 60, 15], -- 24h, 1h, 15min before
    preferred_reminder_types reminder_type[] DEFAULT ARRAY['email', 'push']::reminder_type[],
    
    -- Timezone and availability
    timezone VARCHAR(50) DEFAULT 'UTC',
    earliest_time TIME DEFAULT '08:00',
    latest_time TIME DEFAULT '18:00',
    available_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Monday-Friday
    
    -- Booking preferences
    require_counselor_confirmation BOOLEAN DEFAULT true,
    allow_last_minute_booking BOOLEAN DEFAULT false,
    minimum_advance_hours INTEGER DEFAULT 2,
    maximum_advance_days INTEGER DEFAULT 30,
    
    -- Cancellation preferences
    allow_cancellation BOOLEAN DEFAULT true,
    cancellation_deadline_hours INTEGER DEFAULT 24,
    allow_rescheduling BOOLEAN DEFAULT true,
    max_reschedules INTEGER DEFAULT 2,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id)
);

-- Scheduling conflicts table
CREATE TABLE scheduling_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Conflict details
    conflict_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    conflict_type VARCHAR(50) DEFAULT 'unavailable', -- 'unavailable', 'break', 'meeting', 'personal'
    
    -- Conflict information
    title VARCHAR(200),
    description TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern recurring_pattern DEFAULT 'none',
    recurring_until DATE,
    
    -- Priority and flexibility
    priority INTEGER DEFAULT 1, -- 1=low, 5=high
    is_flexible BOOLEAN DEFAULT false,
    can_reschedule BOOLEAN DEFAULT false,
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_conflict_time CHECK (end_time > start_time)
);

-- Create comprehensive indexes
CREATE INDEX idx_scheduled_meetings_user_id ON scheduled_meetings(user_id);
CREATE INDEX idx_scheduled_meetings_counselor_id ON scheduled_meetings(counselor_id);
CREATE INDEX idx_scheduled_meetings_start_time ON scheduled_meetings(scheduled_start);
CREATE INDEX idx_scheduled_meetings_status ON scheduled_meetings(status);
CREATE INDEX idx_scheduled_meetings_type ON scheduled_meetings(meeting_type);
CREATE INDEX idx_scheduled_meetings_recurring ON scheduled_meetings(is_recurring);
CREATE INDEX idx_scheduled_meetings_parent ON scheduled_meetings(parent_meeting_id);
CREATE INDEX idx_scheduled_meetings_date_range ON scheduled_meetings(scheduled_start, scheduled_end);

CREATE INDEX idx_meeting_reminders_meeting_id ON meeting_reminders(meeting_id);
CREATE INDEX idx_meeting_reminders_recipient_id ON meeting_reminders(recipient_id);
CREATE INDEX idx_meeting_reminders_scheduled_time ON meeting_reminders(scheduled_time);
CREATE INDEX idx_meeting_reminders_sent ON meeting_reminders(is_sent);

CREATE INDEX idx_counselor_time_slots_counselor_id ON counselor_time_slots(counselor_id);
CREATE INDEX idx_counselor_time_slots_date ON counselor_time_slots(slot_date);
CREATE INDEX idx_counselor_time_slots_available ON counselor_time_slots(is_available);
CREATE INDEX idx_counselor_time_slots_booked ON counselor_time_slots(is_booked);
CREATE INDEX idx_counselor_time_slots_datetime ON counselor_time_slots(slot_date, start_time);

CREATE INDEX idx_meeting_participants_meeting_id ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user_id ON meeting_participants(user_id);
CREATE INDEX idx_meeting_participants_response ON meeting_participants(response);

CREATE INDEX idx_meeting_recordings_meeting_id ON meeting_recordings(meeting_id);
CREATE INDEX idx_meeting_recordings_available ON meeting_recordings(is_available);
CREATE INDEX idx_meeting_recordings_processed ON meeting_recordings(is_processed);

CREATE INDEX idx_scheduling_preferences_user_id ON scheduling_preferences(user_id);

CREATE INDEX idx_scheduling_conflicts_counselor_id ON scheduling_conflicts(counselor_id);
CREATE INDEX idx_scheduling_conflicts_date ON scheduling_conflicts(conflict_date);
CREATE INDEX idx_scheduling_conflicts_recurring ON scheduling_conflicts(is_recurring);

-- Create triggers for updated_at columns
CREATE TRIGGER update_scheduled_meetings_updated_at BEFORE UPDATE ON scheduled_meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meeting_reminders_updated_at BEFORE UPDATE ON meeting_reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_counselor_time_slots_updated_at BEFORE UPDATE ON counselor_time_slots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meeting_participants_updated_at BEFORE UPDATE ON meeting_participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meeting_recordings_updated_at BEFORE UPDATE ON meeting_recordings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduling_preferences_updated_at BEFORE UPDATE ON scheduling_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduling_conflicts_updated_at BEFORE UPDATE ON scheduling_conflicts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create meeting reminders
CREATE OR REPLACE FUNCTION create_meeting_reminders()
RETURNS TRIGGER AS $$
DECLARE
    prefs RECORD;
    reminder_time INTEGER;
    reminder_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get user preferences
    SELECT * INTO prefs 
    FROM scheduling_preferences 
    WHERE user_id = NEW.user_id;
    
    -- Use default reminders if no preferences found
    IF NOT FOUND THEN
        prefs.enable_reminders := true;
        prefs.reminder_times := ARRAY[1440, 60, 15]; -- 24h, 1h, 15min
        prefs.preferred_reminder_types := ARRAY['email'::reminder_type, 'push'::reminder_type];
    END IF;
    
    -- Create reminders if enabled
    IF prefs.enable_reminders THEN
        FOREACH reminder_time IN ARRAY prefs.reminder_times LOOP
            reminder_timestamp := NEW.scheduled_start - (reminder_time || ' minutes')::INTERVAL;
            
            -- Only create reminders for future times
            IF reminder_timestamp > CURRENT_TIMESTAMP THEN
                -- Create reminder for user
                INSERT INTO meeting_reminders (
                    meeting_id, recipient_id, reminder_type, scheduled_time, 
                    minutes_before, title, message
                )
                SELECT 
                    NEW.id,
                    NEW.user_id,
                    unnest(prefs.preferred_reminder_types),
                    reminder_timestamp,
                    reminder_time,
                    'Upcoming Counseling Session',
                    'Your counseling session is scheduled for ' || to_char(NEW.scheduled_start, 'YYYY-MM-DD HH24:MI') || '. Meeting type: ' || NEW.meeting_type;
                
                -- Create reminder for counselor
                INSERT INTO meeting_reminders (
                    meeting_id, recipient_id, reminder_type, scheduled_time, 
                    minutes_before, title, message
                )
                SELECT 
                    NEW.id,
                    NEW.counselor_id,
                    unnest(prefs.preferred_reminder_types),
                    reminder_timestamp,
                    reminder_time,
                    'Upcoming Counseling Session',
                    'You have a counseling session scheduled for ' || to_char(NEW.scheduled_start, 'YYYY-MM-DD HH24:MI') || '. Meeting type: ' || NEW.meeting_type;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic reminder creation
CREATE TRIGGER create_meeting_reminders_trigger
    AFTER INSERT ON scheduled_meetings
    FOR EACH ROW EXECUTE FUNCTION create_meeting_reminders();

-- Function to handle time slot booking
CREATE OR REPLACE FUNCTION update_time_slot_booking()
RETURNS TRIGGER AS $$
BEGIN
    -- When a meeting is scheduled, mark the corresponding time slot as booked
    IF NEW.status IN ('scheduled', 'confirmed') AND OLD.status != NEW.status THEN
        UPDATE counselor_time_slots 
        SET 
            is_booked = true,
            meeting_id = NEW.id,
            current_bookings = current_bookings + 1
        WHERE 
            counselor_id = NEW.counselor_id
            AND slot_date = NEW.scheduled_start::DATE
            AND start_time <= NEW.scheduled_start::TIME
            AND end_time >= NEW.scheduled_end::TIME
            AND is_available = true;
    END IF;
    
    -- When a meeting is cancelled, free up the time slot
    IF NEW.status IN ('cancelled', 'no_show') AND OLD.status != NEW.status THEN
        UPDATE counselor_time_slots 
        SET 
            is_booked = false,
            meeting_id = NULL,
            current_bookings = GREATEST(0, current_bookings - 1)
        WHERE meeting_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for time slot booking management
CREATE TRIGGER update_time_slot_booking_trigger
    AFTER UPDATE ON scheduled_meetings
    FOR EACH ROW EXECUTE FUNCTION update_time_slot_booking();

-- Function to generate recurring meetings
CREATE OR REPLACE FUNCTION generate_recurring_meetings(
    meeting_id UUID,
    end_date DATE
) RETURNS INTEGER AS $$
DECLARE
    base_meeting RECORD;
    new_start TIMESTAMP WITH TIME ZONE;
    new_end TIMESTAMP WITH TIME ZONE;
    iteration_date DATE;
    interval_text TEXT;
    created_count INTEGER := 0;
BEGIN
    -- Get the base meeting
    SELECT * INTO base_meeting 
    FROM scheduled_meetings 
    WHERE id = meeting_id;
    
    IF NOT FOUND OR NOT base_meeting.is_recurring THEN
        RETURN 0;
    END IF;
    
    -- Determine interval
    CASE base_meeting.recurring_pattern
        WHEN 'daily' THEN interval_text := base_meeting.recurring_interval || ' days';
        WHEN 'weekly' THEN interval_text := base_meeting.recurring_interval || ' weeks';
        WHEN 'biweekly' THEN interval_text := (base_meeting.recurring_interval * 2) || ' weeks';
        WHEN 'monthly' THEN interval_text := base_meeting.recurring_interval || ' months';
        ELSE RETURN 0;
    END CASE;
    
    -- Generate recurring meetings
    new_start := base_meeting.scheduled_start;
    new_end := base_meeting.scheduled_end;
    iteration_date := base_meeting.scheduled_start::DATE;
    
    WHILE iteration_date < COALESCE(end_date, base_meeting.recurring_until, CURRENT_DATE + INTERVAL '1 year') LOOP
        new_start := new_start + interval_text::INTERVAL;
        new_end := new_end + interval_text::INTERVAL;
        iteration_date := new_start::DATE;
        
        -- Skip if past end date
        IF iteration_date > COALESCE(end_date, base_meeting.recurring_until, CURRENT_DATE + INTERVAL '1 year') THEN
            EXIT;
        END IF;
        
        -- Create recurring meeting
        INSERT INTO scheduled_meetings (
            user_id, counselor_id, title, description, meeting_type,
            scheduled_start, scheduled_end, duration_minutes,
            buffer_before_minutes, buffer_after_minutes,
            status, confirmation_required,
            is_recurring, recurring_pattern, recurring_interval, recurring_until,
            parent_meeting_id,
            meeting_room_id, meeting_room_url, meeting_room_password,
            phone_number, dial_in_code,
            location_name, location_address, location_room,
            preparation_notes
        ) VALUES (
            base_meeting.user_id, base_meeting.counselor_id, 
            base_meeting.title, base_meeting.description, base_meeting.meeting_type,
            new_start, new_end, base_meeting.duration_minutes,
            base_meeting.buffer_before_minutes, base_meeting.buffer_after_minutes,
            'scheduled', base_meeting.confirmation_required,
            false, 'none', 1, NULL, -- Individual occurrences are not recurring
            base_meeting.id, -- Reference to parent
            base_meeting.meeting_room_id, base_meeting.meeting_room_url, base_meeting.meeting_room_password,
            base_meeting.phone_number, base_meeting.dial_in_code,
            base_meeting.location_name, base_meeting.location_address, base_meeting.location_room,
            base_meeting.preparation_notes
        );
        
        created_count := created_count + 1;
    END LOOP;
    
    RETURN created_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default scheduling preferences for existing users
INSERT INTO scheduling_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Insert sample time slots for the existing counselor
INSERT INTO counselor_time_slots (
  counselor_id,
  slot_date,
  start_time,
  end_time,
  slot_duration_minutes
)
SELECT
  u.id,
  day::DATE AS slot_date,
  start_time::TIME,
  (start_time + INTERVAL '1 hour')::TIME AS end_time,
  60
FROM users u
CROSS JOIN LATERAL generate_series(
  CURRENT_DATE + INTERVAL '1 day',
  CURRENT_DATE + INTERVAL '30 days',
  INTERVAL '1 day'
) AS day
CROSS JOIN LATERAL generate_series(
  (day::DATE + TIME '09:00')::TIMESTAMP,
  (day::DATE + TIME '16:00')::TIMESTAMP,
  INTERVAL '1 hour'
) AS start_time
WHERE u.role = 'counselor'
  AND NOT EXISTS (
    SELECT 1
    FROM counselor_time_slots cts
    WHERE cts.counselor_id = u.id
      AND cts.slot_date = day::DATE
  )
  AND EXTRACT(DOW FROM day) BETWEEN 1 AND 5;  -- Monday to Friday


-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('008_schedules');

COMMIT;
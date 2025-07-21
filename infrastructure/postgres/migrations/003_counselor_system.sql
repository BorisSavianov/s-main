-- Migration 003: Counselor System Tables
-- File: infrastructure/postgres/migrations/003_counselor_system.sql

BEGIN;

-- Counselor profiles table
CREATE TABLE counselor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100),
    specialties TEXT[],
    qualifications TEXT[],
    experience_years INTEGER,
    hourly_rate DECIMAL(10,2),
    bio TEXT,
    languages TEXT[],
    is_available BOOLEAN DEFAULT true,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    status appointment_status DEFAULT 'scheduled',
    notes TEXT,
    session_link TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT
);

-- Counselor availability table
CREATE TABLE counselor_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(counselor_id, day_of_week, start_time)
);

-- Counselor reviews table
CREATE TABLE counselor_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    counselor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, appointment_id)
);

-- Create indexes
CREATE INDEX idx_counselor_profiles_user_id ON counselor_profiles(user_id);
CREATE INDEX idx_counselor_profiles_available ON counselor_profiles(is_available);
CREATE INDEX idx_counselor_profiles_specialties ON counselor_profiles USING GIN(specialties);
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_counselor_id ON appointments(counselor_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_counselor_availability_counselor_id ON counselor_availability(counselor_id);
CREATE INDEX idx_counselor_availability_day ON counselor_availability(day_of_week);
CREATE INDEX idx_counselor_reviews_counselor_id ON counselor_reviews(counselor_id);
CREATE INDEX idx_counselor_reviews_rating ON counselor_reviews(rating);

-- Create triggers for updated_at columns
CREATE TRIGGER update_counselor_profiles_updated_at BEFORE UPDATE ON counselor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_counselor_availability_updated_at BEFORE UPDATE ON counselor_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_counselor_reviews_updated_at BEFORE UPDATE ON counselor_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update counselor rating
CREATE OR REPLACE FUNCTION update_counselor_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE counselor_profiles 
    SET 
        rating = (
            SELECT AVG(rating::DECIMAL) 
            FROM counselor_reviews 
            WHERE counselor_id = NEW.counselor_id
        ),
        total_reviews = (
            SELECT COUNT(*) 
            FROM counselor_reviews 
            WHERE counselor_id = NEW.counselor_id
        )
    WHERE user_id = NEW.counselor_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update counselor rating after review
CREATE TRIGGER update_counselor_rating_trigger
    AFTER INSERT OR UPDATE ON counselor_reviews
    FOR EACH ROW EXECUTE FUNCTION update_counselor_rating();

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('003_counselor_system');

COMMIT;

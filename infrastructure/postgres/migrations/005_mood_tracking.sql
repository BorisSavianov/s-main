-- Migration 005: Mood Tracking Tables
-- File: infrastructure/postgres/migrations/005_mood_tracking.sql

BEGIN;

-- Mood entries table
CREATE TABLE mood_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    mood_rating mood_rating NOT NULL,
    notes TEXT,
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
    sleep_hours DECIMAL(3,1),
    exercise_minutes INTEGER,
    medication_taken BOOLEAN,
    triggers TEXT[],
    activities TEXT[],
    entry_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, entry_date)
);

-- Mood patterns table for tracking trends
CREATE TABLE mood_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL, -- 'weekly', 'monthly', 'seasonal'
    pattern_data JSONB NOT NULL,
    average_rating DECIMAL(3,2),
    trend_direction VARCHAR(20), -- 'improving', 'declining', 'stable'
    confidence_score DECIMAL(3,2),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mood triggers table
CREATE TABLE mood_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_name VARCHAR(100) NOT NULL,
    trigger_category VARCHAR(50), -- 'work', 'relationships', 'health', 'environment'
    impact_score INTEGER CHECK (impact_score >= 1 AND impact_score <= 10),
    frequency_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, trigger_name)
);

-- Mood goals table
CREATE TABLE mood_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_type VARCHAR(50) NOT NULL, -- 'daily_rating', 'weekly_average', 'consistency'
    target_value DECIMAL(5,2) NOT NULL,
    current_value DECIMAL(5,2) DEFAULT 0,
    target_date DATE,
    is_achieved BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mood insights table for AI-generated insights
CREATE TABLE mood_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL, -- 'pattern', 'correlation', 'recommendation'
    insight_text TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    data_points INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_helpful BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_mood_entries_user_id ON mood_entries(user_id);
CREATE INDEX idx_mood_entries_date ON mood_entries(entry_date);
CREATE INDEX idx_mood_entries_rating ON mood_entries(rating);
CREATE INDEX idx_mood_entries_user_date ON mood_entries(user_id, entry_date);
CREATE INDEX idx_mood_patterns_user_id ON mood_patterns(user_id);
CREATE INDEX idx_mood_patterns_type ON mood_patterns(pattern_type);
CREATE INDEX idx_mood_patterns_dates ON mood_patterns(start_date, end_date);
CREATE INDEX idx_mood_triggers_user_id ON mood_triggers(user_id);
CREATE INDEX idx_mood_triggers_category ON mood_triggers(trigger_category);
CREATE INDEX idx_mood_triggers_active ON mood_triggers(is_active);
CREATE INDEX idx_mood_goals_user_id ON mood_goals(user_id);
CREATE INDEX idx_mood_goals_active ON mood_goals(is_active);
CREATE INDEX idx_mood_goals_target_date ON mood_goals(target_date);
CREATE INDEX idx_mood_insights_user_id ON mood_insights(user_id);
CREATE INDEX idx_mood_insights_type ON mood_insights(insight_type);
CREATE INDEX idx_mood_insights_read ON mood_insights(is_read);

-- Create triggers for updated_at columns
CREATE TRIGGER update_mood_entries_updated_at BEFORE UPDATE ON mood_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mood_patterns_updated_at BEFORE UPDATE ON mood_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mood_triggers_updated_at BEFORE UPDATE ON mood_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mood_goals_updated_at BEFORE UPDATE ON mood_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mood_insights_updated_at BEFORE UPDATE ON mood_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update mood goal progress
CREATE OR REPLACE FUNCTION update_mood_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update weekly average goals
    UPDATE mood_goals 
    SET current_value = (
        SELECT AVG(rating) 
        FROM mood_entries 
        WHERE user_id = NEW.user_id 
        AND entry_date >= CURRENT_DATE - INTERVAL '7 days'
    )
    WHERE user_id = NEW.user_id 
    AND goal_type = 'weekly_average' 
    AND is_active = true;
    
    -- Update consistency goals (days with entries in last 30 days)
    UPDATE mood_goals 
    SET current_value = (
        SELECT COUNT(*) 
        FROM mood_entries 
        WHERE user_id = NEW.user_id 
        AND entry_date >= CURRENT_DATE - INTERVAL '30 days'
    )
    WHERE user_id = NEW.user_id 
    AND goal_type = 'consistency' 
    AND is_active = true;
    
    -- Mark goals as achieved if target reached
    UPDATE mood_goals 
    SET is_achieved = true 
    WHERE user_id = NEW.user_id 
    AND current_value >= target_value 
    AND is_active = true 
    AND is_achieved = false;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update mood goals after mood entry
CREATE TRIGGER update_mood_goals_trigger
    AFTER INSERT OR UPDATE ON mood_entries
    FOR EACH ROW EXECUTE FUNCTION update_mood_goal_progress();

-- Function to update trigger frequency
CREATE OR REPLACE FUNCTION update_trigger_frequency()
RETURNS TRIGGER AS $$
BEGIN
    -- Update trigger frequency counts
    UPDATE mood_triggers 
    SET frequency_count = frequency_count + 1
    WHERE user_id = NEW.user_id 
    AND trigger_name = ANY(NEW.triggers);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update trigger frequency after mood entry
CREATE TRIGGER update_trigger_frequency_trigger
    AFTER INSERT OR UPDATE ON mood_entries
    FOR EACH ROW EXECUTE FUNCTION update_trigger_frequency();

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('005_mood_tracking');

COMMIT;
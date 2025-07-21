-- Migration 001: Initial Schema Setup
-- File: infrastructure/postgres/migrations/001_initial_schema.sql

-- This migration sets up the initial database schema for the mental health platform
-- Run timestamp: 2024-01-01 00:00:00

BEGIN;

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'counselor', 'user', 'guest');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE mood_rating AS ENUM ('very_poor', 'poor', 'fair', 'good', 'excellent');
CREATE TYPE notification_type AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO migrations (migration_name) VALUES ('001_initial_schema');

COMMIT;
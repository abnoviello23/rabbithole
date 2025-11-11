-- Migration: Add Users, Sessions, and Analytics Tables
-- This migration is idempotent and can be run multiple times safely
-- WARNING: This will drop existing user_events, sessions, and users tables if they exist

-- ============================================================================
-- CLEANUP: Drop existing tables and constraints if they exist
-- ============================================================================

-- Drop foreign key constraints from existing tables (do this first to avoid dependency issues)
DO $$ 
BEGIN
    -- Drop constraints from session_snapshots if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_snapshots') THEN
        ALTER TABLE session_snapshots 
            DROP CONSTRAINT IF EXISTS session_snapshots_user_id_fkey,
            DROP CONSTRAINT IF EXISTS session_snapshots_session_id_fkey;
    END IF;
    
    -- Drop constraints from cost_logs if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_logs') THEN
        ALTER TABLE cost_logs
            DROP CONSTRAINT IF EXISTS cost_logs_user_id_fkey,
            DROP CONSTRAINT IF EXISTS cost_logs_session_id_fkey;
    END IF;
    
    -- Drop constraints from user_costs if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_costs') THEN
        ALTER TABLE user_costs
            DROP CONSTRAINT IF EXISTS user_costs_user_id_fkey;
    END IF;
END $$;

-- Drop functions first (CASCADE will automatically drop dependent triggers)
-- This is safer than trying to drop triggers on tables that might not exist
DROP FUNCTION IF EXISTS update_session_stats() CASCADE;
DROP FUNCTION IF EXISTS update_user_last_seen() CASCADE;

-- Drop new tables (CASCADE will drop dependent objects like triggers, indexes, etc.)
DROP TABLE IF EXISTS user_events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE users (
    user_id VARCHAR(255) PRIMARY KEY, -- Google OAuth sub
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    picture_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
CREATE INDEX idx_users_last_seen ON users(last_seen_at DESC);

COMMENT ON TABLE users IS 'User profiles from Google OAuth';
COMMENT ON COLUMN users.user_id IS 'Google OAuth user ID (sub claim)';
COMMENT ON COLUMN users.email IS 'User email address';
COMMENT ON COLUMN users.name IS 'User display name';
COMMENT ON COLUMN users.picture_url IS 'User profile picture URL';
COMMENT ON COLUMN users.last_seen_at IS 'Last time user made an API request';

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'New Session',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW(),
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id, last_accessed_at DESC);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, is_active, last_accessed_at DESC);

COMMENT ON TABLE sessions IS 'User sessions with metadata';
COMMENT ON COLUMN sessions.session_id IS 'Frontend session UUID';
COMMENT ON COLUMN sessions.user_id IS 'Owner of this session';
COMMENT ON COLUMN sessions.name IS 'Session name from frontend';
COMMENT ON COLUMN sessions.node_count IS 'Current number of nodes in session';
COMMENT ON COLUMN sessions.edge_count IS 'Current number of edges in session';
COMMENT ON COLUMN sessions.is_active IS 'Whether session is currently active';

-- ============================================================================
-- USER EVENTS TABLE (Analytics)
-- ============================================================================
CREATE TABLE user_events (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id UUID,
    event_type VARCHAR(50) NOT NULL, -- 'node_click', 'node_create', 'edge_create', 'query', 'cluster', 'automode', 'session_create', 'session_delete', 'chat_open', 'chat_close', 'error'
    event_category VARCHAR(50), -- 'interaction', 'api_call', 'session', 'ui', 'error'
    metadata JSONB, -- Additional event-specific data
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT user_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_user_events_user_id ON user_events(user_id, created_at DESC);
CREATE INDEX idx_user_events_session_id ON user_events(session_id, created_at DESC);
CREATE INDEX idx_user_events_type ON user_events(event_type, created_at DESC);
CREATE INDEX idx_user_events_category ON user_events(event_category, created_at DESC);
CREATE INDEX idx_user_events_created_at ON user_events(created_at DESC);
-- GIN index for JSONB metadata queries
CREATE INDEX idx_user_events_metadata_gin ON user_events USING GIN (metadata);

COMMENT ON TABLE user_events IS 'User interaction events for analytics';
COMMENT ON COLUMN user_events.event_type IS 'Type of event (node_click, node_create, query, etc.)';
COMMENT ON COLUMN user_events.event_category IS 'Category of event (interaction, api_call, session, ui, error)';
COMMENT ON COLUMN user_events.metadata IS 'Event-specific data (node_id, query_text, source_type, etc.)';

-- ============================================================================
-- POPULATE USERS AND SESSIONS FROM EXISTING DATA
-- ============================================================================

-- Populate users table from existing session_snapshots (if table exists and has data)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_snapshots') THEN
        -- Insert users from session_snapshots
        INSERT INTO users (user_id, email, name, created_at, last_seen_at)
        SELECT DISTINCT 
            user_id,
            COALESCE(user_id || '@migrated.local', 'unknown@migrated.local') as email,
            'Migrated User' as name,
            MIN(created_at) as created_at,
            MAX(created_at) as last_seen_at
        FROM session_snapshots
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        ON CONFLICT (user_id) DO NOTHING;
        
        RAISE NOTICE 'Populated users table from session_snapshots';
    END IF;
END $$;

-- Populate users table from existing cost_logs (if table exists and has data)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_logs') THEN
        -- Insert users from cost_logs
        INSERT INTO users (user_id, email, name, created_at, last_seen_at)
        SELECT DISTINCT 
            user_id,
            COALESCE(user_id || '@migrated.local', 'unknown@migrated.local') as email,
            'Migrated User' as name,
            MIN(created_at) as created_at,
            MAX(created_at) as last_seen_at
        FROM cost_logs
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        ON CONFLICT (user_id) DO NOTHING;
        
        RAISE NOTICE 'Populated users table from cost_logs';
    END IF;
END $$;

-- Populate users table from existing user_costs (if table exists and has data)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_costs') THEN
        -- Insert users from user_costs
        INSERT INTO users (user_id, email, name, created_at, last_seen_at)
        SELECT 
            user_id,
            COALESCE(user_id || '@migrated.local', 'unknown@migrated.local') as email,
            'Migrated User' as name,
            COALESCE(updated_at, NOW()) as created_at,
            COALESCE(updated_at, NOW()) as last_seen_at
        FROM user_costs
        WHERE user_id IS NOT NULL
        ON CONFLICT (user_id) DO NOTHING;
        
        RAISE NOTICE 'Populated users table from user_costs';
    END IF;
END $$;

-- Populate sessions table from existing session_snapshots (if table exists and has data)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_snapshots') THEN
        -- Insert sessions from session_snapshots
        INSERT INTO sessions (session_id, user_id, created_at, last_accessed_at, name, node_count, edge_count)
        SELECT DISTINCT 
            session_id,
            user_id,
            MIN(created_at) as created_at,
            MAX(created_at) as last_accessed_at,
            'Migrated Session' as name,
            COALESCE(
                (SELECT jsonb_array_length(graph_state->'nodes')
                 FROM session_snapshots ss2
                 WHERE ss2.session_id = ss1.session_id
                 ORDER BY ss2.created_at DESC
                 LIMIT 1),
                0
            ) as node_count,
            COALESCE(
                (SELECT jsonb_array_length(graph_state->'edges')
                 FROM session_snapshots ss2
                 WHERE ss2.session_id = ss1.session_id
                 ORDER BY ss2.created_at DESC
                 LIMIT 1),
                0
            ) as edge_count
        FROM session_snapshots ss1
        WHERE session_id IS NOT NULL AND user_id IS NOT NULL
        GROUP BY session_id, user_id
        ON CONFLICT (session_id) DO NOTHING;
        
        RAISE NOTICE 'Populated sessions table from session_snapshots';
    END IF;
END $$;

-- Populate sessions table from existing cost_logs (if table exists and has data)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_logs') THEN
        -- Insert sessions from cost_logs
        INSERT INTO sessions (session_id, user_id, created_at, last_accessed_at, name)
        SELECT DISTINCT 
            session_id,
            user_id,
            MIN(created_at) as created_at,
            MAX(created_at) as last_accessed_at,
            'Migrated Session' as name
        FROM cost_logs
        WHERE session_id IS NOT NULL AND user_id IS NOT NULL
        GROUP BY session_id, user_id
        ON CONFLICT (session_id) DO UPDATE
        SET last_accessed_at = GREATEST(sessions.last_accessed_at, EXCLUDED.last_accessed_at);
        
        RAISE NOTICE 'Populated sessions table from cost_logs';
    END IF;
END $$;

-- ============================================================================
-- ADD FOREIGN KEYS TO EXISTING TABLES
-- ============================================================================

-- Add foreign keys to session_snapshots (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_snapshots') THEN
        -- Drop existing constraints first
        ALTER TABLE session_snapshots
            DROP CONSTRAINT IF EXISTS session_snapshots_user_id_fkey,
            DROP CONSTRAINT IF EXISTS session_snapshots_session_id_fkey;
        
        -- Only add constraints if all referenced data exists
        -- Check if there are any orphaned records
        IF NOT EXISTS (
            SELECT 1 FROM session_snapshots ss
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = ss.user_id)
               OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.session_id = ss.session_id)
        ) THEN
            ALTER TABLE session_snapshots
                ADD CONSTRAINT session_snapshots_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                ADD CONSTRAINT session_snapshots_session_id_fkey 
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE;
            RAISE NOTICE 'Added foreign keys to session_snapshots';
        ELSE
            RAISE WARNING 'Cannot add foreign keys to session_snapshots: orphaned records exist';
        END IF;
    END IF;
END $$;

-- Add foreign keys to cost_logs (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_logs') THEN
        -- Drop existing constraints first
        ALTER TABLE cost_logs
            DROP CONSTRAINT IF EXISTS cost_logs_user_id_fkey,
            DROP CONSTRAINT IF EXISTS cost_logs_session_id_fkey;
        
        -- Only add constraints if all referenced data exists
        -- Check if there are any orphaned records
        IF NOT EXISTS (
            SELECT 1 FROM cost_logs cl
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = cl.user_id)
               OR (cl.session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.session_id = cl.session_id))
        ) THEN
            ALTER TABLE cost_logs
                ADD CONSTRAINT cost_logs_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                ADD CONSTRAINT cost_logs_session_id_fkey 
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE;
            RAISE NOTICE 'Added foreign keys to cost_logs';
        ELSE
            RAISE WARNING 'Cannot add foreign keys to cost_logs: orphaned records exist';
        END IF;
    END IF;
END $$;

-- Add foreign key to user_costs (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_costs') THEN
        -- Drop existing constraints first
        ALTER TABLE user_costs
            DROP CONSTRAINT IF EXISTS user_costs_user_id_fkey;
        
        -- Only add constraint if all referenced data exists
        -- Check if there are any orphaned records
        IF NOT EXISTS (
            SELECT 1 FROM user_costs uc
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = uc.user_id)
        ) THEN
            ALTER TABLE user_costs
                ADD CONSTRAINT user_costs_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
            RAISE NOTICE 'Added foreign key to user_costs';
        ELSE
            RAISE WARNING 'Cannot add foreign key to user_costs: orphaned records exist';
        END IF;
    END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update user's last_seen_at timestamp
CREATE OR REPLACE FUNCTION update_user_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET last_seen_at = NOW(), updated_at = NOW()
    WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_seen_at on any user event
CREATE TRIGGER trigger_update_user_last_seen
    AFTER INSERT ON user_events
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_seen();

-- Function to update session's last_accessed_at and stats
CREATE OR REPLACE FUNCTION update_session_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sessions 
    SET last_accessed_at = NOW(), updated_at = NOW()
    WHERE session_id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session stats on events
CREATE TRIGGER trigger_update_session_stats
    AFTER INSERT ON user_events
    FOR EACH ROW
    WHEN (NEW.session_id IS NOT NULL)
    EXECUTE FUNCTION update_session_stats();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
    RAISE NOTICE 'Migration complete! Tables created:';
    RAISE NOTICE '  - users';
    RAISE NOTICE '  - sessions';
    RAISE NOTICE '  - user_events';
    RAISE NOTICE '  - Foreign keys added to session_snapshots, cost_logs, user_costs';
END $$;

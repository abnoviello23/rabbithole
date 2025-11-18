-- Migration: Add Collaboration Support
-- This migration adds support for Google Docs-style collaborative editing

-- ============================================================================
-- SESSION COLLABORATORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_collaborators (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'view', -- 'view' or 'edit'
    invited_by VARCHAR(255), -- User ID who invited this collaborator
    joined_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint: one permission record per user per session
    UNIQUE(session_id, user_id),
    
    -- Foreign key to sessions (if sessions table exists)
    -- Note: This assumes sessions table exists from previous migrations
    
    -- Indexes
    INDEX idx_session_collaborators_session (session_id),
    INDEX idx_session_collaborators_user (user_id)
);

-- ============================================================================
-- SESSION PRESENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_presence (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    last_seen TIMESTAMP DEFAULT NOW(),
    cursor_position JSONB, -- {x: number, y: number, node_id?: string}
    selected_node_id VARCHAR(255), -- Currently selected node
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint: one presence record per user per session
    UNIQUE(session_id, user_id),
    
    -- Indexes
    INDEX idx_session_presence_session (session_id),
    INDEX idx_session_presence_user (user_id),
    INDEX idx_session_presence_last_seen (last_seen DESC)
);

-- ============================================================================
-- UPDATE SESSIONS TABLE
-- ============================================================================

-- Add collaboration_enabled column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS collaboration_enabled BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN sessions.collaboration_enabled IS 'Whether real-time collaboration is enabled for this session';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE session_collaborators IS 'Stores collaborator permissions for shared sessions';
COMMENT ON COLUMN session_collaborators.session_id IS 'Session UUID';
COMMENT ON COLUMN session_collaborators.user_id IS 'Google OAuth user ID (sub claim)';
COMMENT ON COLUMN session_collaborators.permission IS 'Permission level: view (read-only) or edit (can modify)';
COMMENT ON COLUMN session_collaborators.invited_by IS 'User ID who invited this collaborator';

COMMENT ON TABLE session_presence IS 'Tracks active users and their cursor positions in sessions';
COMMENT ON COLUMN session_presence.session_id IS 'Session UUID';
COMMENT ON COLUMN session_presence.user_id IS 'Google OAuth user ID (sub claim)';
COMMENT ON COLUMN session_presence.cursor_position IS 'Current cursor/viewport position (JSONB)';
COMMENT ON COLUMN session_presence.selected_node_id IS 'Currently selected node ID';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration complete! Added collaboration support:';
    RAISE NOTICE '  - session_collaborators table (permissions)';
    RAISE NOTICE '  - session_presence table (active users)';
    RAISE NOTICE '  - collaboration_enabled column on sessions';
END $$;


-- Migration: Add Session Sharing Support
-- This migration adds support for read-only public sharing of sessions

-- ============================================================================
-- ADD SHARING COLUMNS TO SESSIONS TABLE
-- ============================================================================

-- Add share_token column (UUID, unique, nullable - only set when shared)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;

-- Add is_shared column (boolean, default false)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;

-- Add shared_at column (timestamp, nullable)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP;

-- Create index on share_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_sessions_share_token ON sessions(share_token) WHERE share_token IS NOT NULL;

-- Add comments
COMMENT ON COLUMN sessions.share_token IS 'Unique token for public sharing (generated when sharing enabled)';
COMMENT ON COLUMN sessions.is_shared IS 'Whether this session is publicly shared';
COMMENT ON COLUMN sessions.shared_at IS 'Timestamp when sharing was enabled';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration complete! Added sharing support to sessions table:';
    RAISE NOTICE '  - share_token (UUID, unique)';
    RAISE NOTICE '  - is_shared (BOOLEAN)';
    RAISE NOTICE '  - shared_at (TIMESTAMP)';
    RAISE NOTICE '  - Index on share_token';
END $$;


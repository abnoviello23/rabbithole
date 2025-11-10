-- Supabase DB Schema for RabbitHole Session Snapshots and Cost Tracking
-- This table stores complete graph state snapshots on every API operation

CREATE TABLE IF NOT EXISTS session_snapshots (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id UUID NOT NULL,
    operation VARCHAR(50) NOT NULL, -- 'generate', 'automode', 'cluster'
    source_type VARCHAR(50), -- 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up', 'floating_chat'
    user_query TEXT, -- The query that triggered this operation
    graph_state JSONB NOT NULL, -- Complete minimal graph state: {sessionId, nodes: [], edges: []}
    created_at TIMESTAMP DEFAULT NOW(),

    -- Indexes for efficient querying
    INDEX idx_user_session (user_id, session_id),
    INDEX idx_created_at (created_at DESC),
    INDEX idx_operation (operation),
    INDEX idx_source_type (source_type)
);

-- Optional: Add GIN index for JSONB queries if you need to query graph state
CREATE INDEX IF NOT EXISTS idx_graph_state_gin ON session_snapshots USING GIN (graph_state);

-- Comments
COMMENT ON TABLE session_snapshots IS 'Stores complete graph state snapshots for every API operation';
COMMENT ON COLUMN session_snapshots.user_id IS 'Google OAuth user ID (sub claim)';
COMMENT ON COLUMN session_snapshots.session_id IS 'Frontend session UUID';
COMMENT ON COLUMN session_snapshots.operation IS 'API operation that triggered this snapshot';
COMMENT ON COLUMN session_snapshots.source_type IS 'How the user initiated this action';
COMMENT ON COLUMN session_snapshots.user_query IS 'User query for generate/automode operations';
COMMENT ON COLUMN session_snapshots.graph_state IS 'Complete minimal graph state (nodes + edges)';

-- ============================================================================
-- COST TRACKING TABLES
-- ============================================================================

-- Detailed cost logs for every API operation
CREATE TABLE IF NOT EXISTS cost_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id UUID NOT NULL,
    model VARCHAR(100) NOT NULL, -- e.g., 'gpt-4o-search-preview-2025-03-11', 'text-embedding-3-small'
    operation VARCHAR(50) NOT NULL, -- 'generate', 'automode', 'cluster'
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL DEFAULT 0, -- 0 for embedding models
    cost DECIMAL(10, 6) NOT NULL, -- Cost in dollars
    created_at TIMESTAMP DEFAULT NOW(),

    -- Indexes for efficient querying
    INDEX idx_user_costs (user_id, created_at DESC),
    INDEX idx_session_costs (session_id, created_at DESC),
    INDEX idx_model (model),
    INDEX idx_operation_costs (operation)
);

-- User cost summary (current usage and limits)
CREATE TABLE IF NOT EXISTS user_costs (
    user_id VARCHAR(255) PRIMARY KEY,
    current_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.0, -- Total accumulated cost
    max_cost DECIMAL(10, 6) NOT NULL DEFAULT 5.0, -- Maximum allowed cost
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE cost_logs IS 'Detailed log of every API operation cost';
COMMENT ON COLUMN cost_logs.user_id IS 'Google OAuth user ID (sub claim)';
COMMENT ON COLUMN cost_logs.session_id IS 'Frontend session UUID';
COMMENT ON COLUMN cost_logs.model IS 'OpenAI model used for this operation';
COMMENT ON COLUMN cost_logs.operation IS 'API endpoint that incurred this cost';
COMMENT ON COLUMN cost_logs.cost IS 'Cost in USD (6 decimal precision)';

COMMENT ON TABLE user_costs IS 'User cost tracking and limits';
COMMENT ON COLUMN user_costs.current_cost IS 'Total accumulated cost for this user';
COMMENT ON COLUMN user_costs.max_cost IS 'Maximum allowed cost before blocking operations';

# User Events vs Session Snapshots

## Overview

Both tables track user activity, but serve different purposes:

- **`session_snapshots`**: Stores complete graph state for historical record/restoration
- **`user_events`**: Tracks individual interactions for analytics and behavior analysis

## Comparison Table

| Aspect | `session_snapshots` | `user_events` |
|--------|---------------------|---------------|
| **Purpose** | Historical record of graph state | Analytics and behavior tracking |
| **What's Stored** | Complete graph state (all nodes + edges as JSONB) | Event metadata (type, category, optional JSONB metadata) |
| **When Created** | Only on API operations (`generate`, `automode`, `cluster`) | On every user interaction (clicks, UI events, API calls, etc.) |
| **Frequency** | Low (only when API is called) | High (many events per session) |
| **Size** | Large (contains full graph state) | Small (just metadata) |
| **Use Case** | Restore session state, replay history, audit trail | Analyze user behavior, feature usage, engagement metrics |
| **Granularity** | Per API operation | Per user interaction |

## Detailed Breakdown

### `session_snapshots`

**Purpose**: Complete state snapshots for historical record and potential restoration.

**Structure**:
```sql
- id (serial)
- user_id (varchar)
- session_id (uuid)
- operation ('generate', 'automode', 'cluster')
- source_type ('button_follow_up', 'text_selection_follow_up', etc.)
- user_query (text)
- graph_state (JSONB) -- Complete graph: {sessionId, nodes: [], edges: []}
- created_at (timestamp)
```

**When Created**:
- Automatically saved on every API call (generate, automode, cluster)
- Only when backend processes a request
- Contains the complete graph state at that moment

**Example Data**:
```json
{
  "user_id": "123456789",
  "session_id": "abc-123-def",
  "operation": "generate",
  "source_type": "button_follow_up",
  "user_query": "What is quantum computing?",
  "graph_state": {
    "sessionId": "abc-123-def",
    "nodes": [
      {"id": "node1", "data": {"title": "...", "body": "..."}},
      {"id": "node2", "data": {"title": "...", "body": "..."}}
    ],
    "edges": [
      {"source": "node1", "target": "node2", "label": "..."}
    ]
  }
}
```

**Use Cases**:
1. **Session Restoration**: Restore a session to any point in time
2. **Audit Trail**: See exactly what the graph looked like at each API operation
3. **Debugging**: Understand how the graph evolved over time
4. **Analytics**: Analyze graph growth patterns, node/edge counts over time

**Storage Impact**:
- Large records (contains full graph state)
- Grows with graph complexity (more nodes/edges = larger snapshots)
- Historical record (doesn't need to be queried frequently)

---

### `user_events`

**Purpose**: Track individual user interactions for analytics and behavior analysis.

**Structure**:
```sql
- id (bigserial)
- user_id (varchar)
- session_id (uuid, optional)
- event_type (varchar) -- 'node_click', 'node_create', 'generate', etc.
- event_category (varchar) -- 'interaction', 'api_call', 'session', 'ui', 'error'
- metadata (JSONB) -- Event-specific data (node_id, query_length, etc.)
- created_at (timestamp)
```

**When Created**:
- On every user interaction (clicks, node creation, UI events)
- On API calls (tracked separately from snapshots)
- On session events (create, delete, update)
- On UI events (chat open/close, etc.)

**Event Types Tracked**:
- **API Calls**: `generate`, `automode`, `cluster`, `cluster_complete`
- **Interactions**: `node_click`, `node_create`, `edge_create`
- **Session Events**: `session_create`, `session_update`, `session_delete`
- **UI Events**: `chat_open`, `chat_close`
- **Errors**: `error` (can be added as needed)

**Example Data**:
```json
{
  "user_id": "123456789",
  "session_id": "abc-123-def",
  "event_type": "node_click",
  "event_category": "interaction",
  "metadata": {
    "node_id": "node-123"
  }
}
```

```json
{
  "user_id": "123456789",
  "session_id": "abc-123-def",
  "event_type": "node_create",
  "event_category": "interaction",
  "metadata": {
    "node_id": "node-456",
    "source_node_id": "node-123",
    "source_type": "button_follow_up",
    "has_selected_context": false,
    "query_length": 25,
    "path_depth": 3,
    "context_nodes": 2
  }
}
```

**Use Cases**:
1. **User Behavior Analysis**: Understand how users interact with the platform
2. **Feature Usage**: Track which features are used most
3. **Engagement Metrics**: Measure user activity, session duration, etc.
4. **A/B Testing**: Track feature adoption and usage patterns
5. **Error Tracking**: Monitor errors and issues
6. **Product Insights**: Understand user journey and pain points

**Storage Impact**:
- Small records (just metadata)
- High frequency (many events per session)
- Optimized for querying (indexed by type, category, user, session)

---

## Key Differences

### 1. **Granularity**
- **`session_snapshots`**: Coarse-grained (only on API operations)
- **`user_events`**: Fine-grained (every interaction)

### 2. **Data Volume**
- **`session_snapshots`**: Few records, large size (full graph state)
- **`user_events`**: Many records, small size (just metadata)

### 3. **Query Patterns**
- **`session_snapshots`**: 
  - "What did the graph look like at time X?"
  - "Restore session to point Y"
  - "Show graph evolution over time"
  
- **`user_events`**:
  - "How many times did users click nodes?"
  - "What's the average path depth?"
  - "Which features are used most?"
  - "What's the user engagement rate?"

### 4. **Storage Strategy**
- **`session_snapshots`**: 
  - Historical record (keep forever or archive)
  - Can be large, so consider retention policies
  - Useful for restoration and debugging
  
- **`user_events`**:
  - Analytics data (can be aggregated and purged)
  - Small records, can keep more history
  - Useful for real-time analytics and insights

## When to Use Which

### Use `session_snapshots` when you need:
- ✅ Complete graph state at a specific point in time
- ✅ Session restoration or replay
- ✅ Audit trail of graph evolution
- ✅ Debugging graph state issues
- ✅ Understanding graph structure over time

### Use `user_events` when you need:
- ✅ User behavior analysis
- ✅ Feature usage metrics
- ✅ Engagement tracking
- ✅ A/B testing data
- ✅ Error monitoring
- ✅ Product insights and analytics

## Example Queries

### Session Snapshots
```sql
-- Get all snapshots for a session (to see graph evolution)
SELECT * FROM session_snapshots 
WHERE session_id = 'abc-123-def' 
ORDER BY created_at;

-- Get the latest snapshot for a session
SELECT * FROM session_snapshots 
WHERE session_id = 'abc-123-def' 
ORDER BY created_at DESC 
LIMIT 1;

-- Count nodes/edges over time
SELECT 
  created_at,
  jsonb_array_length(graph_state->'nodes') as node_count,
  jsonb_array_length(graph_state->'edges') as edge_count
FROM session_snapshots
WHERE session_id = 'abc-123-def'
ORDER BY created_at;
```

### User Events
```sql
-- Count events by type
SELECT event_type, COUNT(*) as count
FROM user_events
WHERE user_id = '123456789'
GROUP BY event_type
ORDER BY count DESC;

-- Average path depth for node creation
SELECT AVG((metadata->>'path_depth')::int) as avg_path_depth
FROM user_events
WHERE event_type = 'node_create';

-- Most used features
SELECT event_type, COUNT(*) as usage_count
FROM user_events
WHERE event_category = 'api_call'
GROUP BY event_type
ORDER BY usage_count DESC;

-- User engagement over time
SELECT 
  DATE(created_at) as date,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_events
FROM user_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Summary

- **`session_snapshots`**: Historical record of complete graph state (large, infrequent, for restoration/audit)
- **`user_events`**: Analytics data for user interactions (small, frequent, for behavior analysis)

Both tables complement each other:
- `session_snapshots` tells you **what** the graph looked like
- `user_events` tells you **how** users interacted with it

Together, they provide a complete picture of both the state and behavior of your application.


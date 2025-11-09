# WebSocket Agent Streaming Feature

## Overview

The application now supports **intelligent mode switching** between quick responses and deep research:

- **Quick Mode**: Fast responses using `/generate` endpoint for simple queries
- **Agent Mode**: Deep research with live streaming logs via WebSocket for complex queries

## Architecture

### Backend

**`backend/agent.py`**
- `run_research_stream()`: Async function that runs the Claude research agent
- Streams events via callback: status, tool usage, final results, errors
- Integrates with Claude SDK, Exa API, and OpenAI for synthesis

**`backend/main.py`**
- WebSocket endpoint: `GET /ws/research`
- Accepts JSON request with query, path, context
- Forwards events from agent to client in real-time

### Frontend

**`frontend/app/utils/api.ts`**
- `startResearchStream()`: WebSocket client with callbacks
- Returns handle with `close()` method for cleanup
- Event types: status, tool, final, error

**`frontend/app/components/Canvas.tsx`**
- Heuristic logic determines quick vs agent mode
- Manages live logs state per node
- Handles WebSocket lifecycle and cleanup
- Passes logs to ChatPanel

**`frontend/app/components/ChatPanel.tsx`**
- Renders "🔴 Live Research" section when active
- Auto-scrolls logs as they arrive
- Monospace font for console-style output
- Logs persist after research completes

## Mode Selection

### Manual Toggle

Users can force agent mode with the **⚡ Auto / 🔴 Agent** toggle button in the top-right corner:

- **⚡ Auto** (default): Smart switching based on heuristic
- **🔴 Agent**: Always use deep research with streaming logs

### Automatic Heuristic (Auto Mode)

**Agent Mode is triggered when ANY of:**
1. Manual toggle is enabled (🔴 Agent mode)
2. `selectedContext` is provided (user selected text)
3. Path depth >= 3 nodes (deep in conversation tree)
4. Query length >= 90 characters (complex question)

**Otherwise: Quick Mode**

## Event Protocol

### Status Event
```json
{
  "type": "status",
  "text": "🤖 Claude: I'll research this topic..."
}
```

### Tool Event
```json
{
  "type": "tool",
  "name": "mcp__exa__web_search_exa",
  "details": {
    "query": "How does X work?",
    "num_results": 10,
    "search_type": "deep"
  }
}
```

### Final Event
```json
{
  "type": "final",
  "title": "Summary Title",
  "response": "Detailed response text...",
  "suggested_questions": ["Follow-up 1?", "Follow-up 2?"]
}
```

### Error Event
```json
{
  "type": "error",
  "message": "Error description"
}
```

## User Experience

### Quick Mode
1. User asks short/simple question
2. Response appears immediately
3. No live logs shown
4. Traditional mind-map experience

### Agent Mode
1. User asks complex question or selects text
2. ChatPanel opens automatically
3. "🔴 Live Research" section appears
4. Tool calls and thoughts stream in real-time
5. Final response appears when complete
6. Logs remain visible for reference

## Configuration

### Environment Variables

**Backend `.env`:**
```bash
OPENAI_API_KEY=sk-...        # Required for synthesis
CARTESIA_API_KEY=...         # Optional, for audio
```

**Frontend `.env.local`:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### MCP Servers

Configured in `backend/agent.py`:
- **Exa**: Web search tool for research
- **OpenAI Summary Tools**: Text summarization and audio generation

## Technical Details

### WebSocket Flow

1. Client opens WebSocket to `/ws/research`
2. Client sends initial JSON request
3. Server calls `run_research_stream()`
4. Agent processes query and sends events
5. Events are JSON-serialized and sent to client
6. Client parses and updates UI in real-time
7. Connection closes after final/error event

### State Management

- `liveLogsByNode`: Maps node ID to array of log strings
- `activeStreams`: Maps node ID to WebSocket handle for cleanup
- Auto-cleanup on unmount to prevent memory leaks

### Error Handling

- WebSocket errors trigger `onError` callback
- Loading node is removed on error
- Error message appears in live logs
- Application remains functional

## Benefits

1. **Intelligent UX**: Simple questions get quick answers, complex ones get deep research
2. **Transparency**: Users see the research process in real-time
3. **Scalability**: WebSocket allows long-running research without timeouts
4. **Flexibility**: Heuristic can be tuned without changing code structure

## Future Enhancements

- [ ] Add abort button to cancel ongoing research
- [ ] Save research logs to node metadata
- [ ] Add progress indicator (% complete)
- [ ] Allow manual mode switching
- [ ] Stream suggested questions as they're generated


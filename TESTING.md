# WebSocket Streaming Implementation - Testing Guide

## Setup

1. **Start the backend:**
   ```bash
   cd backend
   python main.py
   ```
   Backend should run on `http://localhost:8000`

2. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend should run on `http://localhost:3000`

## UI Controls

### Mode Toggle Button (Top Right)
- **⚡ Auto**: Automatic mode switching based on heuristic
- **🔴 Agent**: Force agent mode for all queries

## Test Cases

### Test 1: Quick Mode (No Agent)
**Trigger conditions:** Short query, shallow path (< 3 nodes), no selected context

1. Open the app at `http://localhost:3000`
2. Click on the root node
3. Enter a short question (< 90 chars): "What is React?"
4. Expected behavior:
   - ✅ Uses `/generate` endpoint (check browser console for "Using quick mode")
   - ✅ Response appears quickly without streaming logs
   - ✅ No "Live Research" section in ChatPanel

### Test 2: Agent Mode - Long Query
**Trigger conditions:** Query length >= 90 chars

1. Click on the root node
2. Enter a long question: "Can you explain in detail the architecture and design principles of modern React applications including hooks?"
3. Expected behavior:
   - ✅ Uses WebSocket streaming (check browser console for "Using agent mode")
   - ✅ ChatPanel opens automatically
   - ✅ "🔴 Live Research" section appears at the top
   - ✅ Tool usage and status messages stream in real-time
   - ✅ Final response appears after research completes
   - ✅ Logs remain visible after completion

### Test 3: Agent Mode - Deep Path
**Trigger conditions:** Path depth >= 3 nodes

1. Start from root, ask: "What is AI?"
2. On the child node, ask: "Machine learning?"
3. On that child, ask: "Deep learning?"
4. Expected behavior:
   - ✅ Third question triggers agent mode
   - ✅ Live streaming appears
   - ✅ Research logs show in ChatPanel

### Test 4: Agent Mode - Selected Context
**Trigger conditions:** Text is selected when asking

1. Click on any node with content
2. Select some text from the response
3. Right-click or use the selection menu to ask a question
4. Expected behavior:
   - ✅ Immediately triggers agent mode (even if query is short)
   - ✅ Selected context appears in the query bubble
   - ✅ Live research logs stream

### Test 5: Error Handling

1. Stop the backend server
2. Try asking a question that would trigger agent mode
3. Expected behavior:
   - ✅ Error appears in live logs: "❌ Error: WebSocket connection error"
   - ✅ Loading node is removed
   - ✅ No crash, app remains functional

4. Restart backend and verify normal operation resumes

### Test 6: Manual Mode Toggle

1. Click the **⚡ Auto** button in top-right to switch to **🔴 Agent** mode
2. Ask a very short question: "Hi"
3. Expected behavior:
   - ✅ Button shows **🔴 Agent** with green highlight
   - ✅ Even short query uses agent mode
   - ✅ Live research logs appear
   - ✅ ChatPanel opens automatically

4. Click **🔴 Agent** button to switch back to **⚡ Auto**
5. Ask short question again
6. Expected behavior:
   - ✅ Button shows **⚡ Auto** with normal styling
   - ✅ Short query uses quick mode
   - ✅ No live logs

### Test 7: Multiple Concurrent Streams

1. Ask a long question to trigger agent mode
2. Immediately click another node and ask another long question
3. Expected behavior:
   - ✅ Both research streams run concurrently
   - ✅ Each has its own live logs in ChatPanel
   - ✅ Switching between nodes shows different logs
   - ✅ Both complete successfully

## WebSocket Event Verification

Open browser DevTools → Network tab → WS filter

You should see WebSocket messages like:

**Status events:**
```json
{"type":"status","text":"🤖 Claude: I'll research this topic..."}
```

**Tool events:**
```json
{"type":"tool","name":"mcp__exa__web_search_exa","details":{"query":"...","num_results":10}}
```

**Final event:**
```json
{"type":"final","title":"...","response":"...","suggested_questions":["...","..."]}
```

## Console Checks

### Backend Console
- Look for: "WebSocket research request: [query]"
- Tool usage logs from agent.py
- "✅ Research Complete!" message

### Frontend Console
- "Using quick mode for query: ..." OR "Using agent mode for query: ..."
- WebSocket connection logs
- No errors (unless intentionally testing error cases)

## UI Checks

### ChatPanel
- ✅ "🔴 Live Research" section only appears during active streaming
- ✅ Logs are monospaced font, small text
- ✅ Auto-scrolls as new logs arrive
- ✅ Logs remain visible after research completes
- ✅ Switching nodes shows appropriate logs

### Canvas
- ✅ Loading spinner appears during research
- ✅ Node updates with final title and body
- ✅ No visual glitches or layout jumps
- ✅ Color coding works if using selected context

## Success Criteria

All tests pass ✅ means the implementation is working correctly!

## Known Limitations

- Agent mode requires:
  - OPENAI_API_KEY set in backend/.env
  - CARTESIA_API_KEY (optional, for audio generation)
  - Internet connection for Exa API
  - Claude SDK configured properly

- Quick mode works offline/without special APIs


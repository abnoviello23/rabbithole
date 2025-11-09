# Backend Logging Guide

## Overview

The backend now includes comprehensive logging to help monitor and debug both quick mode and agent mode operations.

## Log Format

All logs use emojis and structured formatting for easy scanning:

- 🔍 Research requests
- ⚡ Quick mode operations
- 🔴 Agent mode operations
- 📡 WebSocket connections
- 📤 Event streaming
- 🤖 AI operations
- ✅ Success
- ❌ Errors
- ⚠️ Warnings

## Quick Mode Logs

When a user asks a simple question (quick mode via `/generate`):

```
================================================================================
⚡ QUICK MODE /generate request
   Query: What is React?
   Path: root
   Context nodes: 1
================================================================================
🤖 Calling OpenAI API (quick mode)...
✅ Quick response complete: Understanding React
================================================================================
```

## Agent Mode Logs

When a user asks a complex question (agent mode via WebSocket):

### 1. WebSocket Connection
```
📡 New WebSocket connection from 127.0.0.1
✅ WebSocket connection accepted
⏳ Waiting for initial request...
```

### 2. Research Request
```
================================================================================
🔍 RESEARCH REQUEST
   Node ID: node-1699...
   Query: How does Zohran Mamdani win the election?
   Path: root
   Context nodes: 1
================================================================================
```

### 3. Agent Initialization
```
🤖 run_research_stream() called
   Query: How does Zohran Mamdani win the election?
   Path: root
   Context size: 1 nodes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Initializing ClaudeSDKClient...
✅ ClaudeSDKClient initialized successfully
📨 Sending research query: How does Zohran Mamdani win the election?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. Session & MCP Servers
```
🔧 Session initialized
   Session ID: a1b2c3d4...
   Model: claude-sonnet-4-20250514
   MCP Servers:
     ✅ exa: connected
     ✅ openai-summary-tools: connected
```

### 5. Event Streaming
```
📤 Sending status #1: 🤖 Claude: I'll dive deep into how Zohran Mamdani won his...
📤 Sending tool #1: mcp__exa__web_search_exa
📤 Sending tool #2: mcp__exa__web_search_exa
📤 Sending status #2: 🤖 Claude: Great! I'm getting a fascinating picture...
📤 Sending tool #3: mcp__exa__web_search_exa
```

### 6. Agent Completion
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Claude Agent Research Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️  Duration: 45.3s
🔄 Turns: 8
💰 Cost: $0.1234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7. OpenAI Synthesis
```
🧠 Synthesizing final response with OpenAI...
   Research content length: 4523 chars
   Text outputs collected: 3
   Calling OpenAI API for synthesis...
✅ OpenAI synthesis complete: Mamdani's Campaign Strategy
📤 Sending final response: Mamdani's Campaign Strategy
```

### 8. Summary
```
================================================================================
✅ RESEARCH COMPLETED
   Total events: 12
   - Status: 3
   - Tool: 8
   - Final: 1
   - Error: 0
================================================================================
🔌 WebSocket connection closed
```

## Error Logs

### Quick Mode Error
```
❌ Error generating content: API timeout
[Full stack trace]
```

### Agent Mode Error
```
❌ Research stream error: Claude SDK timeout
[Full stack trace]
📤 Sending error: Claude SDK timeout
⚠️  WebSocket disconnected by client
```

## Log Levels

The backend uses Python's logging module with INFO level by default:

```python
logging.basicConfig(level=logging.INFO)
```

### Available Levels
- `DEBUG`: Detailed debugging info (not shown by default)
- `INFO`: Normal operational logs (default)
- `WARNING`: Warning messages (⚠️)
- `ERROR`: Error messages (❌)

### Changing Log Level

Edit `backend/main.py` or `backend/agent.py`:

```python
logging.basicConfig(level=logging.DEBUG)  # Show everything
```

## Filtering Logs

### Show only errors
```bash
python main.py 2>&1 | grep "❌"
```

### Show only WebSocket activity
```bash
python main.py 2>&1 | grep "📡\|📤\|🔌"
```

### Show only research requests
```bash
python main.py 2>&1 | grep "🔍\|⚡"
```

## Production Recommendations

For production, consider:

1. **Use structured logging** (JSON format):
   ```python
   import logging.config
   logging.config.dictConfig({
       'version': 1,
       'formatters': {'json': {...}},
       ...
   })
   ```

2. **Log to file**:
   ```python
   logging.basicConfig(
       level=logging.INFO,
       format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
       handlers=[
           logging.FileHandler('rabbithole.log'),
           logging.StreamHandler()
       ]
   )
   ```

3. **Add request IDs** for tracing:
   ```python
   import uuid
   request_id = str(uuid.uuid4())
   logger.info(f"[{request_id}] Processing request...")
   ```

4. **Use external logging service** (Datadog, Sentry, CloudWatch, etc.)

## Example Session

```bash
$ cd backend
$ python main.py

INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000

# User asks simple question
================================================================================
⚡ QUICK MODE /generate request
   Query: What is TypeScript?
   Path: root
   Context nodes: 1
================================================================================
🤖 Calling OpenAI API (quick mode)...
✅ Quick response complete: Understanding TypeScript
================================================================================

# User asks complex question
📡 New WebSocket connection from 127.0.0.1
✅ WebSocket connection accepted
⏳ Waiting for initial request...
================================================================================
🔍 RESEARCH REQUEST
   Node ID: node-1699564820123
   Query: Explain in detail how TypeScript's type system works with generics...
   Path: root
   Context nodes: 1
================================================================================
🤖 run_research_stream() called
   Query: Explain in detail how TypeScript's type system works...
   Path: root
   Context size: 1 nodes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Initializing ClaudeSDKClient...
✅ ClaudeSDKClient initialized successfully
📨 Sending research query: Explain in detail...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[... research continues ...]
```

## Debugging Tips

1. **Track event flow**: Search logs for a specific node ID to see its complete journey
2. **Monitor performance**: Look for duration (⏱️) and cost (💰) in completion logs
3. **Check MCP status**: Ensure all servers show ✅ connected
4. **Count events**: Verify total events match expectations
5. **Stack traces**: Full error traces help identify issues quickly

## Summary

The logging system provides:
- ✅ Clear visual indicators (emojis)
- ✅ Structured formatting (separators)
- ✅ Complete request/response tracking
- ✅ Performance metrics
- ✅ Error debugging with stack traces
- ✅ Event streaming visibility
- ✅ Mode identification (⚡ quick vs 🔴 agent)


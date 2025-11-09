# Troubleshooting Guide

## Agent Mode Not Working

### Symptoms
- Backend shows "⚡ QUICK MODE" even when you expect agent mode
- No WebSocket connection logs
- No live research logs in ChatPanel

### Diagnostic Steps

#### 1. Check Browser Console

Open DevTools (F12) and look for these logs:

**When clicking the toggle:**
```
🎛️ Mode toggle: AGENT MODE (forced)
```
or
```
🎛️ Mode toggle: AUTO MODE (heuristic)
```

**When asking a question:**
```
Mode selection: {
  forceAgentMode: true,
  selectedContext: false,
  pathDepth: 1,
  queryLength: 33,
  useAgentMode: true
}
✅ Using agent mode for query: Why did Trump win?
```

If you see `useAgentMode: false`, the heuristic is not triggering.

#### 2. Verify Toggle State

The toggle button should show:
- **🔴 Agent** (green highlight) when forced agent mode is ON
- **⚡ Auto** (white/gray) when auto mode is ON

Click it and verify the color changes.

#### 3. Check WebSocket URL

In `frontend/app/utils/api.ts`, verify:
```typescript
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
```

If your backend runs on a different port or host, create `.env.local`:
```bash
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

#### 4. Check Backend Logs

If agent mode triggers but WebSocket fails, backend should show:
```
📡 New WebSocket connection from 127.0.0.1
✅ WebSocket connection accepted
```

If you don't see this, WebSocket connection is failing.

#### 5. Test Manual Agent Mode

1. Click the **⚡ Auto** button → should change to **🔴 Agent** (green)
2. Console should show: `🎛️ Mode toggle: AGENT MODE (forced)`
3. Ask ANY question (even "hi")
4. Console should show:
   ```
   Mode selection: { forceAgentMode: true, ..., useAgentMode: true }
   ✅ Using agent mode for query: hi
   ```
5. Backend should show WebSocket logs, NOT "⚡ QUICK MODE"

### Common Issues

#### Issue: Toggle clicks but doesn't change color
**Cause:** State not updating  
**Fix:** Check browser console for React errors

#### Issue: Toggle changes color but still uses quick mode
**Cause:** `forceAgentMode` state not being read correctly  
**Fix:** Check console logs show `forceAgentMode: true`

#### Issue: `useAgentMode: true` but still hits /generate
**Cause:** Logic error or backend not running  
**Fix:** Verify backend is running on correct port

#### Issue: WebSocket connection refused
**Cause:** Backend not accepting WebSocket connections  
**Fix:** 
- Check backend is running
- Verify port 8000 is correct
- Check CORS settings
- Try `ws://localhost:8000` explicitly

#### Issue: Auto mode doesn't trigger for long queries
**Cause:** Query too short (< 90 chars)  
**Fix:** Use toggle or ask longer question

### Quick Test

Run this test to verify everything works:

1. **Start backend:**
   ```bash
   cd backend
   python main.py
   ```
   Should see: `Uvicorn running on http://0.0.0.0:8000`

2. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   Should see: `ready - started server on 0.0.0.0:3000`

3. **Open browser:**
   - Go to `http://localhost:3000`
   - Open DevTools console (F12)

4. **Test auto mode:**
   - Verify toggle shows **⚡ Auto**
   - Ask: "What is React?"
   - Console: `⚡ Using quick mode`
   - Backend: `⚡ QUICK MODE /generate request`

5. **Test forced agent mode:**
   - Click toggle → should show **🔴 Agent** (green)
   - Console: `🎛️ Mode toggle: AGENT MODE (forced)`
   - Ask: "hi"
   - Console: `✅ Using agent mode`
   - Backend: `📡 New WebSocket connection`

6. **Test auto agent mode:**
   - Click toggle → back to **⚡ Auto**
   - Ask long query (90+ chars): "Can you explain in detail how modern web frameworks work and what makes them different from traditional approaches?"
   - Console: `✅ Using agent mode`
   - Backend: `📡 New WebSocket connection`

### Expected Console Output

**Auto Mode (short query):**
```javascript
Mode selection: {
  forceAgentMode: false,
  selectedContext: false,
  pathDepth: 1,
  queryLength: 15,
  useAgentMode: false
}
⚡ Using quick mode for query: What is React?
```

**Forced Agent Mode:**
```javascript
🎛️ Mode toggle: AGENT MODE (forced)
Mode selection: {
  forceAgentMode: true,  // ← This should be true
  selectedContext: false,
  pathDepth: 1,
  queryLength: 2,
  useAgentMode: true     // ← This should be true
}
✅ Using agent mode for query: hi
```

**Auto Mode (long query):**
```javascript
Mode selection: {
  forceAgentMode: false,
  selectedContext: false,
  pathDepth: 1,
  queryLength: 95,       // ← >= 90
  useAgentMode: true     // ← Auto-triggered
}
✅ Using agent mode for query: Can you explain...
```

### Network Tab Check

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Ask question in agent mode
4. Should see: `ws://localhost:8000/ws/research`
5. Click on it → Messages tab
6. Should see JSON events flowing

### If Still Not Working

1. **Clear browser cache:** Ctrl+Shift+R (hard reload)
2. **Restart both servers:** Backend and frontend
3. **Check browser console for errors:** Any React errors?
4. **Verify environment:** Node.js and Python versions compatible?
5. **Check firewall:** Allow WebSocket on port 8000
6. **Try different browser:** Chrome, Firefox, Safari

### Report Issues

If problems persist, collect:
1. Browser console logs (full output)
2. Backend terminal logs (full output)
3. Network tab WebSocket messages
4. Steps to reproduce
5. Browser and OS version


# Testing Guide: Collaborative Sharing Feature

This guide will help you test the Google Docs-style collaborative editing feature.

## Prerequisites

### 1. Database Setup

First, run the database migration to create the collaboration tables:

```bash
# Connect to your Supabase database (or PostgreSQL)
# Run the migration file:
psql -U your_user -d your_database -f backend/migrations/003_collaboration.sql

# Or if using Supabase CLI:
supabase db push
```

The migration creates:
- `session_collaborators` table (for permissions)
- `session_presence` table (for active users)
- Adds `collaboration_enabled` column to `sessions` table

### 2. Environment Variables

Make sure your backend `.env` file has:
```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GOOGLE_CLIENT_ID=your-google-client-id
ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Start the Servers

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python main.py
# Server should start on http://localhost:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# App should start on http://localhost:3000
```

## Testing Scenarios

### Test 1: Basic WebSocket Connection

**Goal:** Verify WebSocket connects and shows presence

1. Open browser 1: `http://localhost:3000`
2. Sign in with Google OAuth
3. Create a new session or load an existing one
4. Look for the green collaboration indicator (top-right) showing "X active"
5. Check browser console for: `🔌 WebSocket connected`

**Expected:**
- Green indicator appears showing "1 active" (yourself)
- No errors in console
- WebSocket connection established

---

### Test 2: Add Collaborator

**Goal:** Test adding a collaborator via ShareDialog

1. In browser 1, click the Share button (top-right)
2. In the ShareDialog, scroll to "Collaborators" section
3. Click "Show" to expand collaborators
4. Enter an email address (can be your own for testing)
5. Select permission: "Edit" or "View"
6. Click the "+" button to add
7. Verify collaborator appears in the list

**Expected:**
- Collaborator added successfully
- Shows in list with permission level
- No errors

**Note:** Currently uses email as user_id placeholder. In production, you'd look up user_id from email.

---

### Test 3: Real-Time Updates (Two Browsers)

**Goal:** Test that changes sync in real-time between users

**Setup:**
- Browser 1: `http://localhost:3000` (User A - owner)
- Browser 2: `http://localhost:3000` (User B - collaborator)

**Steps:**

1. **Browser 1 (Owner):**
   - Sign in as User A
   - Create a session or load existing
   - Add User B as collaborator (via ShareDialog)
   - Note the session ID from URL or console

2. **Browser 2 (Collaborator):**
   - Sign in as User B (different Google account)
   - Navigate to the same session (you'll need the session ID)
   - Or use the share link if public sharing is enabled

3. **Test Node Addition:**
   - Browser 1: Add a new node (ask a question)
   - Browser 2: Should see the new node appear automatically
   - Check console: Should see `node_add` event received

4. **Test Node Updates:**
   - Browser 1: Wait for a node to finish loading (get content)
   - Browser 2: Should see the node content update in real-time

5. **Test Selection Sync:**
   - Browser 1: Click on a node
   - Browser 2: Should see the same node get highlighted/selected

**Expected:**
- All changes appear in both browsers within ~100ms
- No duplicate nodes
- Selection changes sync
- Green indicator shows "2 active" in both browsers

---

### Test 4: Node Locking

**Goal:** Test conflict prevention with locks

**Setup:**
- Browser 1: User A
- Browser 2: User B (both with edit permission)

**Steps:**

1. Both users connect to the same session
2. Browser 1: Click on a node to select it
3. Browser 1: Try to edit (this should trigger a lock)
4. Browser 2: Should see a yellow lock indicator on that node
5. Browser 2: Try to edit the same node
6. Browser 2: Should see a warning (check console for `lock_failed`)

**Expected:**
- Lock indicator appears on locked nodes
- Shows who locked it: "Locked by user@email..."
- Other users cannot edit locked nodes
- Lock releases when user deselects or disconnects

**Note:** Lock functionality is implemented but may need UI triggers. Currently locks are managed via WebSocket events.

---

### Test 5: Presence Indicators

**Goal:** Verify active user tracking

**Steps:**

1. Browser 1: Connect to session
2. Check collaboration indicator: Should show "1 active"
3. Browser 2: Connect to same session
4. Browser 1: Should update to "2 active"
5. Browser 2: Should also show "2 active"
6. Browser 2: Close tab or disconnect
7. Browser 1: Should update to "1 active" after a few seconds

**Expected:**
- Active user count updates in real-time
- Shows correct count including yourself
- Updates when users join/leave

---

### Test 6: Reconnection Handling

**Goal:** Test auto-reconnection after network issues

**Steps:**

1. Browser 1: Connect to session
2. Open browser DevTools → Network tab
3. Throttle network to "Offline" or disconnect WiFi
4. Try to make a change (add node)
5. Re-enable network
6. Check console for reconnection messages

**Expected:**
- Console shows: `🔄 Reconnecting... (attempt 1/5)`
- Messages are queued while offline
- Messages sent when reconnected
- Connection restored automatically

---

### Test 7: Permission Levels

**Goal:** Test view vs edit permissions

**Setup:**
- Browser 1: Owner
- Browser 2: Collaborator with "View" permission

**Steps:**

1. Browser 1: Add User B as collaborator with "View" permission
2. Browser 2: Connect to session
3. Browser 2: Try to add a node or make changes
4. Check if changes are allowed

**Expected:**
- View-only users can see changes but cannot edit
- Edit users can make changes
- Owner has full control

**Note:** Permission enforcement happens server-side. Frontend may need additional UI restrictions.

---

### Test 8: Multiple Simultaneous Users

**Goal:** Stress test with 3+ users

**Steps:**

1. Open 3+ browser windows/tabs
2. Each signs in with different Google account
3. All connect to same session
4. Each user makes changes simultaneously
5. Verify all changes sync correctly

**Expected:**
- All users see all changes
- No conflicts or lost updates
- Active user count shows correct number
- Performance remains acceptable

---

## Debugging Tips

### Check WebSocket Connection

Open browser console and look for:
```javascript
// Should see:
🔌 WebSocket connected

// If not connected, check:
- Is backend running on port 8000?
- Is idToken valid?
- Check Network tab for WebSocket connection
```

### Monitor WebSocket Messages

In browser console:
```javascript
// The CollaborationWebSocket logs all events
// Look for messages like:
{
  type: 'node_add',
  user_id: 'user@example.com',
  data: { node: {...}, edge: {...} }
}
```

### Check Backend Logs

Backend terminal should show:
```
✅ Client connected: user=12345678... session=abcdef12... (total in room: 2)
📤 Broadcasting: node_add to 2 clients
```

### Common Issues

**Issue: WebSocket not connecting**
- Check CORS settings in `backend/main.py`
- Verify `ALLOWED_ORIGINS` includes `http://localhost:3000`
- Check that `GOOGLE_CLIENT_ID` is set correctly

**Issue: Changes not syncing**
- Verify both users are in the same session (same `session_id`)
- Check WebSocket connection status in both browsers
- Look for errors in browser console

**Issue: Permission denied**
- Verify user is added as collaborator in database
- Check `session_collaborators` table
- Ensure user is authenticated (has valid idToken)

**Issue: Database errors**
- Run migration: `003_collaboration.sql`
- Verify Supabase connection
- Check table names match (case-sensitive)

---

## Manual Database Checks

If you need to verify database state:

```sql
-- Check collaborators
SELECT * FROM session_collaborators WHERE session_id = 'your-session-id';

-- Check sessions
SELECT session_id, user_id, is_shared, collaboration_enabled 
FROM sessions 
WHERE session_id = 'your-session-id';

-- Check presence (if implemented)
SELECT * FROM session_presence WHERE session_id = 'your-session-id';
```

---

## Quick Test Script

For rapid testing, you can use this sequence:

1. ✅ Start backend and frontend
2. ✅ Sign in as User A
3. ✅ Create session
4. ✅ Add User B as collaborator
5. ✅ Open incognito window, sign in as User B
6. ✅ Navigate to same session
7. ✅ User A adds node → User B should see it
8. ✅ User B adds node → User A should see it
9. ✅ Both see "2 active" indicator
10. ✅ Test locks (if UI implemented)

---

## Next Steps for Production

1. **User Lookup**: Implement email → user_id lookup service
2. **Lock UI**: Add visual lock indicators and lock/unlock buttons
3. **Cursor Tracking**: Show collaborator cursors in real-time
4. **Notifications**: Alert users when locks fail or users join
5. **Presence Persistence**: Store presence in database for history
6. **Rate Limiting**: Tune rate limits based on usage
7. **Error Handling**: Better error messages for users

---

## Success Criteria

✅ WebSocket connects successfully  
✅ Multiple users can connect to same session  
✅ Changes sync in real-time (< 500ms)  
✅ Presence indicators show correct count  
✅ Locks prevent conflicts  
✅ Reconnection works after disconnect  
✅ Permissions are enforced  
✅ No data loss or duplicates  

If all these pass, your collaborative sharing is working! 🎉

---

## Files Changed Summary

### Backend Files
- **`backend/websocket.py`** (NEW) - WebSocket server with connection management, room-based broadcasting, and node locking
- **`backend/main.py`** (MODIFIED) - Added WebSocket endpoint (`/ws/session/{session_id}`), permission helpers, and collaborator management APIs
- **`backend/migrations/003_collaboration.sql`** (NEW) - Database migration for `session_collaborators` and `session_presence` tables

### Frontend Files
- **`frontend/app/utils/api.ts`** (MODIFIED) - Added `CollaborationWebSocket` class, collaborator management APIs (`addCollaborator`, `listCollaborators`, `removeCollaborator`)
- **`frontend/app/hooks/useCollaboration.ts`** (NEW) - React hook for managing WebSocket collaboration connection
- **`frontend/app/components/Canvas.tsx`** (MODIFIED) - Integrated WebSocket, real-time event handling, presence indicators, and lock management
- **`frontend/app/components/CardNode.tsx`** (MODIFIED) - Added lock indicator UI showing when nodes are locked by other users
- **`frontend/app/components/ShareDialog.tsx`** (MODIFIED) - Added collaborator management UI (add/remove, set permissions)

### Documentation
- **`TESTING_COLLABORATION.md`** (NEW) - This testing guide


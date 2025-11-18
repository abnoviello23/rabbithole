"""
WebSocket server for real-time collaborative editing.

Handles:
- Connection management (join/leave rooms)
- Message broadcasting to all connected clients
- Presence tracking
- Reconnection with state sync
"""

import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect, Depends
from collections import defaultdict
import asyncio
import time

logger = logging.getLogger(__name__)

# Room management: session_id -> Set[WebSocket]
rooms: Dict[str, Set[WebSocket]] = defaultdict(set)

# Connection metadata: WebSocket -> {user_id, session_id, connected_at}
connection_metadata: Dict[WebSocket, Dict] = {}

# Node locks: session_id -> {node_id: user_id}
node_locks: Dict[str, Dict[str, str]] = defaultdict(dict)

# Rate limiting: user_id -> last_message_time
rate_limits: Dict[str, float] = {}
RATE_LIMIT_SECONDS = 0.1  # Minimum 100ms between messages per user


class ConnectionManager:
    """Manages WebSocket connections and room-based broadcasting."""
    
    async def connect(self, websocket: WebSocket, session_id: str, user_id: str):
        """Connect a client to a session room."""
        await websocket.accept()
        
        # Add to room
        rooms[session_id].add(websocket)
        
        # Store metadata
        connection_metadata[websocket] = {
            "user_id": user_id,
            "session_id": session_id,
            "connected_at": time.time()
        }
        
        logger.info(f"✅ Client connected: user={user_id[:8]}... session={session_id[:8]}... (total in room: {len(rooms[session_id])})")
        
        # Notify others in room about new user
        await self.broadcast_to_room(
            session_id,
            {
                "type": "user_joined",
                "user_id": user_id,
                "timestamp": time.time()
            },
            exclude_websocket=websocket
        )
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect a client from their session room."""
        if websocket not in connection_metadata:
            return
        
        metadata = connection_metadata[websocket]
        session_id = metadata["session_id"]
        user_id = metadata["user_id"]
        
        # Remove from room
        if websocket in rooms[session_id]:
            rooms[session_id].remove(websocket)
        
        # Remove metadata
        del connection_metadata[websocket]
        
        # Release any locks held by this user
        if session_id in node_locks:
            nodes_to_unlock = [
                node_id for node_id, locked_by in node_locks[session_id].items()
                if locked_by == user_id
            ]
            for node_id in nodes_to_unlock:
                del node_locks[session_id][node_id]
                # Notify others that lock is released
                asyncio.create_task(self.broadcast_to_room(
                    session_id,
                    {
                        "type": "node_unlocked",
                        "node_id": node_id,
                        "user_id": user_id,
                        "timestamp": time.time()
                    }
                ))
        
        logger.info(f"❌ Client disconnected: user={user_id[:8]}... session={session_id[:8]}... (remaining in room: {len(rooms[session_id])})")
        
        # Notify others in room
        asyncio.create_task(self.broadcast_to_room(
            session_id,
            {
                "type": "user_left",
                "user_id": user_id,
                "timestamp": time.time()
            }
        ))
    
    async def broadcast_to_room(
        self,
        session_id: str,
        message: dict,
        exclude_websocket: Optional[WebSocket] = None
    ):
        """Broadcast a message to all clients in a session room."""
        if session_id not in rooms:
            return
        
        disconnected = []
        message_json = json.dumps(message)
        
        for websocket in rooms[session_id]:
            if websocket == exclude_websocket:
                continue
            
            try:
                await websocket.send_text(message_json)
            except Exception as e:
                logger.warning(f"Failed to send message to client: {e}")
                disconnected.append(websocket)
        
        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)
    
    def get_room_users(self, session_id: str) -> Set[str]:
        """Get set of user IDs currently in a room."""
        users = set()
        for websocket in rooms.get(session_id, set()):
            if websocket in connection_metadata:
                users.add(connection_metadata[websocket]["user_id"])
        return users
    
    def lock_node(self, session_id: str, node_id: str, user_id: str) -> bool:
        """Lock a node for editing. Returns True if lock acquired, False if already locked."""
        if node_id in node_locks.get(session_id, {}):
            locked_by = node_locks[session_id][node_id]
            if locked_by != user_id:
                return False  # Already locked by someone else
        
        node_locks[session_id][node_id] = user_id
        return True
    
    def unlock_node(self, session_id: str, node_id: str, user_id: str) -> bool:
        """Unlock a node. Returns True if unlocked, False if not locked by this user."""
        if session_id not in node_locks:
            return False
        
        if node_id not in node_locks[session_id]:
            return False
        
        if node_locks[session_id][node_id] != user_id:
            return False  # Locked by someone else
        
        del node_locks[session_id][node_id]
        return True
    
    def check_rate_limit(self, user_id: str) -> bool:
        """Check if user is within rate limit. Returns True if allowed."""
        now = time.time()
        if user_id in rate_limits:
            if now - rate_limits[user_id] < RATE_LIMIT_SECONDS:
                return False
        
        rate_limits[user_id] = now
        return True


manager = ConnectionManager()


async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    user_id: str
):
    """
    WebSocket endpoint for real-time collaboration.
    
    Expected message format:
    {
        "type": "node_add" | "node_update" | "node_delete" | "edge_add" | "edge_delete" | 
                "cursor_move" | "selection_change" | "lock_node" | "unlock_node" | "ping",
        "data": {...},
        "timestamp": float
    }
    """
    await manager.connect(websocket, session_id, user_id)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON"
                }))
                continue
            
            # Check rate limit
            if not manager.check_rate_limit(user_id):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Rate limit exceeded"
                }))
                continue
            
            message_type = message.get("type")
            
            # Handle ping/pong for keepalive
            if message_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": time.time()
                }))
                continue
            
            # Add user_id and timestamp to message
            message["user_id"] = user_id
            if "timestamp" not in message:
                message["timestamp"] = time.time()
            
            # Handle lock/unlock operations
            if message_type == "lock_node":
                node_id = message.get("data", {}).get("node_id")
                if node_id:
                    locked = manager.lock_node(session_id, node_id, user_id)
                    if locked:
                        # Broadcast lock to others
                        await manager.broadcast_to_room(
                            session_id,
                            {
                                "type": "node_locked",
                                "node_id": node_id,
                                "user_id": user_id,
                                "timestamp": message["timestamp"]
                            },
                            exclude_websocket=websocket
                        )
                    else:
                        # Lock failed - notify requester
                        await websocket.send_text(json.dumps({
                            "type": "lock_failed",
                            "node_id": node_id,
                            "message": "Node is already locked by another user"
                        }))
                continue
            
            if message_type == "unlock_node":
                node_id = message.get("data", {}).get("node_id")
                if node_id:
                    unlocked = manager.unlock_node(session_id, node_id, user_id)
                    if unlocked:
                        # Broadcast unlock to others
                        await manager.broadcast_to_room(
                            session_id,
                            {
                                "type": "node_unlocked",
                                "node_id": node_id,
                                "user_id": user_id,
                                "timestamp": message["timestamp"]
                            },
                            exclude_websocket=websocket
                        )
                continue
            
            # Broadcast other events to all clients in room (including sender for confirmation)
            await manager.broadcast_to_room(session_id, message)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


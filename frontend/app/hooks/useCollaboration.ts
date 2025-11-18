'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CollaborationWebSocket, CollaborationEvent } from '../utils/api';

interface UseCollaborationOptions {
  sessionId: string;
  idToken: string | undefined;
  enabled?: boolean;
  onEvent?: (event: CollaborationEvent) => void;
}

interface UseCollaborationReturn {
  ws: CollaborationWebSocket | null;
  isConnected: boolean;
  sendEvent: (event: CollaborationEvent) => void;
  activeUsers: Set<string>;
  lockedNodes: Map<string, string>; // node_id -> user_id
}

/**
 * React hook for managing WebSocket collaboration connection
 */
export function useCollaboration({
  sessionId,
  idToken,
  enabled = true,
  onEvent,
}: UseCollaborationOptions): UseCollaborationReturn {
  const [ws, setWs] = useState<CollaborationWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Set<string>>(new Set());
  const [lockedNodes, setLockedNodes] = useState<Map<string, string>>(new Map());
  const wsRef = useRef<CollaborationWebSocket | null>(null);
  const onEventRef = useRef(onEvent);

  // Update onEvent ref when it changes
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled || !idToken || !sessionId) {
      return;
    }

    const collaborationWs = new CollaborationWebSocket(sessionId, idToken);
    wsRef.current = collaborationWs;
    setWs(collaborationWs);

    // Set up event listeners
    const handleUserJoined = (event: CollaborationEvent) => {
      if (event.user_id) {
        setActiveUsers(prev => new Set([...prev, event.user_id!]));
      }
      onEventRef.current?.(event);
    };

    const handleUserLeft = (event: CollaborationEvent) => {
      if (event.user_id) {
        setActiveUsers(prev => {
          const next = new Set(prev);
          next.delete(event.user_id!);
          return next;
        });
      }
      onEventRef.current?.(event);
    };

    const handleNodeLocked = (event: CollaborationEvent) => {
      if (event.node_id && event.user_id) {
        setLockedNodes(prev => new Map(prev).set(event.node_id!, event.user_id!));
      }
      onEventRef.current?.(event);
    };

    const handleNodeUnlocked = (event: CollaborationEvent) => {
      if (event.node_id) {
        setLockedNodes(prev => {
          const next = new Map(prev);
          next.delete(event.node_id!);
          return next;
        });
      }
      onEventRef.current?.(event);
    };

    const handleAllEvents = (event: CollaborationEvent) => {
      // Handle connection status
      if (event.type === 'pong') {
        setIsConnected(true);
      }
    };

    collaborationWs.on('user_joined', handleUserJoined);
    collaborationWs.on('user_left', handleUserLeft);
    collaborationWs.on('node_locked', handleNodeLocked);
    collaborationWs.on('node_unlocked', handleNodeUnlocked);
    collaborationWs.on('all', handleAllEvents);

    // Connect
    collaborationWs.connect()
      .then(() => {
        setIsConnected(true);
      })
      .catch((error) => {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
      });

    // Cleanup
    return () => {
      collaborationWs.off('user_joined', handleUserJoined);
      collaborationWs.off('user_left', handleUserLeft);
      collaborationWs.off('node_locked', handleNodeLocked);
      collaborationWs.off('node_unlocked', handleNodeUnlocked);
      collaborationWs.off('all', handleAllEvents);
      collaborationWs.disconnect();
      wsRef.current = null;
      setWs(null);
      setIsConnected(false);
    };
  }, [enabled, idToken, sessionId]);

  const sendEvent = useCallback((event: CollaborationEvent) => {
    if (wsRef.current) {
      wsRef.current.send(event);
    }
  }, []);

  return {
    ws,
    isConnected,
    sendEvent,
    activeUsers,
    lockedNodes,
  };
}


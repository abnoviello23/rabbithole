'use client';

import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  MarkerType,
  PanOnScrollMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { CardNode, CardNodeData } from './CardNode';
import { CustomEdge } from './CustomEdge';
import { SessionManager } from './SessionManager';
import { ChatPanel, ChatMessage } from './ChatPanel';
import { FileText } from 'lucide-react';
import { layoutNodes } from '../utils/layout';
import { generateContent, NodeContext } from '../utils/api';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialNodes';

const STORAGE_KEY = 'rabbithole-sessions';

interface SessionData {
  nodes: Node<CardNodeData>[];
  edges: Edge[];
}

interface Sessions {
  [sessionName: string]: SessionData;
}

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [currentSessionName, setCurrentSessionName] = useState<string>('New Session');
  const [sessions, setSessions] = useState<string[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);

  // Helper function to build path from root to a given node
  const buildPath = useCallback((targetNodeId: string, currentEdges: Edge[]): string[] => {
    const path: string[] = [];
    let currentId = targetNodeId;

    // Traverse backwards from target to root
    while (currentId) {
      path.unshift(currentId);
      const parentEdge = currentEdges.find((e) => e.target === currentId);
      if (!parentEdge) break;
      currentId = parentEdge.source;
    }

    return path;
  }, []);

  // Helper function to build context from nodes in path
  const buildContext = useCallback((pathIds: string[], currentNodes: Node<CardNodeData>[]): Record<string, NodeContext> => {
    const context: Record<string, NodeContext> = {};

    pathIds.forEach((nodeId) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (node && node.data) {
        context[nodeId] = {
          id: nodeId,
          title: node.data.title,
          content: node.data.body,
        };
      }
    });

    return context;
  }, []);

  // Helper function to build lineage for chat view
  const buildLineage = useCallback((targetNodeId: string | null): ChatMessage[] => {
    if (!targetNodeId) return [];

    const pathIds = buildPath(targetNodeId, edges);
    const lineage: ChatMessage[] = [];

    pathIds.forEach((nodeId, index) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || !node.data) return;

      // Skip root node
      if (node.data.isRoot) return;

      // Find the edge that led to this node (to get the query and context)
      const incomingEdge = edges.find((e) => e.target === nodeId);
      const edgeData = incomingEdge?.data as any;
      const userQuery = edgeData?.userQuery || (incomingEdge?.label as string);
      const selectedContext = edgeData?.selectedContext;
      const color = edgeData?.color;

      lineage.push({
        nodeId,
        title: node.data.title,
        body: node.data.body,
        userQuery,
        selectedContext,
        color,
        isRoot: node.data.isRoot,
      });
    });

    return lineage;
  }, [nodes, edges, buildPath]);

  const handleAddNote = useCallback(async (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => {
    const nodeId = `node-${Date.now()}`;
    const edgeId = `edge-${Date.now()}`;

    // Create loading node
    const loadingNode: Node<CardNodeData> = {
      id: nodeId,
      type: 'card',
      data: {
        title: '',
        body: '',
        image: '',
        isLoading: true,
        color,
      },
      position: { x: 0, y: 0 },
    };

    const newEdge: Edge = {
      id: edgeId,
      source: sourceId,
      target: nodeId,
      type: 'custom',
      label: `> ${userQuery}`,
      style: color ? { stroke: color, strokeWidth: 2 } : undefined,
      markerEnd: color ? { type: MarkerType.ArrowClosed, color } : undefined,
      data: { color, userQuery, selectedContext },
    };

    // Add edge and loading node with immediate layout
    let currentEdges: Edge[] = [];
    let currentNodes: Node<CardNodeData>[] = [];

    setEdges((edges) => {
      currentEdges = [...edges, newEdge];
      setNodes((ns) => {
        currentNodes = [...ns, loadingNode];
        return layoutNodes(currentNodes, currentEdges);
      });
      return currentEdges;
    });

    // Generate content with full context
    try {
      // Build path from root to source node
      const pathIds = buildPath(sourceId, currentEdges);
      const path = pathIds.join('/');

      // Build context from all nodes in path
      const context = buildContext(pathIds, currentNodes);

      // Generate content with context
      const content = await generateContent(userQuery, selectedContext, path, context);

      // Update node with generated content
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...content,
                  isLoading: false,
                  color, // Preserve the color
                },
              }
            : n
        )
      );
    } catch (error) {
      console.error('Failed to generate content:', error);
      // Remove loading node on error
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.id !== edgeId));
    }
  }, [setNodes, setEdges, buildPath, buildContext]);

  // Calculate active path node IDs
  const activePathNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const pathIds = buildPath(selectedNodeId, edges);
    return new Set(pathIds);
  }, [selectedNodeId, edges, buildPath]);

  // Handle node click (for selection)
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setIsChatPanelOpen(true);
  }, []);

  const nodeTypes = useMemo(
    () => ({
      card: (props: any) => (
        <CardNode
          {...props}
          onAddNote={handleAddNote}
          onNodeClick={handleNodeClick}
          isInActivePath={activePathNodeIds.has(props.id)}
          isSelected={props.id === selectedNodeId}
          isChatPanelOpen={isChatPanelOpen}
          edges={edges}
        />
      ),
    }),
    [handleAddNote, handleNodeClick, activePathNodeIds, selectedNodeId, isChatPanelOpen, edges]
  );

  const edgeTypes = useMemo(
    () => ({
      custom: (props: any) => (
        <CustomEdge
          {...props}
          isInActivePath={activePathNodeIds.has(props.source) && activePathNodeIds.has(props.target)}
          isChatPanelOpen={isChatPanelOpen}
        />
      ),
    }),
    [activePathNodeIds, isChatPanelOpen]
  );

  // Generate session name from first edge label (initial query)
  const generateSessionName = useCallback((currentEdges: Edge[]): string => {
    const rootNode = nodes.find(n => n.data?.isRoot);
    if (!rootNode) return 'New Session';

    const firstEdge = currentEdges.find(e => e.source === rootNode.id);
    if (firstEdge && firstEdge.label) {
      const name = String(firstEdge.label).slice(0, 30);
      return name.length < String(firstEdge.label).length ? name + '...' : name;
    }

    return 'New Session';
  }, [nodes]);

  // Load all sessions from localStorage
  const loadSessionsList = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allSessions: Sessions = JSON.parse(stored);
        setSessions(Object.keys(allSessions));
      }
    } catch (error) {
      console.error('Failed to load sessions list:', error);
    }
  }, []);

  // Save current session to localStorage (debounced)
  const saveSession = useCallback((name: string, currentNodes: Node<CardNodeData>[], currentEdges: Edge[]) => {
    if (typeof window === 'undefined') return;

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const allSessions: Sessions = stored ? JSON.parse(stored) : {};

        allSessions[name] = {
          nodes: currentNodes,
          edges: currentEdges,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(allSessions));
        loadSessionsList();
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    }, 500);
  }, [loadSessionsList]);

  // Load a specific session
  const loadSession = useCallback((name: string) => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allSessions: Sessions = JSON.parse(stored);
        const sessionData = allSessions[name];

        if (sessionData) {
          setNodes(sessionData.nodes || INITIAL_NODES);
          setEdges(sessionData.edges || INITIAL_EDGES);
          setCurrentSessionName(name);
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, [setNodes, setEdges]);

  // Create new session
  const createNewSession = useCallback(() => {
    setNodes(INITIAL_NODES);
    setEdges(INITIAL_EDGES);
    setCurrentSessionName('New Session');
  }, [setNodes, setEdges]);

  // Delete a session
  const deleteSession = useCallback((name: string) => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allSessions: Sessions = JSON.parse(stored);
        delete allSessions[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allSessions));
        loadSessionsList();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [loadSessionsList]);

  // Initialize: Load sessions list and last session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    loadSessionsList();

    // Try to load the first available session
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allSessions: Sessions = JSON.parse(stored);
        const sessionNames = Object.keys(allSessions);
        if (sessionNames.length > 0) {
          const lastSession = sessionNames[sessionNames.length - 1];
          loadSession(lastSession);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to load initial session:', error);
    }

    // If no sessions, initialize with default
    setNodes(INITIAL_NODES);
  }, [setNodes, loadSessionsList, loadSession]);

  // Auto-save current session when nodes or edges change
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      // Update session name based on first query
      const newName = generateSessionName(edges);
      if (newName !== currentSessionName && newName !== 'New Session') {
        setCurrentSessionName(newName);
      }

      // Save to localStorage
      saveSession(currentSessionName, nodes, edges);
    }
  }, [nodes, edges, currentSessionName, generateSessionName, saveSession]);

  // Re-layout whenever node dimensions or loading state changes
  useEffect(() => {
    const allMeasured = nodes.every((n) => n.width && n.height);
    if (allMeasured && nodes.length > 0) {
      // Re-layout with current dimensions
      const layoutedNodes = layoutNodes(nodes, edges);

      // Check if positions actually changed to avoid infinite loop
      const positionsChanged = layoutedNodes.some((ln, i) => {
        const original = nodes[i];
        return ln.position.x !== original.position.x || ln.position.y !== original.position.y;
      });

      if (positionsChanged) {
        setNodes(layoutedNodes);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.map(n => `${n.id}:${n.width}:${n.height}:${n.data?.isLoading}`).join(','), edges]);

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#0a0a0a', display: 'flex' }}>
      {/* Canvas area */}
      <div
        style={{
          width: isChatPanelOpen ? '66.666%' : '100%',
          height: '100vh',
          transition: 'width 300ms ease-in-out',
          position: 'relative',
        }}
      >
        <SessionManager
          currentSession={currentSessionName}
          sessions={sessions}
          onLoadSession={loadSession}
          onCreateSession={createNewSession}
          onDeleteSession={deleteSession}
        />

        {/* Chat panel toggle button */}
        <button
          onClick={() => setIsChatPanelOpen(!isChatPanelOpen)}
          className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg text-white hover:bg-black/50 transition-colors"
          title="View conversation path"
        >
          <FileText className="w-4 h-4" />
        </button>

        <div style={{ width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(c) => setEdges((es) => addEdge({ ...c, type: 'custom' }, es))}
            fitView
            fitViewOptions={{ padding: 5.5 }}
            minZoom={0.1}
            maxZoom={4}
            nodesDraggable={false}
            elementsSelectable={true}
            panOnScroll={true}
            zoomOnScroll={false}
            zoomOnPinch={true}
            panOnScrollMode={PanOnScrollMode.Free}
            defaultEdgeOptions={{
              type: 'custom',
              style: { stroke: '#9CA3AF', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
          >
            <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#2a2a2a" />
            {/* <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.6)" /> */}
            {/* <Controls /> */}
          </ReactFlow>
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel
        isOpen={isChatPanelOpen}
        onClose={() => setIsChatPanelOpen(false)}
        lineage={buildLineage(selectedNodeId)}
      />
    </div>
  );
}

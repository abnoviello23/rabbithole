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

import { useCallback, useEffect, useMemo, useState, useRef, createContext, useContext } from 'react';
import { CardNode, CardNodeData, assignClusterColors } from './CardNode';
import { CustomEdge } from './CustomEdge';
import { SessionManager } from './SessionManager';
import { ChatPanel, ChatMessage } from './ChatPanel';
import { FloatingChat } from './FloatingChat';
import { ClusterLegend } from './ClusterLegend';
import { FileText } from 'lucide-react';
import { layoutNodes } from '../utils/layout';
import { generateContent, NodeContext, autoMode, clusterNodes, ClusterResult, researchWithAgent, AgentEvent, Source } from '../utils/api';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialNodes';

const STORAGE_KEY = 'rabbithole-sessions';

// Helper function to remove emojis from text
function stripEmojis(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

// Create context for dynamic props
interface CanvasContextType {
  onAddNote: (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => void;
  onAgentRequest: (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => void;
  onNodeClick: (nodeId: string) => void;
  activePathNodeIds: Set<string>;
  selectedNodeId: string | null;
  isChatPanelOpen: boolean;
  edges: Edge[];
  clusterData: ClusterResult | null;
}

const CanvasContext = createContext<CanvasContextType | null>(null);

// Wrapper components that use context
function CardNodeWrapper(props: any) {
  const context = useContext(CanvasContext);
  if (!context) return null;

  return (
    <CardNode
      {...props}
      onAddNote={context.onAddNote}
      onAgentRequest={context.onAgentRequest}
      onNodeClick={context.onNodeClick}
      isInActivePath={context.activePathNodeIds.has(props.id)}
      isSelected={props.id === context.selectedNodeId}
      isChatPanelOpen={context.isChatPanelOpen}
      edges={context.edges}
    />
  );
}

function CustomEdgeWrapper(props: any) {
  const context = useContext(CanvasContext);
  if (!context) return null;
  
  return (
    <CustomEdge
      {...props}
      isInActivePath={context.activePathNodeIds.has(props.source) && context.activePathNodeIds.has(props.target)}
      isChatPanelOpen={context.isChatPanelOpen}
    />
  );
}

// Define node and edge types OUTSIDE the component
const nodeTypes = {
  card: CardNodeWrapper,
};

const edgeTypes = {
  custom: CustomEdgeWrapper,
};

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
  const [clusterData, setClusterData] = useState<ClusterResult | null>(null);
  const [isLegendVisible, setIsLegendVisible] = useState(true);
  const hasShownLegendRef = useRef(false);

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
  const buildContext = useCallback((pathIds: string[], currentNodes: Node<CardNodeData>[], currentEdges: Edge[]): Record<string, NodeContext> => {
    const context: Record<string, NodeContext> = {};

    pathIds.forEach((nodeId) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (node && node.data) {
        // Detect if this is an agent node (has sources or sourcesCount)
        const isAgentNode = !!(node.data.sources || node.data.sourcesCount || node.data.statusUpdates);

        // Get the query from the incoming edge
        const incomingEdge = currentEdges.find((e) => e.target === nodeId);
        const edgeData = incomingEdge?.data as any;
        const query = edgeData?.userQuery || (incomingEdge?.label as string);

        context[nodeId] = {
          id: nodeId,
          title: node.data.title,
          content: node.data.body,
          // Include agent metadata if present
          statusUpdates: node.data.statusUpdates,
          sources: node.data.sources,
          sourcesCount: node.data.sourcesCount,
          isAgentNode,
          query,
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
      label: userQuery,
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
      const context = buildContext(pathIds, currentNodes, currentEdges);

      // Generate content with context
      const content = await generateContent(userQuery, selectedContext, path, context);
      
      console.log('Generated content:', { 
        title: content.title, 
        hasSubtopics: !!content.subtopics, 
        subtopicsCount: content.subtopics?.length 
      });

      // Update node with generated content
      setNodes((ns) => {
        const updatedNodes = ns.map((n) =>
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
        );
        
        // Run clustering on all nodes (including the newly updated one)
        const allNodesContext: Record<string, NodeContext> = {};
        updatedNodes.forEach((node) => {
          if (!node.data?.isRoot && node.data?.title && node.data?.body) {
            allNodesContext[node.id] = {
              id: node.id,
              title: node.data.title,
              content: node.data.body,
            };
          }
        });
        
        // Call clustering asynchronously (don't block the UI)
        if (Object.keys(allNodesContext).length > 1) {
          clusterNodes(allNodesContext)
            .then((clusters) => {
              setClusterData(clusters);
            })
            .catch((error) => {
              console.error('Clustering failed:', error);
            });
        }
        
        return updatedNodes;
      });

      // Subtopics are now displayed inline in the node, no need to create separate nodes
    } catch (error) {
      console.error('Failed to generate content:', error);
      // Remove loading node on error
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.id !== edgeId));
    }
  }, [setNodes, setEdges, buildPath, buildContext, nodes, edges]);

  const handleAgentRequest = useCallback(async (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => {
    const nodeId = `node-${Date.now()}`;
    const edgeId = `edge-${Date.now()}`;

    // Create loading node with agent-specific message
    const loadingNode: Node<CardNodeData> = {
      id: nodeId,
      type: 'card',
      data: {
        title: 'AI Agent Researching...',
        body: '',
        statusUpdates: ['Initializing Claude AI agent with web search capabilities...'],
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
      label: userQuery,
      style: color ? { stroke: color, strokeWidth: 2 } : { stroke: '#8B5CF6', strokeWidth: 2 },
      markerEnd: color ? { type: MarkerType.ArrowClosed, color } : { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
      data: { color: color || '#8B5CF6', userQuery, selectedContext },
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

    // Track status messages and sources count
    const statusMessages: string[] = ['Initializing Claude AI agent with web search capabilities...'];
    let totalSources = 0;
    const sources: Source[] = [];
    const createdNodeIds = new Set<string>(); // Track nodes created by agent to prevent duplicates

    try {
      // Build path from root to source node
      const pathIds = buildPath(sourceId, currentEdges);
      const path = pathIds.join('/');

      // Build context from all nodes in path
      const context = buildContext(pathIds, currentNodes, currentEdges);

      // Research with agent, streaming updates
      const result = await researchWithAgent(
        nodeId,
        userQuery,
        path,
        context,
        selectedContext,
        (event: AgentEvent) => {
          // Handle node creation events from agent
          if (event.type === 'node_created' && event.node_id && event.source_id && event.title && event.body) {
            // Prevent duplicate creation
            if (createdNodeIds.has(event.node_id)) {
              console.log(`⚠️ Skipping duplicate node creation: ${event.node_id}`);
              return;
            }
            createdNodeIds.add(event.node_id);

            const agentNodeId = event.node_id;
            const agentEdgeId = `edge-${Date.now()}-${Math.random()}`;

            console.log(`🎨 Agent creating node: ${event.title} (${agentNodeId})`);

            // Create the new node
            const newNode: Node<CardNodeData> = {
              id: agentNodeId,
              type: 'card',
              data: {
                title: event.title,
                body: event.body,
                isLoading: false,
                color: color || '#8B5CF6', // Agent nodes get purple color by default
              },
              position: { x: 0, y: 0 },
            };

            // Create edge from source to new node
            const newEdge: Edge = {
              id: agentEdgeId,
              source: event.source_id,
              target: agentNodeId,
              type: 'custom',
              label: event.user_query || event.title,
              style: { stroke: color || '#8B5CF6', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: color || '#8B5CF6' },
              data: { color: color || '#8B5CF6', userQuery: event.user_query || event.title },
            };

            // Add node and edge to canvas
            setEdges((edges) => {
              const updatedEdges = [...edges, newEdge];
              setNodes((ns) => {
                const updatedNodes = [...ns, newNode];
                return layoutNodes(updatedNodes, updatedEdges);
              });
              return updatedEdges;
            });

            // Log status update
            statusMessages.push(`Created node: ${event.title}`);
            setNodes((ns) =>
              ns.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        statusUpdates: [...statusMessages],
                      },
                    }
                  : n
              )
            );
          }
          // Handle streaming events
          else if (event.type === 'status' && event.text) {
            const cleanText = stripEmojis(event.text);
            if (cleanText) {
              statusMessages.push(cleanText);
              // Update node with latest status
              setNodes((ns) =>
                ns.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          statusUpdates: [...statusMessages],
                          isLoading: true,
                        },
                      }
                    : n
                )
              );
            }
          } else if (event.type === 'tool' && event.name) {
            // Track Exa search tool invocations
            if (event.name.includes('exa') && event.details?.num_results) {
              totalSources += event.details.num_results;
            }

            const toolMessage = stripEmojis(`Using: ${event.name}${event.details?.query ? ` - "${event.details.query}"` : ''}`);
            statusMessages.push(toolMessage);
            // Update node with tool usage
            setNodes((ns) =>
              ns.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        statusUpdates: [...statusMessages],
                        isLoading: true,
                      },
                    }
                  : n
              )
            );
          } else if (event.type === 'sources' && event.sources) {
            // Received actual URLs from Exa search results
            sources.push(...event.sources);
            console.log(`📚 Received ${event.sources.length} sources from backend, total: ${sources.length}`);
          }
        }
      );

      console.log('Agent research completed:', result);
      console.log('Total sources crawled:', totalSources);
      console.log('Sources collected:', sources);

      // Update node with final result
      setNodes((ns) => {
        const updatedNodes = ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  title: result.title,
                  body: result.body,
                  suggestedQuestions: result.suggested_questions,
                  sourcesCount: totalSources > 0 ? totalSources : undefined,
                  sources: sources.length > 0 ? sources : undefined,
                  isLoading: false,
                  color: color || '#8B5CF6',
                  statusUpdates: undefined, // Clear status updates on completion
                },
              }
            : n
        );

        // Run clustering on all nodes
        const allNodesContext: Record<string, NodeContext> = {};
        updatedNodes.forEach((node) => {
          if (!node.data?.isRoot && node.data?.title && node.data?.body) {
            allNodesContext[node.id] = {
              id: node.id,
              title: node.data.title,
              content: node.data.body,
            };
          }
        });

        // Call clustering asynchronously
        if (Object.keys(allNodesContext).length > 1) {
          clusterNodes(allNodesContext)
            .then((clusters) => {
              setClusterData(clusters);
            })
            .catch((error) => {
              console.error('Clustering failed:', error);
            });
        }

        return updatedNodes;
      });
    } catch (error) {
      console.error('Failed to research with agent:', error);
      // Update node with error message
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  title: 'Agent Research Failed',
                  body: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  isLoading: false,
                  statusUpdates: undefined,
                },
              }
            : n
        )
      );
    }
  }, [setNodes, setEdges, buildPath, buildContext, nodes, edges]);

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

  // Handle floating chat query submission
  const handleFloatingChatQuery = useCallback(async (query: string) => {
    try {
      // Build context from all current nodes (excluding root)
      const context: Record<string, NodeContext> = {};
      nodes.forEach((node) => {
        if (!node.data?.isRoot && node.data?.title && node.data?.body) {
          context[node.id] = {
            id: node.id,
        title: node.data.title,
            content: node.data.body,
          };
        }
      });

      // If no nodes exist yet, use root node
      if (Object.keys(context).length === 0) {
        const rootNode = nodes.find(n => n.data?.isRoot);
        if (rootNode) {
          await handleAddNote(rootNode.id, query);
          return;
        }
      }

      // Run both semantic search and clustering in parallel
      const [autoModeResult, clusters] = await Promise.all([
        autoMode(query, context),
        clusterNodes(context)
      ]);

      // Store cluster data (logs are in backend)
      setClusterData(clusters);

      // Highlight and select the matched node
      setSelectedNodeId(autoModeResult.node_id);
      setIsChatPanelOpen(true);

      // Add a new note as a child of the matched node
      await handleAddNote(autoModeResult.node_id, query);

    } catch (error) {
      console.error('Failed to process floating chat query:', error);
      throw error;
    }
  }, [nodes, handleAddNote]);

  // Create context value with all dynamic props
  const contextValue = useMemo(
    () => ({
      onAddNote: handleAddNote,
      onAgentRequest: handleAgentRequest,
      onNodeClick: handleNodeClick,
      activePathNodeIds,
      selectedNodeId,
      isChatPanelOpen,
      edges,
      clusterData,
    }),
    [handleAddNote, handleAgentRequest, handleNodeClick, activePathNodeIds, selectedNodeId, isChatPanelOpen, edges, clusterData]
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

        // Filter out subtopic nodes before saving (they're now displayed inline)
        const filteredNodes = currentNodes.filter(n => !n.data?.isSubtopic);

        // Get IDs of subtopic nodes to filter out their edges
        const subtopicNodeIds = new Set(
          currentNodes.filter(n => n.data?.isSubtopic).map(n => n.id)
        );

        // Filter out edges connected to subtopic nodes
        const filteredEdges = currentEdges.filter(
          e => !subtopicNodeIds.has(e.source) && !subtopicNodeIds.has(e.target)
        );

        allSessions[name] = {
          nodes: filteredNodes,
          edges: filteredEdges,
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
          // Filter out old subtopic nodes (they're now displayed inline)
          const filteredNodes = (sessionData.nodes || INITIAL_NODES).filter(n => !n.data?.isSubtopic);

          // Get IDs of subtopic nodes to filter out their edges
          const subtopicNodeIds = new Set(
            (sessionData.nodes || []).filter(n => n.data?.isSubtopic).map(n => n.id)
          );

          // Filter out edges connected to subtopic nodes
          const filteredEdges = (sessionData.edges || INITIAL_EDGES).filter(
            e => !subtopicNodeIds.has(e.source) && !subtopicNodeIds.has(e.target)
          );

          setNodes(filteredNodes);
          setEdges(filteredEdges);
          setCurrentSessionName(name);
          
          // Run clustering on loaded nodes to get cluster colors
          const loadedNodes = sessionData.nodes || INITIAL_NODES;
          const allNodesContext: Record<string, NodeContext> = {};
          loadedNodes.forEach((node) => {
            if (!node.data?.isRoot && node.data?.title && node.data?.body) {
              allNodesContext[node.id] = {
                id: node.id,
                title: node.data.title,
                content: node.data.body,
              };
            }
          });
          
          // Cluster the loaded nodes if there are enough nodes
          if (Object.keys(allNodesContext).length > 1) {
            hasShownLegendRef.current = false; // Reset so legend shows for loaded session
            clusterNodes(allNodesContext)
              .then((clusters) => {
                setClusterData(clusters);
              })
              .catch((error) => {
                console.error('Clustering failed on session load:', error);
              });
          } else {
            // Clear cluster data if not enough nodes
            setClusterData(null);
            hasShownLegendRef.current = false;
          }
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
    setClusterData(null); // Clear cluster data for new session
    hasShownLegendRef.current = false; // Reset legend visibility state
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


  // Apply cluster colors to nodes when clusterData changes
  useEffect(() => {
    if (!clusterData || Object.keys(clusterData).length === 0) {
      return;
    }

    // Get cluster titles in a consistent order
    const clusterTitles = Object.keys(clusterData);
    
    // Assign colors maximizing contrast between clusters
    const clusterColorMap = assignClusterColors(clusterTitles);

    // Build a map of nodeId -> clusterColor
    const nodeToClusterColor = new Map<string, string>();
    Object.entries(clusterData).forEach(([clusterTitle, nodeIds]) => {
      const clusterColor = clusterColorMap[clusterTitle];
      nodeIds.forEach(nodeId => {
        nodeToClusterColor.set(nodeId, clusterColor);
      });
    });

    // Update nodes with cluster colors (only for non-root, non-subtopic nodes)
    setNodes(currentNodes => {
      return currentNodes.map(node => {
        // Skip root nodes, subtopic nodes, and loading nodes
        if (node.data?.isRoot || node.data?.isSubtopic || node.data?.isLoading) {
          return node;
        }

        // Apply cluster color if this node is in a cluster
        const clusterColor = nodeToClusterColor.get(node.id);
        if (clusterColor) {
          return {
            ...node,
            data: {
              ...node.data,
              color: clusterColor,
            },
          };
        }

        // If node is not in any cluster, keep existing color (or no color)
        return node;
      });
    });

  }, [clusterData, setNodes]);

  // Show legend when cluster data first appears (only once per session)
  useEffect(() => {
    if (clusterData && Object.keys(clusterData).length > 0) {
      if (!hasShownLegendRef.current) {
        setIsLegendVisible(true);
        hasShownLegendRef.current = true;
      }
    } else {
      // Reset when clusters are cleared (e.g., new session)
      hasShownLegendRef.current = false;
      setIsLegendVisible(false);
    }
  }, [clusterData]);

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
      const layoutedNodes = layoutNodes(nodes, edges);

      // Check if positions actually changed to avoid infinite loop
      const positionsChanged = layoutedNodes.some((ln, i) => {
        const original = nodes[i];
        if (!original) return true;
        return Math.abs(ln.position.x - original.position.x) > 1 ||
                        Math.abs(ln.position.y - original.position.y) > 1;
      });

      if (positionsChanged) {
        setNodes(layoutedNodes);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.map(n => `${n.id}:${n.width}:${n.height}:${n.data?.isLoading}`).join(','), edges.map(e => `${e.id}:${e.source}:${e.target}`).join(',')]);

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
          className="absolute top-20 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg text-white hover:bg-black/50 transition-colors"
          title="View conversation path"
        >
          <FileText className="w-4 h-4" />
        </button>

        {/* Cluster Legend */}
        {isLegendVisible && (
          <ClusterLegend
            clusterData={clusterData}
            onClose={() => setIsLegendVisible(false)}
          />
        )}

        {/* Show legend button when hidden */}
        {!isLegendVisible && clusterData && Object.keys(clusterData).length > 0 && (
          <button
            onClick={() => setIsLegendVisible(true)}
            className="absolute bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm border border-white/20 rounded-lg text-white hover:bg-black/70 transition-colors text-sm"
            title="Show cluster legend"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Clusters
          </button>
        )}

        <div style={{ width: '100%', height: '100%' }}>
          <CanvasContext.Provider value={contextValue}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c) => setEdges((es) => addEdge({ ...c, type: 'custom' }, es))}
        fitView
              fitViewOptions={{ padding: 2.25 }}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={false}
        zoomOnPinch={true}
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={1}
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
          </CanvasContext.Provider>
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel
        isOpen={isChatPanelOpen}
        onClose={() => setIsChatPanelOpen(false)}
        lineage={buildLineage(selectedNodeId)}
      />

      {/* Floating Chat Button */}
      <FloatingChat onQuerySubmit={handleFloatingChatQuery} />
    </div>
  );
}

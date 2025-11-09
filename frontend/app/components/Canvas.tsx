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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useCallback, useEffect, useMemo } from 'react';
import { CardNode, CardNodeData } from './CardNode';
import { CustomEdge } from './CustomEdge';
import { layoutNodes } from '../utils/layout';
import { generateContent, NodeContext } from '../utils/api';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialNodes';

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);

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

  const handleAddNote = useCallback(async (sourceId: string, query: string) => {
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
      },
      position: { x: 0, y: 0 },
    };

    const newEdge: Edge = {
      id: edgeId,
      source: sourceId,
      target: nodeId,
      type: 'custom',
      label: query,
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
      const content = await generateContent(query, path, context);

      // Update node with generated content
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...content,
                  isLoading: false,
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

  const nodeTypes = useMemo(
    () => ({
      card: (props: any) => <CardNode {...props} onAddNote={handleAddNote} />,
    }),
    [handleAddNote]
  );

  const edgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    []
  );

  // Initialize nodes (let ReactFlow measure them first)
  useEffect(() => {
    setNodes(INITIAL_NODES);
  }, [setNodes]);

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
    <div style={{ height: '100vh', width: '100vw', background: '#0a0a0a' }}>
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
        defaultEdgeOptions={{
          type: 'custom',
          style: { stroke: '#9CA3AF', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#2a2a2a" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.6)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

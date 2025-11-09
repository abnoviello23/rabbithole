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
import { layoutNodes } from '../utils/layout';
import { generateContent } from '../utils/api';
import { INITIAL_NODES, INITIAL_EDGES } from '../data/initialNodes';

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);

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
      label: query,
      labelStyle: { fill: '#ffffff', fontWeight: 500, fontSize: 18 },
      labelBgStyle: { fill: '#0a0a0a', fillOpacity: 1.0 },
      labelBgPadding: [8, 4] as [number, number],
    };

    // Add edge and loading node with immediate layout
    setEdges((currentEdges) => {
      const updatedEdges = [...currentEdges, newEdge];
      setNodes((ns) => layoutNodes([...ns, loadingNode], updatedEdges));
      return updatedEdges;
    });

    // Generate content
    try {
      const content = await generateContent(query);

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
  }, [setNodes, setEdges]);

  const nodeTypes = useMemo(
    () => ({
      card: (props: any) => <CardNode {...props} onAddNote={handleAddNote} />,
    }),
    [handleAddNote]
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
        onConnect={(c) => setEdges((es) => addEdge({ ...c, type: 'smoothstep' }, es))}
        fitView
        fitViewOptions={{ padding: 1.5 }}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        elementsSelectable={true}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#9CA3AF', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
        }}
        nodeTypes={nodeTypes}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#2a2a2a" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.6)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

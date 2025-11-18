'use client';

import ReactFlow, {
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  PanOnScrollMode,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useEffect, useState } from 'react';
import { CardNode, CardNodeData, assignClusterColors } from './CardNode';
import { CustomEdge } from './CustomEdge';
import { ClusterLegend } from './ClusterLegend';
import { layoutNodes } from '../utils/layout';
import { getSharedSession, MinimalNode, MinimalEdge } from '../utils/api';
import { Eye } from 'lucide-react';

// Helper function to convert minimal nodes/edges to React Flow format
function minimalToNodes(minimalNodes: MinimalNode[]): Node<CardNodeData>[] {
  return minimalNodes.map(node => ({
    id: node.id,
    type: 'card',
    position: { x: 0, y: 0 }, // Will be calculated by layout
    data: {
      title: node.data.title,
      body: node.data.body,
      image: node.data.image,
      isRoot: node.data.title === 'Root' || node.data.isRoot || false,
      statusUpdates: node.data.statusUpdates,
      sources: node.data.sources,
      sourcesCount: node.data.sourcesCount,
    },
    width: undefined, // Will be measured
    height: undefined,
  }));
}

function minimalToEdges(minimalEdges: MinimalEdge[]): Edge[] {
  return minimalEdges.map((edge, index) => {
    const edgeColor = edge.data?.color || '#9CA3AF';
    return {
      id: `${edge.source}-${edge.target}-${index}`, // Generate ID from source and target
      source: edge.source,
      target: edge.target,
      type: 'custom',
      label: edge.label, // Include the question label so viewers can see what was asked
      style: { 
        stroke: edgeColor, 
        strokeWidth: 2,
        opacity: 0.8, // Make edges more visible
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      data: edge.data, // Include edge data (color, userQuery, etc.)
    };
  });
}

interface SharedCanvasProps {
  shareToken: string;
}

// Define node and edge types OUTSIDE the component
const nodeTypes = {
  card: CardNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function SharedCanvasInner({ shareToken }: SharedCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string>('');
  const [clusterData, setClusterData] = useState<any>(null);
  const [isLegendVisible, setIsLegendVisible] = useState(true);

  // Load shared session
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    getSharedSession(shareToken)
      .then((data) => {
        setSessionName(data.session.name);
        
        // Convert minimal format to React Flow format
        const rfNodes = minimalToNodes(data.graph_state.nodes || []);
        const rfEdges = minimalToEdges(data.graph_state.edges || []);
        
        // Apply layout
        const layoutedNodes = layoutNodes(rfNodes, rfEdges);
        
        setNodes(layoutedNodes);
        setEdges(rfEdges);
      })
      .catch((err) => {
        console.error('Failed to load shared session:', err);
        setError(err instanceof Error ? err.message : 'Failed to load shared session');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [shareToken, setNodes, setEdges]);

  // Apply cluster colors if cluster data exists
  useEffect(() => {
    if (!clusterData || Object.keys(clusterData).length === 0) {
      return;
    }

    const clusterEntries = Object.entries(clusterData).filter(
      ([key]) => key !== 'cost_info' && key !== 'error'
    );

    if (clusterEntries.length === 0) {
      return;
    }

    const clusterTitles = clusterEntries.map(([title]) => title);
    const clusterColorMap = assignClusterColors(clusterTitles);

    const nodeToClusterColor = new Map<string, string>();
    clusterEntries.forEach(([clusterTitle, nodeIds]) => {
      const clusterColor = clusterColorMap[clusterTitle];
      if (Array.isArray(nodeIds)) {
        nodeIds.forEach((nodeId: string) => {
          nodeToClusterColor.set(nodeId, clusterColor);
        });
      }
    });

    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        if (node.data?.isRoot || node.data?.isSubtopic) {
          return node;
        }

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

        return node;
      });
    });
  }, [clusterData, setNodes]);

  // Re-layout when nodes are measured (with guard to prevent infinite loops)
  useEffect(() => {
    const allMeasured = nodes.every((n) => n.width && n.height);
    if (!allMeasured || nodes.length === 0) return;

    // Check if nodes already have valid positions (not all at 0,0)
    const hasValidPositions = nodes.some((n) => n.position.x !== 0 || n.position.y !== 0);
    if (hasValidPositions) {
      // Only re-layout if positions seem invalid
      const needsLayout = nodes.every((n) => n.position.x === 0 && n.position.y === 0);
      if (!needsLayout) return;
    }

    const layoutedNodes = layoutNodes(nodes, edges);
    
    // Only update if positions actually changed significantly
    const positionsChanged = layoutedNodes.some((ln, i) => {
      const original = nodes[i];
      if (!original) return true;
      const dx = Math.abs(ln.position.x - original.position.x);
      const dy = Math.abs(ln.position.y - original.position.y);
      return dx > 5 || dy > 5; // Use larger threshold to prevent small changes
    });

    if (positionsChanged) {
      setNodes(layoutedNodes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.map(n => `${n.id}:${n.width}:${n.height}`).join(','), edges.map(e => `${e.id}:${e.source}:${e.target}`).join(',')]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg">Loading shared session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center max-w-md">
          <p className="text-xl font-semibold mb-2">Error Loading Session</p>
          <p className="text-neutral-400">{error}</p>
          <p className="text-sm text-neutral-500 mt-4">
            The shared session may not exist or the link may be invalid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#0a0a0a' }}>
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
        <div className="px-4 py-2 backdrop-blur-sm border rounded-lg bg-neutral-800/80 border-white/20 text-white">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">Read Only</span>
          </div>
        </div>
        <div className="px-4 py-2 backdrop-blur-sm border rounded-lg bg-neutral-800/80 border-white/20 text-white">
          <span className="text-sm font-medium">{sessionName}</span>
        </div>
      </div>

      {/* Cluster Legend */}
      {isLegendVisible && clusterData && (
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

      {/* Canvas */}
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
            style: { stroke: '#9CA3AF', strokeWidth: 2, opacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
          }}
          edgesUpdatable={false}
          edgesFocusable={true}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
        >
          <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#2a2a2a" />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function SharedCanvas({ shareToken }: SharedCanvasProps) {
  return (
    <ReactFlowProvider>
      <SharedCanvasInner shareToken={shareToken} />
    </ReactFlowProvider>
  );
}


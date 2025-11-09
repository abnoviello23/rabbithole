import dagre from '@dagrejs/dagre';
import { Node, Edge, Position } from 'reactflow';

/**
 * Layouts nodes using dagre, but excludes subtopic nodes from the main tree layout
 * Subtopic nodes should be positioned separately using radial layout
 */
export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 580 });
  graph.setDefaultEdgeLabel(() => ({}));

  // Separate regular nodes from subtopic nodes
  const regularNodes = nodes.filter(n => !n.data?.isSubtopic);
  const subtopicNodes = nodes.filter(n => n.data?.isSubtopic);

  // Only layout regular nodes with dagre
  regularNodes.forEach((n) => {
    const width = n.width ?? 400;
    const height = n.height ?? 340;
    graph.setNode(n.id, { width, height });
  });

  // Only add edges between regular nodes
  edges.forEach((e) => {
    const sourceIsRegular = regularNodes.some(n => n.id === e.source);
    const targetIsRegular = regularNodes.some(n => n.id === e.target);
    
    if (sourceIsRegular && targetIsRegular) {
      // Calculate label dimensions if label exists
      if (e.label && typeof e.label === 'string') {
        const maxWidth = 300;
        const charWidth = 8;
        const padding = 24;

        const textWidth = e.label.length * charWidth;
        const lines = Math.ceil(textWidth / maxWidth);

        const labelWidth = Math.min(textWidth + padding, maxWidth);
        const labelHeight = lines * 24 + 20;

        graph.setEdge(e.source, e.target, {
          width: labelWidth,
          height: labelHeight,
          labelpos: 'c'
        });
      } else {
        graph.setEdge(e.source, e.target);
      }
    }
  });

  dagre.layout(graph);

  // Apply dagre positions to regular nodes
  const layoutedRegularNodes = regularNodes.map((n) => {
    const nodeWithPosition = graph.node(n.id);
    const width = n.width ?? 400;
    const height = n.height ?? 340;

    return {
      ...n,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  // Keep subtopic nodes at their current positions (will be positioned by radial layout)
  return [...layoutedRegularNodes, ...subtopicNodes];
}

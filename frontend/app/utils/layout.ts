import dagre from '@dagrejs/dagre';
import { Node, Edge, Position } from 'reactflow';

export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 580 });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => {
    const width = n.width ?? 400;
    const height = n.height ?? 340;
    graph.setNode(n.id, { width, height });
  });

  edges.forEach((e) => {
    // Calculate label dimensions if label exists
    if (e.label && typeof e.label === 'string') {
      const maxWidth = 300;
      const charWidth = 8; // Approximate character width for 16px/base font
      const padding = 24; // Horizontal padding

      // Calculate how many lines the text will wrap to
      const textWidth = e.label.length * charWidth;
      const lines = Math.ceil(textWidth / maxWidth);

      // Width is capped at maxWidth
      const labelWidth = Math.min(textWidth + padding, maxWidth);
      // Height increases with number of lines (24px per line + padding)
      const labelHeight = lines * 24 + 20;

      graph.setEdge(e.source, e.target, {
        width: labelWidth,
        height: labelHeight,
        labelpos: 'c'
      });
    } else {
      graph.setEdge(e.source, e.target);
    }
  });

  dagre.layout(graph);

  return nodes.map((n) => {
    const nodeWithPosition = graph.node(n.id);
    const width = n.width ?? 400;
    const height = n.height ?? 340;

    // Dagre gives center position, ReactFlow expects top-left
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
}

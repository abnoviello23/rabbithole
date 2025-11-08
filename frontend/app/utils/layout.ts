import dagre from '@dagrejs/dagre';
import { Node, Edge, Position } from 'reactflow';

export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', ranksep: 180, nodesep: 90 });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => {
    const width = n.width ?? 400;
    const height = n.height ?? 340;
    graph.setNode(n.id, { width, height });
  });
  edges.forEach((e) => graph.setEdge(e.source, e.target));

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
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

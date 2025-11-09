import dagre from '@dagrejs/dagre';
import { Node, Edge, Position } from 'reactflow';

/**
 * Layouts nodes using dagre, but excludes subtopic nodes from the main tree layout
 * Subtopic nodes should be positioned separately using radial layout
 */
export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 180 });
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

  // Compact vertical spacing to eliminate excessive gaps
  const compactedNodes = compactVerticalSpacing(layoutedRegularNodes, edges);

  // Keep subtopic nodes at their current positions (will be positioned by radial layout)
  return [...compactedNodes, ...subtopicNodes];
}

/**
 * Compacts vertical spacing by positioning each child at parent.y + parent.height + 80px
 * Traverses the tree structure depth-first
 */
function compactVerticalSpacing(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const VERTICAL_GAP = 240; // Gap between parent bottom and child top

  // Build parent-child map from edges (only for regular nodes)
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    const isSourceRegular = nodes.some(n => n.id === edge.source);
    const isTargetRegular = nodes.some(n => n.id === edge.target);

    if (isSourceRegular && isTargetRegular) {
      if (!childrenMap.has(edge.source)) {
        childrenMap.set(edge.source, []);
      }
      childrenMap.get(edge.source)!.push(edge.target);
    }
  });

  // Find root nodes (nodes with no incoming edges)
  const allChildren = new Set(edges.filter(e => nodes.some(n => n.id === e.target)).map(e => e.target));
  const rootNodes = nodes.filter(n => !allChildren.has(n.id));

  // Create a map of new positions
  const newPositions = new Map<string, number>();

  // DFS to position nodes based on parent position
  function positionNode(nodeId: string, parentY: number | null) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Position this node
    if (parentY !== null) {
      newPositions.set(nodeId, parentY + VERTICAL_GAP);
    } else {
      // Root node - keep original y position
      newPositions.set(nodeId, node.position.y);
    }

    // Position children
    const children = childrenMap.get(nodeId) || [];
    const currentNodeHeight = node.height ?? 340;
    const currentNodeY = newPositions.get(nodeId)!;

    children.forEach(childId => {
      positionNode(childId, currentNodeY + currentNodeHeight);
    });
  }

  // Start positioning from root nodes
  rootNodes.forEach(rootNode => {
    positionNode(rootNode.id, null);
  });

  // Apply new positions
  return nodes.map(node => {
    const newY = newPositions.get(node.id);
    if (newY !== undefined && newY !== node.position.y) {
      return {
        ...node,
        position: {
          ...node.position,
          y: newY
        }
      };
    }
    return node;
  });
}

// Default export to satisfy Next.js type checking
// (Next.js expects layout.ts files to have a default export)
export default function Layout() {
  return null;
}

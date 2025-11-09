/**
 * Radial layout for positioning subtopic nodes around parent nodes
 * Positions subtopics in bottom 90 degrees (45° to 135°) in a tight semicircle
 * Parent node position is NOT changed - subtopics are positioned around it
 * 
 * Features:
 * - Tight spacing: subtopics positioned just below parent edge
 * - Dynamic radius: adapts to parent size and subtopic heights
 * - Simple calculation for minimal distance while preventing overlap
 */

import { Node, Edge, Position } from 'reactflow';
import { getDefaultSubtopicDimensions } from './subtopic-sizing';

const RADIAL_CONFIG = {
  GAP_FROM_PARENT: 200, // Gap between parent edge and subtopics (small for tight spacing)
  START_ANGLE: (45 * Math.PI) / 180, // 45 degrees (bottom-right diagonal)
  ANGLE_RANGE: Math.PI / 2, // 90 degrees - bottom quarter circle (45° to 135°)
} as const;

interface NodeDimensions {
  width: number;
  height: number;
}

function getNodeDimensions(node: Node): NodeDimensions {
  // Use node's dimensions if available (set during creation), otherwise fall back to defaults
  if (node.data?.isSubtopic) {
    const defaults = getDefaultSubtopicDimensions();
    const width = node.width ?? defaults.width;
    const height = node.height ?? defaults.height;
    return { width, height };
  }
  
  // Regular node dimensions
  const width = node.width ?? 400;
  const height = node.height ?? 340;
  return { width, height };
}

/**
 * Group subtopics by category for better visual organization
 */
function groupByCategory(subtopics: Node[]): Map<string, Node[]> {
  const groups = new Map<string, Node[]>();
  
  subtopics.forEach(node => {
    const category = node.data?.category || 'Other';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(node);
  });
  
  return groups;
}

/**
 * Applies radial layout to position subtopic nodes around their parent node
 * The parent node stays in its current position (set by dagre layout)
 * @param nodes - All nodes including parent and subtopics
 * @param edges - All edges
 * @param parentNodeId - ID of the parent node that subtopics should circle around
 * @returns Nodes with updated positions for subtopics only
 */
export async function applyRadialLayout(
  nodes: Node[],
  edges: Edge[],
  parentNodeId: string
): Promise<Node[]> {
  const parentNode = nodes.find((n) => n.id === parentNodeId);
  if (!parentNode || !parentNode.position) return nodes;

  const layoutedNodes = nodes.map((n) => ({ ...n }));
  
  // Get parent position (already positioned by dagre)
  const parentPos = parentNode.position;
  const parentDim = getNodeDimensions(parentNode);
  const parentCenterX = parentPos.x + parentDim.width / 2;
  const parentCenterY = parentPos.y + parentDim.height / 2;

  // Get subtopic nodes connected to this parent
  const subtopicNodes = nodes.filter((node) => {
    const edge = edges.find((e) => e.source === parentNodeId && e.target === node.id);
    return edge !== undefined && node.data?.isSubtopic;
  });

  if (subtopicNodes.length === 0) {
    return layoutedNodes;
  }

  // Group by category for better visual organization
  const categoryGroups = groupByCategory(subtopicNodes);
  const totalSubtopics = subtopicNodes.length;
  
  // Calculate dynamic radius - simple approach for tight spacing
  // Distance from parent CENTER to subtopic position
  // = distance to parent bottom edge + gap + half of average subtopic height
  
  const avgSubtopicHeight = subtopicNodes.reduce((sum, node) => {
    const dim = getNodeDimensions(node);
    return sum + dim.height;
  }, 0) / subtopicNodes.length;
  
  // Parent bottom edge is at parentHeight/2 from center
  // Add small gap and position subtopic center
  const dynamicRadius = parentDim.height / 2 + RADIAL_CONFIG.GAP_FROM_PARENT + avgSubtopicHeight / 2;
  
  // Debug logging (uncomment to troubleshoot spacing issues)
  // console.log('Dynamic radius calculation:', {
  //   parentHeight: parentDim.height,
  //   avgSubtopicHeight,
  //   gap: RADIAL_CONFIG.GAP_FROM_PARENT,
  //   finalRadius: dynamicRadius,
  //   subtopicCount: totalSubtopics
  // });
  
  // Calculate angular spacing - distribute evenly across 90 degree arc
  const angleStep = RADIAL_CONFIG.ANGLE_RANGE / (totalSubtopics > 1 ? totalSubtopics - 1 : 1);
  const startAngle = RADIAL_CONFIG.START_ANGLE;

  let currentIndex = 0;
  
  // Position each category group
  categoryGroups.forEach((groupNodes) => {
    groupNodes.forEach((node) => {
      const angle = startAngle + currentIndex * angleStep;
      const { width, height } = getNodeDimensions(node);
      
      // Calculate position around parent (bottom arc, 45° to 135°)
      const x = parentCenterX + Math.cos(angle) * dynamicRadius - width / 2;
      const y = parentCenterY + Math.sin(angle) * dynamicRadius - height / 2;

      const nodeIdx = layoutedNodes.findIndex((n) => n.id === node.id);
      if (nodeIdx !== -1) {
        layoutedNodes[nodeIdx] = {
          ...layoutedNodes[nodeIdx],
          position: { x, y },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        };
      }
      
      currentIndex++;
    });
  });

  return layoutedNodes;
}

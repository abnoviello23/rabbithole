import { Node, Edge } from 'reactflow';
import { CardNodeData } from '../components/CardNode';

interface PathNode {
  nodeId: string;
  title: string;
  body: string;
  userQuery?: string;
  selectedContext?: string;
}

interface Path {
  pathId: string;
  nodes: PathNode[];
  depth: number;
  firstQuestion?: string; // First question asked in this path (after root)
  pathName?: string; // Descriptive name for the path
}

/**
 * Build path from a target node to root
 */
function buildPathToRoot(targetNodeId: string, edges: Edge[]): string[] {
  const path: string[] = [];
  let currentId = targetNodeId;

  while (currentId) {
    path.unshift(currentId);
    const parentEdge = edges.find((e) => e.target === currentId);
    if (!parentEdge) break;
    currentId = parentEdge.source;
  }

  return path;
}

/**
 * Extract all unique paths from root to leaf nodes
 */
export function extractAllPaths(
  nodes: Node<CardNodeData>[],
  edges: Edge[]
): Path[] {
  // Find all leaf nodes (nodes with no outgoing edges)
  const leafNodes = nodes.filter(
    (node) => !node.data.isRoot && !edges.some((edge) => edge.source === node.id)
  );

  // If no leaf nodes, check if there's just a root node
  if (leafNodes.length === 0) {
    const rootNode = nodes.find((node) => node.data.isRoot);
    if (rootNode) {
      return [
        {
          pathId: rootNode.id,
          nodes: [
            {
              nodeId: rootNode.id,
              title: rootNode.data.title || 'Root',
              body: rootNode.data.body || '',
            },
          ],
          depth: 1,
        },
      ];
    }
    return [];
  }

  // Build paths from each leaf to root
  const paths: Path[] = leafNodes.map((leaf, index) => {
    const pathIds = buildPathToRoot(leaf.id, edges);
    const pathNodes: PathNode[] = [];

    pathIds.forEach((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || !node.data) return;

      // Get the query from the incoming edge (skip for root)
      let userQuery: string | undefined;
      let selectedContext: string | undefined;

      if (!node.data.isRoot) {
        const incomingEdge = edges.find((e) => e.target === nodeId);
        if (incomingEdge) {
          const edgeData = incomingEdge.data as any;
          userQuery = edgeData?.userQuery || (incomingEdge.label as string);
          selectedContext = edgeData?.selectedContext;
        }
      }

      pathNodes.push({
        nodeId: node.id,
        title: node.data.title || '',
        body: node.data.body || '',
        userQuery,
        selectedContext,
      });
    });

    // Find first question (first node after root that has a query)
    const firstQuestion = pathNodes.find(n => n.userQuery)?.userQuery;
    
    // Generate path name from first question or first node title
    let pathName = 'Root';
    if (firstQuestion) {
      // Use first question, truncated if too long
      pathName = firstQuestion.length > 60 
        ? firstQuestion.substring(0, 57) + '...' 
        : firstQuestion;
    } else if (pathNodes.length > 1) {
      // Use first non-root node title
      pathName = pathNodes[1]?.title || 'Exploration';
    }

    return {
      pathId: `path-${index}`,
      nodes: pathNodes,
      depth: pathNodes.length,
      firstQuestion,
      pathName,
    };
  });

  // Remove duplicate paths (paths with same sequence of node IDs)
  const uniquePaths = paths.filter((path, index, self) => {
    const pathKey = path.nodes.map((n) => n.nodeId).join('->');
    return (
      index ===
      self.findIndex(
        (p) => p.nodes.map((n) => n.nodeId).join('->') === pathKey
      )
    );
  });

  return uniquePaths;
}

/**
 * Get the root node that all paths share (if any)
 */
function getSharedRoot(paths: Path[]): PathNode | null {
  if (paths.length === 0) return null;
  
  const firstPathRoot = paths[0]?.nodes[0];
  if (!firstPathRoot) return null;
  
  // Check if all paths share the same root
  const allShareRoot = paths.every(p => 
    p.nodes[0]?.nodeId === firstPathRoot.nodeId
  );
  
  return allShareRoot ? firstPathRoot : null;
}

/**
 * Format paths as markdown text for export
 */
export function formatPathsAsText(
  paths: Path[],
  sessionName: string
): string {
  if (paths.length === 0) {
    return `# Session: ${sessionName}\n\nNo exploration data available.`;
  }

  let output = `# Session: ${sessionName}\n\n`;
  output += `**Total Exploration Paths:** ${paths.length}\n`;
  output += `**Total Nodes:** ${paths.reduce((sum, p) => sum + p.nodes.length, 0)}\n\n`;
  output += `---\n\n`;

  // Get shared root (if all paths share the same root)
  const sharedRoot = getSharedRoot(paths);
  
  // Show root once if all paths share it
  if (sharedRoot && paths.length > 1) {
    output += `## ${sharedRoot.title || 'Starting Point'}\n\n`;
    if (sharedRoot.body) {
      output += `${sharedRoot.body}\n\n`;
    }
    output += `\n`;
  }

  // Show each path with descriptive name
  paths.forEach((path, index) => {
    // Use descriptive name based on first question or path content
    const pathName = path.pathName || `Exploration ${index + 1}`;
    
    // Show path header
    if (paths.length > 1 || path.nodes.length > 1) {
      output += `## ${pathName}\n\n`;
    }

    // Determine start index (skip root if already shown above)
    const startIndex = (sharedRoot && path.nodes[0]?.nodeId === sharedRoot.nodeId && paths.length > 1) ? 1 : 0;
    
    // Show root if it's the only path or not shared
    if (startIndex === 0 && path.nodes[0] && !path.nodes[0].userQuery) {
      output += `### ${path.nodes[0].title || 'Starting Point'}\n\n`;
      if (path.nodes[0].body) {
        output += `${path.nodes[0].body}\n\n`;
      }
    }

    // Show nodes in this path
    path.nodes.slice(startIndex).forEach((node) => {
      if (node.userQuery) {
        // Regular node with query
        if (node.selectedContext) {
          output += `**Context:** "${node.selectedContext}"\n\n`;
        }
        output += `**Q:** ${node.userQuery}\n\n`;
        output += `**A:** ${node.title}\n\n`;
        if (node.body) {
          output += `${node.body}\n\n`;
        }
      } else if (!node.userQuery && node.title && startIndex > 0) {
        // Node without query (shouldn't happen after root, but handle gracefully)
        output += `### ${node.title}\n\n`;
        if (node.body) {
          output += `${node.body}\n\n`;
        }
      }
    });

    if (index < paths.length - 1) {
      output += `\n---\n\n`;
    }
  });

  return output.trim();
}

/**
 * Export session summary to clipboard
 */
export async function exportSessionToClipboard(
  nodes: Node<CardNodeData>[],
  edges: Edge[],
  sessionName: string
): Promise<void> {
  const paths = extractAllPaths(nodes, edges);
  const text = formatPathsAsText(paths, sessionName);

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (fallbackErr) {
      console.error('Failed to copy to clipboard:', fallbackErr);
      throw fallbackErr;
    }
    document.body.removeChild(textArea);
  }
}


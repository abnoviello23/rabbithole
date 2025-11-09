"""
Custom MCP tools for the RabbitHole canvas
Provides tools for the agent to create nodes dynamically
"""
import logging
from typing import Callable, Awaitable, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Global callback storage - will be set by the WebSocket handler
_websocket_callback: Callable[[Dict[str, Any]], Awaitable[None]] | None = None


class TreeTracker:
    """Tracks the hierarchical tree structure of created nodes"""

    def __init__(self, root_id: str, root_title: str = "Root"):
        self.nodes = {}
        self.root_id = root_id
        # Initialize root node
        self.nodes[root_id] = {
            "id": root_id,
            "title": root_title,
            "children": []
        }

    def add_node(self, node_id: str, parent_id: str, title: str) -> dict:
        """
        Add a node to the tree and return the full hierarchy

        Args:
            node_id: ID of the new node
            parent_id: ID of the parent node
            title: Title of the new node

        Returns:
            Full nested hierarchy from root
        """
        # Create new node entry
        new_node = {
            "id": node_id,
            "title": title,
            "children": []
        }
        self.nodes[node_id] = new_node

        # Add to parent's children if parent exists
        if parent_id in self.nodes:
            # Store reference to the actual node object so children updates propagate
            self.nodes[parent_id]["children"].append(new_node)
        else:
            logger.warning(f"⚠️ Parent node {parent_id} not found in tree tracker")

        # Return the full hierarchy
        return self.get_hierarchy()

    def get_hierarchy(self) -> dict:
        """Get the full nested hierarchy starting from root"""
        return self._build_hierarchy(self.root_id)

    def _build_hierarchy(self, node_id: str) -> dict:
        """Recursively build hierarchy for a node"""
        if node_id not in self.nodes:
            return {"id": node_id, "title": "Unknown", "children": []}

        node = self.nodes[node_id]
        # Children are already nested node objects, just return the structure
        return {
            "id": node["id"],
            "title": node["title"],
            "children": node["children"]  # Already contains nested structure
        }


# Global tree tracker - will be initialized per research session
_tree_tracker: Optional[TreeTracker] = None


def init_tree_tracker(root_id: str, root_title: str = "Root") -> None:
    """Initialize a new tree tracker for a research session"""
    global _tree_tracker
    _tree_tracker = TreeTracker(root_id, root_title)
    logger.info(f"✅ Tree tracker initialized with root: {root_id}")


def set_websocket_callback(callback: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
    """Set the WebSocket callback for sending events to frontend"""
    global _websocket_callback
    _websocket_callback = callback
    logger.info("✅ WebSocket callback registered for canvas tools")


async def create_node_tool(
    source_node_id: str,
    title: str,
    body: str,
    user_query: str = "",
    callback: Callable[[Dict[str, Any]], Awaitable[None]] = None
) -> str:
    """
    Create a new node on the canvas as a child of the source node.

    Use this tool when you want to:
    - Split information into multiple separate nodes (e.g., one node per company, person, or topic)
    - Create detailed child nodes for deeper exploration
    - Organize research findings into a structured tree

    Args:
        source_node_id: ID of the parent node where this node should be attached
        title: Short, descriptive title for the node (2-10 words)
        body: Detailed content for the node (2-4 sentences, max 80 words)
        user_query: Optional query/question that led to this node
        callback: WebSocket callback function (if not provided, uses global)

    Returns:
        JSON with success status, node_id, and full tree hierarchy
    """
    global _tree_tracker

    # Use provided callback or fall back to global
    ws_callback = callback or _websocket_callback

    if not ws_callback:
        logger.error("❌ WebSocket callback not set - cannot create node")
        return "Error: WebSocket callback not available"

    # Generate unique node ID
    import time
    node_id = f"node-{int(time.time() * 1000)}"

    logger.info(f"🎨 Creating node: {title} (parent: {source_node_id})")

    try:
        # Send node creation event to frontend via WebSocket
        await ws_callback({
            "type": "node_created",
            "node_id": node_id,
            "source_id": source_node_id,
            "title": title,
            "body": body,
            "user_query": user_query or title,
        })

        logger.info(f"✅ Node created successfully: {node_id}")

        # Update tree tracker and get hierarchy
        hierarchy = None
        if _tree_tracker:
            hierarchy = _tree_tracker.add_node(node_id, source_node_id, title)
            logger.info(f"🌳 Tree updated. Total nodes: {len(_tree_tracker.nodes)}")
        else:
            logger.warning("⚠️ Tree tracker not initialized - hierarchy will not be available")

        # Return JSON with node_id AND hierarchy
        import json
        return json.dumps({
            "success": True,
            "node_id": node_id,
            "message": f"Created node '{title}'. Use this node_id as source_node_id to create children under this node.",
            "hierarchy": hierarchy
        })

    except Exception as e:
        logger.error(f"❌ Failed to create node: {e}")
        import json
        return json.dumps({
            "success": False,
            "error": str(e),
            "message": "Failed to create node"
        })


# MCP server definition that will be imported by agent.py
def get_canvas_tools_server():
    """
    Returns the MCP server configuration for canvas tools.
    This is a custom in-process MCP server.
    """
    return {
        "name": "canvas-tools",
        "type": "custom",
        "tools": [
            {
                "name": "create_node",
                "description": "Create a new node on the canvas as a child of a source node. Use this tool to split information into multiple separate nodes (e.g., research on 5 companies = create 5 nodes), create detailed child nodes for deeper exploration, or organize findings into a structured tree. The node will appear immediately on the canvas. IMPORTANT: This tool is for creating SEPARATE nodes to BUILD A TREE of related information. Example: User asks 'analyze Apple, Google, Microsoft' - create 3 separate nodes, one for each company.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "source_node_id": {
                            "type": "string",
                            "description": "ID of the parent node where this node should be attached"
                        },
                        "title": {
                            "type": "string",
                            "description": "Short, descriptive title for the node (2-10 words)"
                        },
                        "body": {
                            "type": "string",
                            "description": "Detailed content for the node (2-4 sentences, max 80 words)"
                        },
                        "user_query": {
                            "type": "string",
                            "description": "Optional query/question that led to this node (defaults to title if not provided)"
                        }
                    },
                    "required": ["source_node_id", "title", "body"]
                },
                "function": create_node_tool
            }
        ]
    }

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from auth import get_current_user

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env from the backend directory (where this file is located)
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# ============================================================================
# SUPABASE CONNECTION SETUP
# ============================================================================
from supabase import create_client, Client
from contextlib import asynccontextmanager

# Supabase client (initialized on startup)
supabase: Client = None

def get_supabase() -> Client | None:
    """Get Supabase client"""
    return supabase

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup
    global supabase
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")

    if supabase_url and supabase_key:
        try:
            supabase = create_client(supabase_url, supabase_key)
            logger.info("✅ Connected to Supabase")
        except Exception as e:
            logger.error(f"Failed to connect to Supabase: {e}")
    else:
        logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY not set - database features disabled")

    yield

    # Shutdown (Supabase client doesn't need explicit cleanup)
    logger.info("Shutdown complete")

app = FastAPI(title="RabbitHole Backend API", version="1.0.0", lifespan=lifespan)

# Configure CORS for authentication
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [FRONTEND_URL]

# Allow multiple origins if needed (e.g., dev and prod)
if os.getenv("ADDITIONAL_FRONTEND_URLS"):
    additional_urls = os.getenv("ADDITIONAL_FRONTEND_URLS", "").split(",")
    allowed_origins.extend([url.strip() for url in additional_urls if url.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ============================================================================
# COST TRACKING
# ============================================================================

# Pricing table for OpenAI models (per 1M tokens)
PRICING = {
    # Completion models
    "gpt-4o-search-preview-2025-03-11": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},

    # Embedding models
    "text-embedding-3-small": {"input": 0.02},
}

# Default maximum cost per user (in dollars)
DEFAULT_MAX_COST = 5.0


class Node(BaseModel):
    id: str
    title: str
    content: str
    query: str | None = None  # Optional query field for nodes


class GenerateRequest(BaseModel):
    user_query: str
    selected_context: str | None = None
    path: str
    context: dict[str, Node]
    session_id: str
    graph_state: GraphState | None = None  # Graph snapshot for DB
    source_type: str | None = None  # 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up'


class AutoModeRequest(BaseModel):
    query: str
    nodes: dict[str, Node]
    session_id: str
    graph_state: GraphState | None = None  # Graph snapshot for DB
    source_type: str | None = None


class ClusterRequest(BaseModel):
    context: dict[str, Node]
    session_id: str
    graph_state: GraphState | None = None  # Graph snapshot for DB


class Subtopic(BaseModel):
    title: str
    category: str


class CostInfo(BaseModel):
    used: float  # Current total cost for user
    max_total: float  # Maximum allowed cost for user


class GenerateResponse(BaseModel):
    title: str
    response: str
    suggested_questions: list[str]  # List of 2 suggested follow-up questions
    subtopics: list[Subtopic]  # List of 2-3 subtopics with categories
    cost_info: CostInfo


# ============================================================================
# MINIMAL SESSION STORAGE MODELS (excludes computed layout data)
# ============================================================================

class MinimalEdgeData(BaseModel):
    """Edge metadata - only essential data, not computed styles"""
    color: str | None = None
    userQuery: str | None = None
    selectedContext: str | None = None
    sourceType: str | None = None  # 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up'


class MinimalEdge(BaseModel):
    """Minimal edge representation - excludes computed styles and markerEnd"""
    source: str
    target: str
    label: str | None = None
    data: MinimalEdgeData | None = None


class CardNodeData(BaseModel):
    """Complete node data - excludes position and dimensions"""
    title: str
    body: str
    image: str | None = None
    isLoading: bool | None = None
    isRoot: bool | None = None
    isSubtopic: bool | None = None
    category: str | None = None
    color: str | None = None
    suggestedQuestions: list[str] | None = None
    subtopics: list[Subtopic] | None = None
    statusUpdates: list[str] | None = None
    sourcesCount: int | None = None
    sources: list[dict[str, str]] | None = None  # {url, title?}


class MinimalNode(BaseModel):
    """Minimal node representation - excludes position, width, height"""
    id: str
    data: CardNodeData


class GraphState(BaseModel):
    """Complete graph state for snapshot (minimal format)"""
    sessionId: str
    nodes: list[MinimalNode]
    edges: list[MinimalEdge]


# ============================================================================
# COST TRACKING HELPER FUNCTIONS
# ============================================================================

def calculate_cost(model: str, input_tokens: int, output_tokens: int = 0) -> float:
    """
    Calculate cost based on model and token usage.

    Args:
        model: The model name
        input_tokens: Number of input tokens used
        output_tokens: Number of output tokens used (0 for embedding models)

    Returns:
        Cost in dollars
    """
    if model not in PRICING:
        logger.warning(f"Unknown model '{model}' - cannot calculate cost")
        return 0.0

    pricing = PRICING[model]

    # Calculate cost (pricing is per 1M tokens, so divide by 1,000,000)
    cost = (input_tokens * pricing["input"]) / 1_000_000

    if "output" in pricing and output_tokens > 0:
        cost += (output_tokens * pricing["output"]) / 1_000_000

    return cost


def get_or_create_user_cost(user_id: str) -> dict:
    """
    Get user cost info from database, creating if it doesn't exist.

    Returns:
        {"current_cost": float, "max_cost": float}
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, returning default cost info")
        return {
            "current_cost": 0.0,
            "max_cost": DEFAULT_MAX_COST
        }

    try:
        # Try to get existing user cost
        response = sb.table('user_costs').select('current_cost', 'max_cost').eq('user_id', user_id).execute()

        if response.data and len(response.data) > 0:
            row = response.data[0]
            return {
                "current_cost": float(row["current_cost"]),
                "max_cost": float(row["max_cost"])
            }
        else:
            # Create new user cost record
            sb.table('user_costs').insert({
                "user_id": user_id,
                "current_cost": 0.0,
                "max_cost": DEFAULT_MAX_COST
            }).execute()

            return {
                "current_cost": 0.0,
                "max_cost": DEFAULT_MAX_COST
            }

    except Exception as e:
        logger.error(f"Failed to get user cost from DB: {e}")
        return {
            "current_cost": 0.0,
            "max_cost": DEFAULT_MAX_COST
        }


def track_cost(
    user_id: str,
    session_id: str,
    model: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    cost: float
) -> dict:
    """
    Log cost record to database and update user's total cost.

    Args:
        user_id: The user's unique ID
        session_id: The session ID
        model: Model name
        operation: API operation (generate, automode, cluster)
        input_tokens: Input tokens used
        output_tokens: Output tokens used
        cost: Cost in dollars

    Returns:
        Updated user cost info: {"current_cost": float, "max_cost": float}
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, cost not tracked")
        return {
            "current_cost": 0.0,
            "max_cost": DEFAULT_MAX_COST
        }

    try:
        # Insert cost log
        sb.table('cost_logs').insert({
            "user_id": user_id,
            "session_id": session_id,
            "model": model,
            "operation": operation,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cost
        }).execute()

        # Get current user cost
        user_cost_response = sb.table('user_costs').select('current_cost', 'max_cost').eq('user_id', user_id).execute()

        if user_cost_response.data and len(user_cost_response.data) > 0:
            current_data = user_cost_response.data[0]
            new_cost = float(current_data["current_cost"]) + cost

            # Update user cost
            sb.table('user_costs').update({
                "current_cost": new_cost,
                "updated_at": "now()"
            }).eq('user_id', user_id).execute()

            return {
                "current_cost": new_cost,
                "max_cost": float(current_data["max_cost"])
            }
        else:
            # Create new user cost record
            sb.table('user_costs').insert({
                "user_id": user_id,
                "current_cost": cost,
                "max_cost": DEFAULT_MAX_COST
            }).execute()

            return {
                "current_cost": cost,
                "max_cost": DEFAULT_MAX_COST
            }

    except Exception as e:
        logger.error(f"Failed to track cost in DB: {e}")
        return {
            "current_cost": 0.0,
            "max_cost": DEFAULT_MAX_COST
        }


# ============================================================================
# SESSION SNAPSHOT HELPER FUNCTION
# ============================================================================

def save_snapshot(
    user_id: str,
    session_id: str,
    operation: str,
    graph_state: GraphState,
    user_query: str | None = None,
    source_type: str | None = None
):
    """
    Save session snapshot to Supabase DB.

    Args:
        user_id: User's unique ID
        session_id: Session UUID
        operation: 'generate', 'automode', 'cluster'
        graph_state: Complete graph state (nodes + edges)
        user_query: Optional user query for this operation
        source_type: 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up', 'floating_chat'
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, snapshot not saved")
        return  # DB not available, skip silently

    try:
        # Insert snapshot using Supabase SDK
        sb.table('session_snapshots').insert({
            "user_id": user_id,
            "session_id": session_id,
            "operation": operation,
            "source_type": source_type,
            "user_query": user_query,
            "graph_state": graph_state.model_dump()  # Supabase SDK handles JSON serialization
        }).execute()

        logger.info(f"📸 Saved snapshot: {operation} | session={session_id[:8]}... | nodes={len(graph_state.nodes)} | source={source_type}")
    except Exception as e:
        logger.error(f"Failed to save snapshot: {e}")
        # Don't raise - snapshot failure shouldn't break the operation


@app.post("/generate")
async def generate_endpoint(
    request: GenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Use session ID from frontend request
        session_id = request.session_id
        user_id = current_user["sub"]  # Google user ID

        system_prompt = (
            """
You are an AI assistant designed for exploratory, mind-map-style conversations.

Your purpose is to help users dive deep into topics by producing compact, information-dense overviews that naturally open new rabbit holes. Each answer should feel like a "knowledge node" — self-contained yet full of threads to pull on.

**Output format**
- Start with a short, bolded title (≤10 words).
- Separate sections with new lines and markdown titles.
- Have ~3 short paragraphs or bullet clusters.

**Tone and style**
- Write with clarity, confidence, and intellectual curiosity.
- Be concise but not superficial — prefer compressed insight over summary.
- Encourage exploration by hinting at related subtopics, comparisons, open problems, or implications the user could ask about next.
- Blend factual density with conceptual connections — each paragraph should stand on its own yet lead to more.
- Avoid filler, repetition, or excessive simplification.
- If useful, include brief data points, examples, or analogies.

**Behavioral rules**
- Do not use a fixed word limit — adapt length to convey the essence vividly.
- Never show internal reasoning or chain of thought.
- Stay neutral, factual, and current (use web sources if needed).
- Each response should make the user curious to ask "why," "how," or "what next."

In short: every answer should read like a compact, high-signal exploration node — insightful on its own, but begging for the next branch.

            """
        )

        prompt = "\n".join([f"{request.context[node_id].title}: {request.context[node_id].content}" for node_id in request.path.split("/") if node_id in request.context])

        # Add query with optional selected context
        if request.selected_context:
            prompt += f"\n\nUser selected the following text: \"{request.selected_context}\""
            prompt += f"\nUser's question about the selection: {request.user_query}"
        else:
            prompt += f"\n\nUser's question: {request.user_query}"

        prompt += "\nProvide a response with a title (brief summary) and a detailed (max 45 words)response to the query. Also provide 2 suggested follow-up questions that would help the user explore this topic further."
        prompt += "\n\nAdditionally, suggest 2-3 related subtopics the user might want to explore next, grouped by category (e.g., 'Applications', 'Theory', 'History', 'Technical', 'Related Topics', etc.). Each subtopic should have a concise title (2-5 words) and a category label."

        response = await client.beta.chat.completions.parse(
            model="gpt-4o-search-preview-2025-03-11",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format=GenerateResponse
        )

        parsed_response = response.choices[0].message.parsed

        # Track cost
        model = "gpt-4o-search-preview-2025-03-11"
        usage = response.usage
        input_tokens = usage.prompt_tokens
        output_tokens = usage.completion_tokens
        cost = calculate_cost(model, input_tokens, output_tokens)
        user_cost_info = track_cost(user_id, session_id, model, "generate", input_tokens, output_tokens, cost)

        logger.info(f"💰 /generate cost: ${cost:.6f} | User total: ${user_cost_info['current_cost']:.4f}")

        # Save snapshot to DB if graph state provided
        if request.graph_state:
            save_snapshot(
                user_id=user_id,
                session_id=session_id,
                operation="generate",
                graph_state=request.graph_state,
                user_query=request.user_query,
                source_type=request.source_type
            )

        return {
            "title": parsed_response.title,
            "response": parsed_response.response,
            "suggested_questions": parsed_response.suggested_questions,
            "subtopics": [{"title": st.title, "category": st.category} for st in parsed_response.subtopics[:3]],  # Enforce max 3
            "cost_info": {
                "used": user_cost_info["current_cost"],
                "max_total": user_cost_info["max_cost"]
            }
        }

    except Exception as e:
        logger.error(f"Error generating content: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# DEPRECATED: Agent research feature
# @app.websocket("/ws/research")
# async def research_websocket(websocket: WebSocket):
#     """
#     WebSocket endpoint for streaming research agent results
#     """
#     client_host = websocket.client.host if websocket.client else "unknown"
#     logger.info(f"📡 New WebSocket connection from {client_host}")
#
#     await websocket.accept()
#     logger.info("✅ WebSocket connection accepted")
#
#     try:
#         # Receive initial request from client
#         logger.info("⏳ Waiting for initial request...")
#         data = await websocket.receive_text()
#         request_data = json.loads(data)
#
#         node_id = request_data.get("nodeId")
#         user_query = request_data.get("userQuery")
#         selected_context = request_data.get("selectedContext")
#         path = request_data.get("path", "")
#         context = request_data.get("context", {})
#
#         logger.info("="*80)
#         logger.info(f"🔍 RESEARCH REQUEST")
#         logger.info(f"   Node ID: {node_id}")
#         logger.info(f"   Query: {user_query}")
#         logger.info(f"   Path: {path if path else 'root'}")
#         logger.info(f"   Context nodes: {len(context)}")
#         if selected_context:
#             logger.info(f"   Selected: \"{selected_context[:50]}...\"")
#         logger.info("="*80)
#
#         # Import the streaming function
#         from agent import run_research_stream
#
#         # Track events sent
#         event_count = {"status": 0, "tool": 0, "final": 0, "error": 0}
#
#         # Define event callback
#         async def send_event(event: dict):
#             event_type = event.get("type", "unknown")
#             event_count[event_type] = event_count.get(event_type, 0) + 1
#
#             # Log event summary
#             if event_type == "status":
#                 text = event.get("text", "")[:60]
#                 logger.info(f"📤 Sending status #{event_count['status']}: {text}...")
#             elif event_type == "tool":
#                 tool_name = event.get("name", "unknown")
#                 logger.info(f"📤 Sending tool #{event_count['tool']}: {tool_name}")
#             elif event_type == "final":
#                 title = event.get("title", "")
#                 logger.info(f"📤 Sending final response: {title}")
#             elif event_type == "error":
#                 msg = event.get("message", "")
#                 logger.error(f"📤 Sending error: {msg}")
#
#             await websocket.send_text(json.dumps(event))
#
#         # Run the research stream
#         logger.info("🚀 Starting research stream...")
#         await run_research_stream(
#             query=user_query,
#             path=path,
#             context=context,
#             on_event=send_event,
#             source_node_id=node_id
#         )
#
#         logger.info("="*80)
#         logger.info(f"✅ RESEARCH COMPLETED")
#         logger.info(f"   Total events: {sum(event_count.values())}")
#         logger.info(f"   - Status: {event_count.get('status', 0)}")
#         logger.info(f"   - Tool: {event_count.get('tool', 0)}")
#         logger.info(f"   - Final: {event_count.get('final', 0)}")
#         logger.info(f"   - Error: {event_count.get('error', 0)}")
#         logger.info("="*80)
#
#     except WebSocketDisconnect:
#         logger.warning(f"⚠️  WebSocket disconnected by client")
#     except Exception as e:
#         logger.error(f"❌ WebSocket error: {e}")
#         import traceback
#         logger.error(traceback.format_exc())
#         try:
#             await websocket.send_text(json.dumps({
#                 "type": "error",
#                 "message": str(e)
#             }))
#         except:
#             logger.error("Failed to send error message to client")
#     finally:
#         try:
#             await websocket.close()
#             logger.info(f"🔌 WebSocket connection closed")
#         except:
#             pass

@app.post("/automode")
async def automode_endpoint(
    request: AutoModeRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Use session ID from frontend request
        session_id = request.session_id
        user_id = current_user["sub"]  # Google user ID
        model = "text-embedding-3-small"

        # Track total tokens for all embedding calls
        total_input_tokens = 0

        # Embed the query
        query_embedding_response = await client.embeddings.create(
            model=model,
            input=request.query
        )
        query_embedding = np.array(query_embedding_response.data[0].embedding)
        total_input_tokens += query_embedding_response.usage.total_tokens

        # Embed each node and calculate similarity
        best_node_id = None
        best_similarity = -1.0

        for node_id, node in request.nodes.items():
            # Combine query and body for node embedding
            # Use query if available, otherwise use title
            node_query = node.query if node.query else node.title
            node_text = f"{node_query} {node.content}"

            # Get embedding for this node (no caching)
            node_embedding_response = await client.embeddings.create(
                model=model,
                input=node_text
            )
            node_embedding = np.array(node_embedding_response.data[0].embedding)
            total_input_tokens += node_embedding_response.usage.total_tokens

            # Calculate cosine similarity
            similarity = np.dot(query_embedding, node_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(node_embedding)
            )

            # Update best match if this is more similar
            if similarity > best_similarity:
                best_similarity = similarity
                best_node_id = node_id

        if best_node_id is None:
            raise HTTPException(status_code=400, detail="No nodes provided")

        # Track cost for all embeddings
        cost = calculate_cost(model, total_input_tokens, 0)
        user_cost_info = track_cost(user_id, session_id, model, "automode", total_input_tokens, 0, cost)

        # Get the best node title for logging
        best_node_title = request.nodes[best_node_id].title
        logger.info(f"🔍 SEARCH: '{request.query}' → '{best_node_title}' (similarity: {best_similarity:.3f})")
        logger.info(f"💰 /automode cost: ${cost:.6f} ({len(request.nodes) + 1} embeddings) | User total: ${user_cost_info['current_cost']:.4f}")

        # Save snapshot to DB if graph state provided
        if request.graph_state:
            save_snapshot(
                user_id=user_id,
                session_id=session_id,
                operation="automode",
                graph_state=request.graph_state,
                user_query=request.query,
                source_type=request.source_type
            )

        return {
            "node_id": best_node_id,
            "similarity": float(best_similarity),
            "cost_info": {
                "used": user_cost_info["current_cost"],
                "max_total": user_cost_info["max_cost"]
            }
        }

    except Exception as e:
        logger.error(f"Error in automode endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cluster")
async def cluster_endpoint(
    request: ClusterRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Use session ID from frontend request
        session_id = request.session_id
        user_id = current_user["sub"]  # Google user ID

        # Track costs for embeddings and completions separately
        embedding_model = "text-embedding-3-small"
        completion_model = "gpt-4o-mini"
        total_embedding_tokens = 0
        total_completion_input_tokens = 0
        total_completion_output_tokens = 0

        if not request.context:
            raise HTTPException(status_code=400, detail="Context dictionary is empty")

        node_ids = []
        embeddings = []
        node_texts = {}

        # Create embeddings (no caching - always recompute)
        for node_id, node in request.context.items():
            node_query = node.query if node.query else ""
            node_text = f"{node_query} {node.title} {node.content}".strip()
            node_texts[node_id] = node_text

            # Get embedding for this node (always create new)
            embedding_response = await client.embeddings.create(
                model=embedding_model,
                input=node_text
            )
            embedding = np.array(embedding_response.data[0].embedding)
            total_embedding_tokens += embedding_response.usage.total_tokens

            node_ids.append(node_id)
            embeddings.append(embedding)
        
        if len(node_ids) == 0:
            raise HTTPException(status_code=400, detail="No nodes to cluster")
        
        embeddings_array = np.array(embeddings)
        
        # Step 2: Determine optimal number of clusters using improved method
        n_nodes = len(node_ids)
        
        if n_nodes <= 2:
            n_clusters = n_nodes
        else:
            # Increase max_k to allow more clusters - use a more generous formula
            # For small datasets, allow more clusters; cap at reasonable max
            if n_nodes <= 10:
                max_k = min(n_nodes - 1, 3)  # Allow up to 8 clusters for small datasets
            else:
                max_k = min(int(n_nodes * 0.5), 5)  # 50% of nodes, max 15
            
            k_range = range(2, max_k + 1)  # Start from k=2 (minimum meaningful clusters)
            inertias = []
            silhouette_scores = []
            
            for k in k_range:
                kmeans_test = KMeans(n_clusters=k, random_state=42, n_init=10)
                labels = kmeans_test.fit_predict(embeddings_array)
                inertias.append(kmeans_test.inertia_)
                
                # Calculate silhouette score (only if more than 1 cluster and enough samples)
                if k > 1 and len(set(labels)) > 1:
                    try:
                        sil_score = silhouette_score(embeddings_array, labels)
                        silhouette_scores.append(sil_score)
                    except:
                        silhouette_scores.append(-1)
                else:
                    silhouette_scores.append(-1)
            
            # Log calculations for debugging
            inertia_summary = ", ".join([f"k={k}:{inertia:.2f}" for k, inertia in zip(k_range, inertias)])
            logger.info(f"   Inertia Test: {inertia_summary}")
            
            if len(silhouette_scores) > 0 and max(silhouette_scores) > -1:
                sil_summary = ", ".join([f"k={k}:{sil:.3f}" for k, sil in zip(k_range, silhouette_scores)])
                logger.info(f"   Silhouette Scores: {sil_summary}")
            
            # Method 1: Use silhouette score to find optimal k (favors more granular clusters)
            if len(silhouette_scores) > 0 and max(silhouette_scores) > 0.1:
                # Find k with highest silhouette score
                best_sil_idx = np.argmax(silhouette_scores)
                n_clusters_sil = k_range[best_sil_idx]
                best_sil_score = silhouette_scores[best_sil_idx]
                logger.info(f"   Silhouette Method: Best k={n_clusters_sil} (score={best_sil_score:.3f})")
            else:
                n_clusters_sil = None
                best_sil_score = -1
            
            # Method 2: Percentage decrease method (find where inertia decrease slows significantly)
            if len(inertias) > 1:
                # Calculate percentage decrease in inertia for each step
                decreases = []
                for i in range(1, len(inertias)):
                    if inertias[i-1] > 0:
                        pct_decrease = (inertias[i-1] - inertias[i]) / inertias[i-1] * 100
                        decreases.append((k_range[i], pct_decrease))
                    else:
                        decreases.append((k_range[i], 0))
                
                # Find the elbow: where the decrease becomes small (less than threshold)
                # Use a threshold that encourages more clusters (lower threshold = more clusters)
                threshold = 8.0  # If inertia decreases by less than 8%, we've hit the elbow
                
                # Find the last k where decrease is still significant
                n_clusters_pct = k_range[0]  # Default to minimum
                for k, decrease in decreases[:len(decreases)//3+1]:
                    if decrease > threshold:
                        n_clusters_pct = k  # Update to this k since it still has good decrease
                    # Continue to find the last good one (allows more clusters)
                
                logger.info(f"   Percentage Decrease: {', '.join([f'k={k}:{dec:.1f}%' for k, dec in decreases[:5]])}")
                logger.info(f"   Percentage Decrease Method: k={n_clusters_pct} (threshold={threshold}%)")
            else:
                n_clusters_pct = k_range[0] if len(k_range) > 0 else 2
            
            # Combine methods: prefer silhouette if good, otherwise use percentage decrease
            # But bias towards more clusters when scores are similar
            if n_clusters_sil and best_sil_score > 0.2:
                n_clusters = n_clusters_sil
                logger.info(f"   Using Silhouette score method (score={best_sil_score:.3f})")
            else:
                n_clusters = n_clusters_pct
                logger.info(f"   Using Percentage decrease method")
            
            # Ensure minimum clusters based on data size
            min_clusters = min(3, max(2, n_nodes // 5))  # At least 2-3 clusters for reasonable datasets
            if n_clusters < min_clusters and n_nodes >= min_clusters * 2:
                n_clusters = min_clusters
                logger.info(f"   Adjusted to minimum: k={n_clusters} (based on dataset size)")
            
            logger.info(f"   Final chosen k={n_clusters}")
        
        # clustering with optimal k value!
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(embeddings_array)
        
        clusters = {}
        for idx, cluster_id in enumerate(cluster_labels):
            if cluster_id not in clusters:
                clusters[cluster_id] = []
            clusters[cluster_id].append(node_ids[idx])
        
        # Generate titles for each cluster (always regenerate - no caching)
        result = {}
        for cluster_id, node_id_list in clusters.items():
            cluster_texts = [node_texts[node_id] for node_id in node_id_list]
            combined_text = "\n\n".join(cluster_texts)
            
            # Get node titles to potentially use as a reference
            node_titles = [request.context[nid].title for nid in node_id_list]
            
            title_prompt = (
                f"Based on the following collection of related text snippets, "
                f"generate a very short, concise title (2-3 words maximum, prefer just a name or key term) that identifies the main topic.\n"
                f"Examples: 'Zohran Mamdani' (not 'Zohran Mamdani: NYC's Progressive Future'), 'Quantum Computing', 'Climate Policy'.\n\n"
                f"Node titles in this cluster: {', '.join(node_titles[:5])}\n\n"
                f"Text snippets:\n{combined_text}\n\n"
                f"Title (2-3 words, just the key identifier):"
            )
            title_response = await client.chat.completions.create(
                model=completion_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that generates very concise, brief titles. Always prefer the shortest possible identifier - just a name, key term, or 2-3 word phrase. Never include colons, descriptions, or explanatory text."},
                    {"role": "user", "content": title_prompt}
                ],
                max_tokens=15
            )
            cluster_title = title_response.choices[0].message.content.strip()
            cluster_title = cluster_title.strip('"').strip("'")

            # Track completion tokens
            total_completion_input_tokens += title_response.usage.prompt_tokens
            total_completion_output_tokens += title_response.usage.completion_tokens
            
            # Post-process to extract first part before colon or other separators
            # Common separators: colon, dash, pipe, semicolon
            for separator in [':', ' -', ' —', ' |', ';']:
                if separator in cluster_title:
                    cluster_title = cluster_title.split(separator)[0].strip()
                    break
            
            # Limit to first 3 words if still too long
            words = cluster_title.split()
            if len(words) > 3:
                cluster_title = ' '.join(words[:3])
            
            result[cluster_title] = node_id_list
        
        # Track costs for both embeddings and completions
        embedding_cost = calculate_cost(embedding_model, total_embedding_tokens, 0)
        completion_cost = calculate_cost(completion_model, total_completion_input_tokens, total_completion_output_tokens)
        total_cost = embedding_cost + completion_cost

        # Track embedding cost
        track_cost(user_id, session_id, embedding_model, "cluster", total_embedding_tokens, 0, embedding_cost)

        # Track completion cost and get final user cost info
        user_cost_info = track_cost(user_id, session_id, completion_model, "cluster", total_completion_input_tokens, total_completion_output_tokens, completion_cost)

        # Concise summary log with clear formatting
        logger.info(f"\n{'='*60}")
        logger.info(f"🧩 CLUSTERING COMPLETE")
        logger.info(f"   Total Nodes: {n_nodes} | Clusters: {n_clusters} | Quality (inertia): {kmeans.inertia_:.2f}")
        logger.info(f"   Generated {len(result)} cluster titles")
        logger.info(f"\n📊 CLUSTER BREAKDOWN:")
        for idx, (cluster_title, node_id_list) in enumerate(result.items(), 1):
            node_titles = [request.context[nid].title for nid in node_id_list]
            logger.info(f"\n   [{idx}] {cluster_title}")
            logger.info(f"       Size: {len(node_id_list)} nodes")
            # Show first 3 nodes, then "and X more" if there are more
            if len(node_titles) <= 3:
                for title in node_titles:
                    logger.info(f"       • {title}")
            else:
                for title in node_titles[:3]:
                    logger.info(f"       • {title}")
                logger.info(f"       • ... and {len(node_titles) - 3} more")
        logger.info(f"💰 /cluster cost: ${total_cost:.6f} (embeddings: ${embedding_cost:.6f}, completions: ${completion_cost:.6f}) | User total: ${user_cost_info['current_cost']:.4f}")
        logger.info(f"{'='*60}\n")

        # Save snapshot to DB if graph state provided
        if request.graph_state:
            save_snapshot(
                user_id=user_id,
                session_id=session_id,
                operation="cluster",
                graph_state=request.graph_state,
                user_query=None,  # Clustering has no user query
                source_type=None
            )

        # Add cost_info to result
        result["cost_info"] = {
            "used": user_cost_info["current_cost"],
            "max_total": user_cost_info["max_cost"]
        }

        return result
        
    except Exception as e:
        logger.error(f"Error in cluster endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cost")
async def get_cost_endpoint(
    current_user: dict = Depends(get_current_user)
):
    """
    Get current cost info for the authenticated user.
    """
    try:
        user_id = current_user["sub"]
        user_cost_info = get_or_create_user_cost(user_id)

        return {
            "cost_info": {
                "used": user_cost_info["current_cost"],
                "max_total": user_cost_info["max_cost"]
            }
        }
    except Exception as e:
        logger.error(f"Error getting cost info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

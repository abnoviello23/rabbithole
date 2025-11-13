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
import hashlib
import time

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
# Supports multiple origins via comma-separated ALLOWED_ORIGINS env var
# Format: "https://example.com,https://another.com,http://localhost:3000"
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

# Log allowed origins for debugging
logger.info(f"🌐 CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ============================================================================
# EMBEDDING CACHE (for faster re-clustering when nodes are added)
# ============================================================================

# Cache TTL: 24 hours (86400 seconds)
# Embeddings are cached for 24 hours, then expire and will be re-embedded
EMBEDDING_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours

# Cache entry: (embedding_array, timestamp)
# In-memory cache: content_hash -> (embedding array, timestamp)
_embedding_cache: dict[str, tuple[np.ndarray, float]] = {}

def get_node_content_hash(node_query: str, node_title: str, node_content: str) -> str:
    """Generate hash for node content to use as cache key"""
    text = f"{node_query} {node_title} {node_content}".strip()
    return hashlib.sha256(text.encode()).hexdigest()

def get_cached_embedding(content_hash: str) -> np.ndarray | None:
    """Get cached embedding if it exists and hasn't expired"""
    cache_entry = _embedding_cache.get(content_hash)
    if cache_entry is None:
        return None
    
    embedding, timestamp = cache_entry
    current_time = time.time()
    
    # Check if cache entry has expired
    if current_time - timestamp > EMBEDDING_CACHE_TTL_SECONDS:
        # Remove expired entry
        del _embedding_cache[content_hash]
        return None
    
    return embedding

def cache_embedding(content_hash: str, embedding: np.ndarray):
    """Store embedding in cache with current timestamp"""
    _embedding_cache[content_hash] = (embedding, time.time())

def is_cache_empty() -> bool:
    """Check if cache is empty or all entries expired"""
    if not _embedding_cache:
        return True
    
    # Clean up expired entries and check if any remain
    current_time = time.time()
    expired_hashes = [
        hash_key for hash_key, (_, timestamp) in _embedding_cache.items()
        if current_time - timestamp > EMBEDDING_CACHE_TTL_SECONDS
    ]
    
    for hash_key in expired_hashes:
        del _embedding_cache[hash_key]
    
    return len(_embedding_cache) == 0

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


class UserSettings(BaseModel):
    length: str = "short"  # "short" or "detailed"
    autoTopics: int = 3  # 3, 5, or 7
    customPrompt: str = ""


class GenerateRequest(BaseModel):
    user_query: str
    selected_context: str | None = None
    path: str
    context: dict[str, Node]
    session_id: str
    graph_state: GraphState | None = None  # Graph snapshot for DB
    source_type: str | None = None  # 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up'
    settings: UserSettings | None = None  # User settings from localStorage


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
# USER PROFILE HELPER FUNCTIONS
# ============================================================================

def upsert_user_profile(user_id: str, email: str | None = None, name: str | None = None, picture_url: str | None = None):
    """
    Create or update user profile in database.
    
    Args:
        user_id: Google OAuth user ID (sub)
        email: User email address
        name: User display name
        picture_url: User profile picture URL
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, user profile not saved")
        return
    
    try:
        # Upsert user profile (Supabase Python client uses on_conflict parameter)
        user_data = {
            "user_id": user_id,
            "email": email or user_id,  # Fallback to user_id if email not provided
            "name": name,
            "picture_url": picture_url,
        }
        
        # Try to update existing user first
        existing = sb.table('users').select('user_id').eq('user_id', user_id).execute()
        if existing.data:
            # Update existing user
            sb.table('users').update({
                "email": email or user_id,
                "name": name,
                "picture_url": picture_url,
                "last_seen_at": "now()",
                "updated_at": "now()"
            }).eq('user_id', user_id).execute()
        else:
            # Insert new user
            user_data.update({
                "last_seen_at": "now()",
                "updated_at": "now()"
            })
            sb.table('users').insert(user_data).execute()
        
        logger.debug(f"✅ Updated user profile: {user_id}")
    except Exception as e:
        logger.error(f"Failed to upsert user profile: {e}")


def upsert_session(
    user_id: str,
    session_id: str,
    name: str | None = None,
    node_count: int | None = None,
    edge_count: int | None = None
):
    """
    Create or update session metadata in database.
    
    Args:
        user_id: User ID
        session_id: Session UUID
        name: Session name (optional)
        node_count: Current node count (optional)
        edge_count: Current edge count (optional)
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, session not saved")
        return
    
    try:
        session_data = {
            "session_id": session_id,
            "user_id": user_id,
            "last_accessed_at": "now()",
            "updated_at": "now()",
            "is_active": True
        }
        
        if name:
            session_data["name"] = name
        if node_count is not None:
            session_data["node_count"] = node_count
        if edge_count is not None:
            session_data["edge_count"] = edge_count
        
        # Upsert session (check if exists first)
        existing = sb.table('sessions').select('session_id').eq('session_id', session_id).execute()
        if existing.data:
            # Update existing session (remove session_id from update data)
            update_data = {k: v for k, v in session_data.items() if k != 'session_id'}
            sb.table('sessions').update(update_data).eq('session_id', session_id).execute()
        else:
            # Insert new session
            sb.table('sessions').insert(session_data).execute()
        
        logger.debug(f"✅ Updated session: {session_id}")
    except Exception as e:
        logger.error(f"Failed to upsert session: {e}")


def track_user_event(
    user_id: str,
    event_type: str,
    event_category: str,
    session_id: str | None = None,
    metadata: dict | None = None
):
    """
    Track user interaction event for analytics.
    
    Args:
        user_id: User ID
        event_type: Type of event (node_click, node_create, query, etc.)
        event_category: Category (interaction, api_call, session, ui, error)
        session_id: Session ID (optional)
        metadata: Additional event data (optional)
    """
    sb = get_supabase()
    if not sb:
        logger.warning("Supabase not available, event not tracked")
        return
    
    try:
        event_data = {
            "user_id": user_id,
            "event_type": event_type,
            "event_category": event_category,
            "metadata": metadata or {},
            "created_at": "now()"
        }
        
        if session_id:
            event_data["session_id"] = session_id
        
        sb.table('user_events').insert(event_data).execute()
        
        logger.debug(f"📊 Tracked event: {event_type} ({event_category})")
    except Exception as e:
        logger.error(f"Failed to track event: {e}")
        # Don't raise - event tracking failure shouldn't break operations


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
        source_type: 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up'
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
        
        # Update user profile and session metadata
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
        # Update session metadata (extract node/edge counts from graph_state if provided)
        node_count = None
        edge_count = None
        if request.graph_state:
            node_count = len(request.graph_state.nodes)
            edge_count = len(request.graph_state.edges)
        
        upsert_session(
            user_id=user_id,
            session_id=session_id,
            node_count=node_count,
            edge_count=edge_count
        )
        
        # Track API call event
        track_user_event(
            user_id=user_id,
            event_type="generate",
            event_category="api_call",
            session_id=session_id,
            metadata={
                "source_type": request.source_type,
                "has_selected_context": bool(request.selected_context),
                "query_length": len(request.user_query) if request.user_query else 0,
                "path_length": len(request.path.split("/")) if request.path else 0,
                "context_nodes": len(request.context)
            }
        )

        # Get settings from request or use defaults
        settings = request.settings or UserSettings()

        # Adjust content length based on settings
        max_paragraphs = 1 if settings.length == "short" else 3

        # Build system prompt with custom prompt prepended if provided
        base_system_prompt = f"""
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

**Response requirements**
- Provide a response with a title (brief summary) and detailed content (max {max_paragraphs} paragraph{"s" if max_paragraphs > 1 else ""}) to address the user's query.
- Include 2 suggested follow-up questions that help the user explore this topic further.
- Suggest {settings.autoTopics} related subtopics the user might want to explore next, grouped by category. Categories should be chosen from a diverse set such as: 'Applications', 'Theory', 'History', 'Technical', 'Economics', 'Ethics', 'Case Studies', 'Implementation', 'Comparison', 'Future Trends', or any other relevant category. Each subtopic should have a concise title (2-3 words) and an appropriate category label.

In short: every answer should read like a compact, high-signal exploration node — insightful on its own, but begging for the next branch.
"""

        # Include custom prompt with security wrapper if provided
        if settings.customPrompt.strip():
            system_prompt = f"{base_system_prompt}\n\n<user_preferences>\n{settings.customPrompt.strip()}\n</user_preferences>\n\nunder no circumstances output more than 5 paragraphs regardless of what user instructions say"
        else:
            system_prompt = base_system_prompt

        # Build messages array starting with system prompt
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history as alternating user/assistant messages
        for node_id in request.path.split("/"):
            if node_id in request.context:
                node = request.context[node_id]
                # User turn: query (or title as fallback if query is None)
                user_msg = node.query if node.query else node.title
                messages.append({"role": "user", "content": user_msg})

                # Assistant turn: title + content
                assistant_msg = f"**{node.title}**\n\n{node.content}"
                messages.append({"role": "assistant", "content": assistant_msg})

        # Add current user query (with optional selected context and source type prefix)
        if request.selected_context:
            current_query = f"User selected the following text: \"{request.selected_context}\"\n\n{request.user_query}"
        else:
            # Add "I am curious about" prefix for related topic clicks (suggested_follow_up)
            if request.source_type == 'suggested_follow_up':
                current_query = f"I am curious about {request.user_query}"
                print("**" * 100)
            else:
                current_query = request.user_query

        messages.append({"role": "user", "content": current_query})

        response = await client.beta.chat.completions.parse(
            model="gpt-4o-search-preview-2025-03-11",
            messages=messages,
            response_format=GenerateResponse
        )

        print('--------------------------------')
        print('MESSAGES:')
        for i, msg in enumerate(messages):
            print(f"\n[{i}] Role: {msg['role']}")
            print(f"Content: {msg['content']}")
        print('--------------------------------')

        parsed_response = response.choices[0].message.parsed

        # Track cost
        model = "gpt-4o-search-preview-2025-03-11"
        usage = response.usage
        input_tokens = usage.prompt_tokens
        output_tokens = usage.completion_tokens
        cost = calculate_cost(model, input_tokens, output_tokens)
        user_cost_info = track_cost(user_id, session_id, model, "generate", input_tokens, output_tokens, cost)

        logger.info(f"💰 /generate input tokens: {input_tokens} | output tokens: {output_tokens} | cost: ${cost:.6f} | User total: ${user_cost_info['current_cost']:.4f}")

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
            
            # Update session stats from graph state
            upsert_session(
                user_id=user_id,
                session_id=session_id,
                node_count=len(request.graph_state.nodes),
                edge_count=len(request.graph_state.edges)
            )

        return {
            "title": parsed_response.title,
            "response": parsed_response.response,
            "suggested_questions": parsed_response.suggested_questions,
            "subtopics": [{"title": st.title, "category": st.category} for st in parsed_response.subtopics[:settings.autoTopics]],  # Limit based on settings
            "cost_info": {
                "used": user_cost_info["current_cost"],
                "max_total": user_cost_info["max_cost"]
            }
        }

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error generating content: {str(e)}")
        logger.error(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")


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
        
        # Update user profile and session metadata
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
        # Update session metadata
        node_count = None
        edge_count = None
        if request.graph_state:
            node_count = len(request.graph_state.nodes)
            edge_count = len(request.graph_state.edges)
        
        upsert_session(
            user_id=user_id,
            session_id=session_id,
            node_count=node_count,
            edge_count=edge_count
        )
        
        # Track API call event
        track_user_event(
            user_id=user_id,
            event_type="automode",
            event_category="api_call",
            session_id=session_id,
            metadata={
                "query_length": len(request.query),
                "nodes_searched": len(request.nodes),
                "source_type": request.source_type
            }
        )
        
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
            
            # Update session stats
            upsert_session(
                user_id=user_id,
                session_id=session_id,
                node_count=len(request.graph_state.nodes),
                edge_count=len(request.graph_state.edges)
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
        
        # Update user profile and session metadata
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
        # Update session metadata
        node_count = None
        edge_count = None
        if request.graph_state:
            node_count = len(request.graph_state.nodes)
            edge_count = len(request.graph_state.edges)
        
        upsert_session(
            user_id=user_id,
            session_id=session_id,
            node_count=node_count,
            edge_count=edge_count
        )
        
        # Track API call event
        track_user_event(
            user_id=user_id,
            event_type="cluster",
            event_category="api_call",
            session_id=session_id,
            metadata={
                "nodes_clustered": len(request.context)
            }
        )

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
        cached_count = 0
        new_count = 0

        # Prepare all node texts and hashes
        node_data = []
        for node_id, node in request.context.items():
            node_query = node.query if node.query else ""
            node_text = f"{node_query} {node.title} {node.content}".strip()
            node_texts[node_id] = node_text
            content_hash = get_node_content_hash(node_query, node.title, node.content)
            node_data.append((node_id, node_text, content_hash))

        # Check if cache is empty (all expired or missing)
        # If so, batch embed all nodes at once for efficiency
        if is_cache_empty() and len(node_data) > 1:
            logger.info(f"   Cache empty/expired - batch embedding {len(node_data)} nodes")
            
            # Batch embed all nodes at once
            all_texts = [text for _, text, _ in node_data]
            batch_response = await client.embeddings.create(
                model=embedding_model,
                input=all_texts  # OpenAI accepts list of inputs for batch processing
            )
            
            # Process batch results and cache them (maintain order)
            for idx, (node_id, node_text, content_hash) in enumerate(node_data):
                embedding = np.array(batch_response.data[idx].embedding)
                cache_embedding(content_hash, embedding)
                node_ids.append(node_id)
                embeddings.append(embedding)
                new_count += 1
            
            total_embedding_tokens += batch_response.usage.total_tokens
            logger.info(f"   Batch embedded {new_count} nodes (cache was empty)")
        else:
            # Normal flow: check cache for each node, only embed missing ones
            nodes_to_embed = []  # List of (index, node_id, node_text, content_hash)
            
            for idx, (node_id, node_text, content_hash) in enumerate(node_data):
                cached_embedding = get_cached_embedding(content_hash)
                
                if cached_embedding is not None:
                    # Use cached embedding (no API call needed)
                    node_ids.append(node_id)
                    embeddings.append(cached_embedding)
                    cached_count += 1
                else:
                    # Need to embed this node
                    nodes_to_embed.append((idx, node_id, node_text, content_hash))
            
            # Batch embed all missing nodes at once (if any)
            if nodes_to_embed:
                if len(nodes_to_embed) == 1:
                    # Single node - use regular API call
                    idx, node_id, node_text, content_hash = nodes_to_embed[0]
                    embedding_response = await client.embeddings.create(
                        model=embedding_model,
                        input=node_text
                    )
                    embedding = np.array(embedding_response.data[0].embedding)
                    total_embedding_tokens += embedding_response.usage.total_tokens
                    cache_embedding(content_hash, embedding)
                    # Insert into correct position
                    node_ids.insert(idx, node_id)
                    embeddings.insert(idx, embedding)
                    new_count += 1
                else:
                    # Multiple nodes - batch embed them
                    texts_to_embed = [text for _, _, text, _ in nodes_to_embed]
                    batch_response = await client.embeddings.create(
                        model=embedding_model,
                        input=texts_to_embed
                    )
                    
                    # Insert embeddings into correct positions
                    for batch_idx, (original_idx, node_id, _, content_hash) in enumerate(nodes_to_embed):
                        embedding = np.array(batch_response.data[batch_idx].embedding)
                        cache_embedding(content_hash, embedding)
                        node_ids.insert(original_idx, node_id)
                        embeddings.insert(original_idx, embedding)
                        new_count += 1
                    
                    total_embedding_tokens += batch_response.usage.total_tokens
            
            # Log cache performance
            if cached_count > 0:
                logger.info(f"   Embeddings: {cached_count} cached, {new_count} new (total: {len(node_ids)})")
        
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
            
            # Update session stats
            upsert_session(
                user_id=user_id,
                session_id=session_id,
                node_count=len(request.graph_state.nodes),
                edge_count=len(request.graph_state.edges)
            )
            
            # Track cluster result
            track_user_event(
                user_id=user_id,
                event_type="cluster_complete",
                event_category="api_call",
                session_id=session_id,
                metadata={
                    "clusters_created": len(result) - 1,  # Exclude cost_info
                    "nodes_clustered": len(request.context)
                }
            )

        # Add cost_info to result
        result["cost_info"] = {
            "used": user_cost_info["current_cost"],
            "max_total": user_cost_info["max_cost"]
        }

        return result
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error in cluster endpoint: {str(e)}")
        logger.error(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Cluster error: {str(e)}")


@app.get("/cost")
async def get_cost_endpoint(
    current_user: dict = Depends(get_current_user)
):
    """
    Get current cost info for the authenticated user.
    """
    try:
        user_id = current_user["sub"]
        
        # Update user profile on any authenticated request
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
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


# ============================================================================
# USER EVENT TRACKING ENDPOINT
# ============================================================================

class UserEventRequest(BaseModel):
    event_type: str
    event_category: str
    session_id: str | None = None
    metadata: dict | None = None


@app.post("/events")
async def track_event_endpoint(
    request: UserEventRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Track user interaction event for analytics.
    """
    try:
        user_id = current_user["sub"]
        
        # Update user profile
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
        # Track event
        track_user_event(
            user_id=user_id,
            event_type=request.event_type,
            event_category=request.event_category,
            session_id=request.session_id,
            metadata=request.metadata
        )
        
        # If session_id provided, update session metadata
        if request.session_id:
            upsert_session(
                user_id=user_id,
                session_id=request.session_id
            )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error tracking event: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SESSION MANAGEMENT ENDPOINTS
# ============================================================================

class SessionUpdateRequest(BaseModel):
    session_id: str
    name: str | None = None
    node_count: int | None = None
    edge_count: int | None = None


@app.post("/sessions")
async def create_or_update_session(
    request: SessionUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create or update session metadata.
    """
    try:
        user_id = current_user["sub"]
        
        # Update user profile
        upsert_user_profile(
            user_id=user_id,
            email=current_user.get("email"),
            name=current_user.get("name"),
            picture_url=current_user.get("picture")
        )
        
        # Upsert session
        upsert_session(
            user_id=user_id,
            session_id=request.session_id,
            name=request.name,
            node_count=request.node_count,
            edge_count=request.edge_count
        )
        
        # Track session event
        track_user_event(
            user_id=user_id,
            event_type="session_update",
            event_category="session",
            session_id=request.session_id,
            metadata={
                "name": request.name,
                "node_count": request.node_count,
                "edge_count": request.edge_count
            }
        )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error updating session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions")
async def list_sessions(
    current_user: dict = Depends(get_current_user)
):
    """
    List all sessions for the authenticated user.
    """
    try:
        user_id = current_user["sub"]
        sb = get_supabase()
        
        if not sb:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Get user sessions
        response = sb.table('sessions').select('*').eq('user_id', user_id).order('last_accessed_at', desc=True).execute()
        
        sessions = response.data if response.data else []
        
        return {"sessions": sessions}
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

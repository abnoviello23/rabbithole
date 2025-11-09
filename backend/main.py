from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import json
import logging
from pathlib import Path
import numpy as np
from sklearn.cluster import KMeans
import math

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env from the backend directory (where this file is located)
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

app = FastAPI(title="RabbitHole Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


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


class AutoModeRequest(BaseModel):
    query: str
    nodes: dict[str, Node]


class ClusterRequest(BaseModel):
    context: dict[str, Node]


class Subtopic(BaseModel):
    title: str
    category: str


class GenerateResponse(BaseModel):
    title: str
    response: str
    suggested_questions: list[str]  # List of 2 suggested follow-up questions
    subtopics: list[Subtopic]  # List of 2-3 subtopics with categories


@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    try:
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

        response = client.beta.chat.completions.parse(
            model="gpt-4o-search-preview-2025-03-11",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format=GenerateResponse
        )

        parsed_response = response.choices[0].message.parsed

        return {
            "title": parsed_response.title,
            "response": parsed_response.response,
            "suggested_questions": parsed_response.suggested_questions,
            "subtopics": [{"title": st.title, "category": st.category} for st in parsed_response.subtopics[:3]]  # Enforce max 3
        }

    except Exception as e:
        logger.error(f"Error generating content: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/research")
async def research_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for streaming research agent results
    """
    client_host = websocket.client.host if websocket.client else "unknown"
    logger.info(f"📡 New WebSocket connection from {client_host}")

    await websocket.accept()
    logger.info("✅ WebSocket connection accepted")

    try:
        # Receive initial request from client
        logger.info("⏳ Waiting for initial request...")
        data = await websocket.receive_text()
        request_data = json.loads(data)

        node_id = request_data.get("nodeId")
        user_query = request_data.get("userQuery")
        selected_context = request_data.get("selectedContext")
        path = request_data.get("path", "")
        context = request_data.get("context", {})

        logger.info("="*80)
        logger.info(f"🔍 RESEARCH REQUEST")
        logger.info(f"   Node ID: {node_id}")
        logger.info(f"   Query: {user_query}")
        logger.info(f"   Path: {path if path else 'root'}")
        logger.info(f"   Context nodes: {len(context)}")
        if selected_context:
            logger.info(f"   Selected: \"{selected_context[:50]}...\"")
        logger.info("="*80)

        # Import the streaming function
        from agent import run_research_stream

        # Track events sent
        event_count = {"status": 0, "tool": 0, "final": 0, "error": 0}

        # Define event callback
        async def send_event(event: dict):
            event_type = event.get("type", "unknown")
            event_count[event_type] = event_count.get(event_type, 0) + 1

            # Log event summary
            if event_type == "status":
                text = event.get("text", "")[:60]
                logger.info(f"📤 Sending status #{event_count['status']}: {text}...")
            elif event_type == "tool":
                tool_name = event.get("name", "unknown")
                logger.info(f"📤 Sending tool #{event_count['tool']}: {tool_name}")
            elif event_type == "final":
                title = event.get("title", "")
                logger.info(f"📤 Sending final response: {title}")
            elif event_type == "error":
                msg = event.get("message", "")
                logger.error(f"📤 Sending error: {msg}")

            await websocket.send_text(json.dumps(event))

        # Run the research stream
        logger.info("🚀 Starting research stream...")
        await run_research_stream(
            query=user_query,
            path=path,
            context=context,
            on_event=send_event
        )

        logger.info("="*80)
        logger.info(f"✅ RESEARCH COMPLETED")
        logger.info(f"   Total events: {sum(event_count.values())}")
        logger.info(f"   - Status: {event_count.get('status', 0)}")
        logger.info(f"   - Tool: {event_count.get('tool', 0)}")
        logger.info(f"   - Final: {event_count.get('final', 0)}")
        logger.info(f"   - Error: {event_count.get('error', 0)}")
        logger.info("="*80)

    except WebSocketDisconnect:
        logger.warning(f"⚠️  WebSocket disconnected by client")
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e)
            }))
        except:
            logger.error("Failed to send error message to client")
    finally:
        try:
            await websocket.close()
            logger.info(f"🔌 WebSocket connection closed")
        except:
            pass

@app.post("/automode")
async def automode_endpoint(request: AutoModeRequest):
    try:
        # Embed the query
        query_embedding_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=request.query
        )
        query_embedding = np.array(query_embedding_response.data[0].embedding)
        
        # Embed each node and calculate similarity
        best_node_id = None
        best_similarity = -1.0
        
        for node_id, node in request.nodes.items():
            # Combine query and body for node embedding
            # Use query if available, otherwise use title
            node_query = node.query if node.query else node.title
            node_text = f"{node_query} {node.content}"

            # Get embedding for this node (no caching)
            node_embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=node_text
            )
            node_embedding = np.array(node_embedding_response.data[0].embedding)

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
        
        # Get the best node title for logging
        best_node_title = request.nodes[best_node_id].title
        logger.info(f"🔍 SEARCH: '{request.query}' → '{best_node_title}' (similarity: {best_similarity:.3f})")
        
        return {
            "node_id": best_node_id,
            "similarity": float(best_similarity)
        }
        
    except Exception as e:
        logger.error(f"Error in automode endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cluster")
async def cluster_endpoint(request: ClusterRequest):
    try:
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
            embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=node_text
            )
            embedding = np.array(embedding_response.data[0].embedding)
            
            node_ids.append(node_id)
            embeddings.append(embedding)
        
        if len(node_ids) == 0:
            raise HTTPException(status_code=400, detail="No nodes to cluster")
        
        embeddings_array = np.array(embeddings)
        
        # Step 2: Determine optimal number of clusters using elbow method
        n_nodes = len(node_ids)
        
        if n_nodes <= 2:
            n_clusters = n_nodes
        else:
            # Test k values from 1 to min(sqrt(n), n-1) or max 10 for efficiency
            max_k = min(int(math.sqrt(n_nodes)) + 1, n_nodes, 10)
            k_range = range(1, max_k + 1)
            inertias = []
            
            for k in k_range:
                kmeans_test = KMeans(n_clusters=k, random_state=42, n_init=10)
                kmeans_test.fit(embeddings_array)
                inertias.append(kmeans_test.inertia_)
            
            # Log elbow method calculation for debugging
            inertia_summary = ", ".join([f"k={k}:{inertia:.2f}" for k, inertia in zip(k_range, inertias)])
            logger.info(f"   Elbow Test: {inertia_summary}")
            
            if len(inertias) > 2:
                # Automated elbow method using point furthest from line connected 1st and last points
                first_point = np.array([k_range[0], inertias[0]])
                last_point = np.array([k_range[-1], inertias[-1]])
                line_vec = last_point - first_point
                line_norm = np.linalg.norm(line_vec)
                
                max_dist = -1
                optimal_k_idx = 1  # Default to k=2 (index 1) if no clear elbow
                
                for i in range(1, len(inertias) - 1):
                    point = np.array([k_range[i], inertias[i]])
                    point_vec = point - first_point
                    # Distance from point to line (using manual calculation to avoid NumPy warning)
                    dist = abs(point_vec[0] * line_vec[1] - point_vec[1] * line_vec[0]) / line_norm if line_norm > 0 else 0
                    
                    if dist > max_dist:
                        max_dist = dist
                        optimal_k_idx = i
                
                n_clusters = k_range[optimal_k_idx]
                logger.info(f"   Elbow Method: Chose k={n_clusters} (point {optimal_k_idx+1} furthest from line, distance={max_dist:.3f})")
            else:
                # If we can't compute elbow (too few k values tested), use k=1
                n_clusters = 1
                logger.info(f"   Elbow Method: Too few k values, defaulting to k=1")
        
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
            title_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that generates very concise, brief titles. Always prefer the shortest possible identifier - just a name, key term, or 2-3 word phrase. Never include colons, descriptions, or explanatory text."},
                    {"role": "user", "content": title_prompt}
                ],
                max_tokens=15
            )
            cluster_title = title_response.choices[0].message.content.strip()
            cluster_title = cluster_title.strip('"').strip("'")
            
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
        logger.info(f"{'='*60}\n")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in cluster endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

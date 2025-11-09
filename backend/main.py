from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
import numpy as np
from typing import Dict
from sklearn.cluster import KMeans
import math
import hashlib

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache for node embeddings: {cache_key: embedding_array}
node_embedding_cache: Dict[str, np.ndarray] = {}

# Cache for cluster assignments: {cluster_hash: {cluster_title: [node_ids]}}
# Hash is based on which nodes are grouped together (not cluster titles)
cluster_cache: Dict[str, Dict[str, list[str]]] = {}

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


def get_node_cache_key(node_id: str, node_text: str) -> str:
    """Generate a cache key based on node ID and content hash."""
    content_hash = hashlib.md5(node_text.encode()).hexdigest()
    return f"{node_id}:{content_hash}"


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

            # Check cache first
            cache_key = get_node_cache_key(node_id, node_text)
            if cache_key in node_embedding_cache:
                node_embedding = node_embedding_cache[cache_key]
            else:
                # Get embedding for this node
                node_embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=node_text
                )
                node_embedding = np.array(node_embedding_response.data[0].embedding)
                # Store in cache
                node_embedding_cache[cache_key] = node_embedding

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
        cache_hits = 0
        cache_misses = 0
        
        # Create embeddings (using cache)
        for node_id, node in request.context.items():
            node_query = node.query if node.query else ""
            node_text = f"{node_query} {node.title} {node.content}".strip()
            node_texts[node_id] = node_text
            
            # Check cache first
            cache_key = get_node_cache_key(node_id, node_text)
            if cache_key in node_embedding_cache:
                embedding = node_embedding_cache[cache_key]
                cache_hits += 1
            else:
                embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=node_text
                )
                embedding = np.array(embedding_response.data[0].embedding)
                node_embedding_cache[cache_key] = embedding
                cache_misses += 1
            
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
        
        # Create a deterministic hash of cluster assignments (which nodes are grouped together)
        # Sort node IDs within each cluster and sort clusters by their sorted node IDs
        cluster_sets = [tuple(sorted(node_list)) for node_list in clusters.values()]
        cluster_sets_sorted = tuple(sorted(cluster_sets))
        cluster_hash = hashlib.md5(str(cluster_sets_sorted).encode()).hexdigest()
        
        # Check if we have cached titles for this exact cluster configuration
        title_cache_hit = False
        if cluster_hash in cluster_cache:
            # Verify the cached clusters match (node IDs are the same)
            cached_result = cluster_cache[cluster_hash]
            # Check if all node IDs match
            cached_node_ids = set()
            for node_list in cached_result.values():
                cached_node_ids.update(node_list)
            current_node_ids = set(node_ids)
            
            if cached_node_ids == current_node_ids:
                # Exact match! Reuse cached titles
                result = cached_result.copy()
                title_cache_hit = True
            else:
                # Node set changed, need to regenerate
                title_cache_hit = False
        else:
            title_cache_hit = False
        
        # Generate titles if not cached
        if not title_cache_hit:
            result = {}
            for cluster_id, node_id_list in clusters.items():
                cluster_texts = [node_texts[node_id] for node_id in node_id_list]
                combined_text = "\n\n".join(cluster_texts)
                
                title_prompt = (
                    f"Based on the following collection of related text snippets, "
                    f"generate a short, descriptive title (maximum 5 words) that summarizes the main theme or topic:\n\n"
                    f"{combined_text}\n\n"
                    f"Title:"
                )
                title_response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that generates concise, descriptive titles."},
                        {"role": "user", "content": title_prompt}
                    ],
                    max_tokens=20
                )
                cluster_title = title_response.choices[0].message.content.strip()
                cluster_title = cluster_title.strip('"').strip("'")
                result[cluster_title] = node_id_list
            
            # Cache the result
            cluster_cache[cluster_hash] = result.copy()
        
        # Clean up old cache entries (keep only last 10 configurations to prevent memory bloat)
        if len(cluster_cache) > 10:
            # Remove oldest entry (simple FIFO - in production, use LRU cache)
            oldest_key = next(iter(cluster_cache))
            del cluster_cache[oldest_key]
        
        # Concise summary log with clear formatting
        logger.info(f"\n{'='*60}")
        logger.info(f"🧩 CLUSTERING COMPLETE")
        logger.info(f"   Total Nodes: {n_nodes} | Clusters: {n_clusters} | Quality (inertia): {kmeans.inertia_:.2f}")
        logger.info(f"   Embedding Cache: {cache_hits} hits, {cache_misses} new ({cache_hits*100//n_nodes if n_nodes > 0 else 0}% cached)")
        if title_cache_hit:
            logger.info(f"   Title Cache: HIT (reused {len(result)} titles, saved {len(result)} GPT calls)")
        else:
            logger.info(f"   Title Cache: MISS (generated {len(result)} new titles)")
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


@app.post("/warm-cache")
async def warm_cache_endpoint(request: ClusterRequest):
    """
    Warm up the cache by creating embeddings for all nodes.
    Called by frontend on startup to restore cache after backend restart.
    """
    try:
        if not request.context or len(request.context) == 0:
            return {"message": "No nodes to cache", "cached": 0}
        
        cached_count = 0
        new_count = 0
        
        for node_id, node in request.context.items():
            node_query = node.query if node.query else ""
            node_text = f"{node_query} {node.title} {node.content}".strip()
            
            cache_key = get_node_cache_key(node_id, node_text)
            if cache_key in node_embedding_cache:
                cached_count += 1
            else:
                # Create embedding and cache it
                embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=node_text
                )
                embedding = np.array(embedding_response.data[0].embedding)
                node_embedding_cache[cache_key] = embedding
                new_count += 1
        
        total = cached_count + new_count
        logger.info(f"🔥 CACHE WARMED | {new_count} new embeddings created, {cached_count} already cached (total: {total})")
        
        return {
            "message": "Cache warmed successfully",
            "total_nodes": total,
            "new_cached": new_count,
            "already_cached": cached_count
        }
        
    except Exception as e:
        logger.error(f"Error warming cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

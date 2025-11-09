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


class GenerateResponse(BaseModel):
    title: str
    response: str
    suggested_questions: list[str]  # List of 2 suggested follow-up questions


@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    try:
        system_prompt = (
            """
You are an AI assistant designed for exploratory, mind-map-style conversations.

Your purpose is to help users dive deep into topics by producing compact, information-dense overviews that naturally open new rabbit holes. Each answer should feel like a “knowledge node” — self-contained yet full of threads to pull on.

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
- Each response should make the user curious to ask “why,” “how,” or “what next.”

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

        prompt += "\nProvide a response with a title (brief summary) and a detailed response to the query. Also provide 2 suggested follow-up questions that would help the user explore this topic further."

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
            "suggested_questions": parsed_response.suggested_questions
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
                logger.info(f"Using cached embedding for node {node_id}")
            else:
                # Get embedding for this node
                node_embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=node_text
                )
                node_embedding = np.array(node_embedding_response.data[0].embedding)
                # Store in cache
                node_embedding_cache[cache_key] = node_embedding
                logger.info(f"Cached new embedding for node {node_id}")

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
        
        for node_id, node in request.context.items():
            node_query = node.query if node.query else ""
            node_text = f"{node_query} {node.title} {node.content}".strip()
            node_texts[node_id] = node_text
            
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
                    # Distance from point to line = |(point - first) × line_vec| / |line_vec|
                    cross_product = np.abs(np.cross(point_vec, line_vec))
                    dist = cross_product / line_norm if line_norm > 0 else 0
                    
                    if dist > max_dist:
                        max_dist = dist
                        optimal_k_idx = i
                
                n_clusters = k_range[optimal_k_idx]
            else:
                # If we can't compute elbow (too few k values tested), use k=1
                n_clusters = 1
        
        # clustering with optimal k value!
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(embeddings_array)
        
        clusters = {}
        for idx, cluster_id in enumerate(cluster_labels):
            if cluster_id not in clusters:
                clusters[cluster_id] = []
            clusters[cluster_id].append(node_ids[idx])
        
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

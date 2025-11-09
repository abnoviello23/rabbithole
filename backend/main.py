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
    query: str
    path: str
    context: dict[str, Node]


class AutoModeRequest(BaseModel):
    query: str
    nodes: dict[str, Node]


class GenerateResponse(BaseModel):
    title: str
    response: str
    suggested_questions: list[str]  # List of 2 suggested follow-up questions


@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    try:
        # Build context prompt from path nodes
        context_parts = []
        path_nodes = request.path.split("/")
        for node_id in path_nodes:
            if node_id in request.context:
                node = request.context[node_id]
                context_parts.append(f"{node.title}: {node.content}")
        
        prompt = "\n".join(context_parts)
        prompt += f"\n\nQuery: {request.query}"
        prompt += "\n\nProvide a comprehensive response with a title (brief summary) and a detailed response to the query in no longer than 50 words. Also provide 2 suggested follow-up questions that would help the user explore this topic further."
        
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
            
            # Get embedding for this node
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
        
        return {
            "node_id": best_node_id,
            "similarity": float(best_similarity)
        }
        
    except Exception as e:
        logger.error(f"Error in automode endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

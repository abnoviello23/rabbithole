from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import logging
import time
from pathlib import Path
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger(__name__)

# Load .env from the backend directory (where this file is located)
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server starting on http://0.0.0.0:8000")
    yield


app = FastAPI(title="RabbitHole Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        if request.url.path == "/chat":
            logger.info(f"{request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"Error: {str(e)} - Time: {process_time:.3f}s")
        raise

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class Node(BaseModel):
    id: str
    title: str
    content: str


class GenerateRequest(BaseModel):
    query: str
    path: str
    context: dict[str, Node]


class GenerateResponse(BaseModel):
    title: str
    response: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    start_time = time.time()
    logger.info(f"Chat request received - Message length: {len(request.message)} chars, History length: {len(request.history)} messages")
    
    try:
        # Build conversation history
        messages = []
        for msg in request.history:
            messages.append({"role": msg.role, "content": msg.content})
        
        # Add the current user message
        messages.append({"role": "user", "content": request.message})
        
        api_start_time = time.time()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages
        )
        api_time = time.time() - api_start_time
        
        assistant_message = response.choices[0].message.content
        total_time = time.time() - start_time
        
        logger.info(f"OpenAI API response received - Response length: {len(assistant_message)} chars - API time: {api_time:.3f}s - Total time: {total_time:.3f}s")
        
        return {
            "response": assistant_message
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    try:
        prompt = "\n".join([f"{request.context[node_id].title}: {request.context[node_id].content}" for node_id in request.path.split("/") if node_id in request.context])
        prompt += f"\nQuery: {request.query}"
        prompt += "\nProvide a response with a title (brief summary) and a detailed response to the query."
        
        response = client.beta.chat.completions.parse(
            model="gpt-4o-search-preview-2025-03-11",
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format=GenerateResponse
        )

        parsed_response = response.choices[0].message.parsed
        
        return {
            "title": parsed_response.title,
            "response": parsed_response.response
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

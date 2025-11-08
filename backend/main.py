from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()
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


class GenerateRequest(BaseModel):
    query: str
    path: str
    context: dict[str, Node]


class GenerateResponse(BaseModel):
    title: str
    response: str


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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Running..."}

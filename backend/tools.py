import os
from typing import Any
# External SDKs are optional; import lazily so the file can be loaded even if
# the packages are not installed. Each tool checks availability at runtime.
from claude_agent_sdk import tool, create_sdk_mcp_server

# Optional OpenAI SDK
try:
    from openai import OpenAI  # type: ignore
except ImportError:  # Package not installed
    OpenAI = None  # type: ignore

# Optional Cartesia SDK
try:
    from cartesia import Cartesia  # type: ignore
except ImportError:
    Cartesia = None  # type: ignore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


@tool(
    "summarize_data",
    "Summarize any data, research, articles, or text into clear insights. Like explaining complex stuff to a friend at a bar - smart but chill.",
    {
        "content": str,
        "style": str,  # "concise", "detailed", "bullet_points", "tldr"
    }
)
def summarize_data(args: dict[str, Any]) -> dict[str, Any]:
    """
    One tool to summarize everything - research data, web results, articles, you name it.
    """
    try:
        api_key = os.environ.get("OPENAI_API_KEY")
        # Validate library availability
        if OpenAI is None:
            return {
                "content": [{
                    "type": "text",
                    "text": "❌ The `openai` Python package is not installed. Run `pip install openai` and try again."
                }]
            }

        if not api_key:
            return {
                "content": [{
                    "type": "text",
                    "text": "❌ OPENAI_API_KEY is not set. Please add it to your environment or .env file."
                }]
            }

        content = args["content"]
        style = args.get("style", "concise")
        
        # Style-specific prompts
        style_prompts = {
            "concise": "Summarize this in a natural, conversational way - like explaining it to a smart friend at a bar. Keep it intellectually stimulating but casual:\n\n",
            "detailed": "Provide a detailed, comprehensive summary with key insights and important details:\n\n",
            "bullet_points": "Summarize this as clear bullet points covering the main ideas:\n\n",
            "tldr": "Give me a super quick TLDR (2-3 sentences max) of the key takeaway:\n\n"
        }
        
        prompt = style_prompts.get(style, style_prompts["concise"]) + content
        
        # Call OpenAI API
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Fast and cost-effective for summaries
            messages=[
                {
                    "role": "system",
                    "content": "You are a brilliant summarizer who distills complex information into clear, engaging insights. Think natural clarity and intellectual depth, but conversational - like talking to a friend who's smart but doesn't need academic jargon."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        summary = response.choices[0].message.content
        
        return {
            "content": [{
                "type": "text",
                "text": f"📝 Summary:\n\n{summary}"
            }]
        }
        
    except Exception as e:
        return {
            "content": [{
                "type": "text",
                "text": f"❌ Failed to generate summary: {str(e)}\n\nMake sure OPENAI_API_KEY is set in your environment."
            }]
        }


@tool(
    "generate_audio",
    "Convert text to speech using Cartesia AI and save it as an audio file. Perfect for creating voice narrations, summaries, or any text you want to hear out loud.",
    {
        "transcript": str,
        "voice_id": str,  # Voice ID - defaults to a good one if not specified
        "speed": float,  # 0.5 to 2.0, default 0.9 (maps to slow/normal/fast)
        "filename": str  # Output filename (e.g., "summary.wav")
    }
)
async def generate_audio(args: dict[str, Any]) -> dict[str, Any]:
    """
    Generate speech from text using Cartesia AI and save locally.
    """
    try:
        cartesia_api_key = os.environ.get("CARTESIA_API_KEY")

        # Validate Cartesia library availability
        if Cartesia is None:
            return {
                "content": [{
                    "type": "text",
                    "text": "❌ The `cartesia` Python package is not installed. Run `pip install cartesia` and try again."
                }]
            }

        if not cartesia_api_key:
            return {
                "content": [{
                    "type": "text",
                    "text": "❌ CARTESIA_API_KEY is not set. Please add it to your environment or .env file."
                }]
            }

        transcript = args["transcript"]
        voice_id = args.get("voice_id", "f9836c6e-a0bd-460e-9d3c-f7299fa60f94")  # Default voice
        speed = args.get("speed", 0.9)
        filename = args.get("filename", "output_audio.wav")
        
        # Make sure filename ends with .wav
        if not filename.endswith(".wav"):
            filename += ".wav"
        
        # Define voice parameters
        voice = {
            "mode": "id",
            "id": voice_id
        }
        
        # Define output format
        output_format = {
            "container": "wav",
            "encoding": "pcm_f32le",
            "sample_rate": 44100
        }
        
        # Map numeric speed to string (Cartesia API expects 'slow', 'normal', or 'fast')
        if speed < 0.8:
            speed_str = "slow"
        elif speed > 1.2:
            speed_str = "fast"
        else:
            speed_str = "normal"
        
        # Generate audio
        cartesia_client = Cartesia(api_key=cartesia_api_key)
        audio_stream = cartesia_client.tts.bytes(
            model_id="sonic-3",
            transcript=transcript,
            voice=voice,
            output_format=output_format,
            speed=speed_str
        )
        
        # Save to file
        output_path = os.path.join(os.getcwd(), filename)
        with open(output_path, "wb") as audio_file:
            for chunk in audio_stream:
                audio_file.write(chunk)
        
        return {
            "content": [{
                "type": "text",
                "text": f"🎵 Audio generated successfully!\n\nSaved to: {output_path}\nSpeed: {speed_str}\n\nTranscript: \"{transcript[:100]}...\""
            }]
        }
        
    except Exception as e:
        return {
            "content": [{
                "type": "text",
                "text": f"❌ Failed to generate audio: {str(e)}\n\nMake sure CARTESIA_API_KEY is set in your .env file."
            }]
        }


# Create the MCP server with both tools
summary_tools_server = create_sdk_mcp_server(
    name="openai-summary-tools",
    version="1.0.0",
    tools=[summarize_data, generate_audio],
)


# Export for easy import
__all__ = ["summary_tools_server", "summarize_data", "generate_audio"]


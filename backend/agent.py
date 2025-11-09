import asyncio
import os
import logging
from typing import Callable, Awaitable, Any, Dict
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
)
try:
    from tools import summary_tools_server
    from cartesia import Cartesia
except ImportError as e:
    summary_tools_server = None
    Cartesia = None
    print(f"Error importing tools: {e}")
except Exception as e:
    print("Error importing tools:", e)
    summary_tools_server = None
    Cartesia = None
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Configuration
allowed_tools = "Bash,Read,Write,Edit,WebSearch,Git,Task,MultiEdit,GREP,Glob,TodoWrite,LS,WebFetch"
# allowed_tools = "Bash,Read,Write,Edit,WebSearch,Git,Task,MultiEdit,GREP,Glob,TodoWrite,LS,WebFetch,mcp__openai-summary-tools__summarize_data,mcp__openai-summary-tools__generate_audio"
path_to_project = os.getcwd()

# Build MCP servers dict, filtering out None values
_mcp_servers_raw = {
    "exa": {
        "type": "http",
        "url": f"https://mcp.exa.ai/mcp?exaApiKey={os.getenv('EXA_API_KEY', '')}",
    },
    "openai-summary-tools": summary_tools_server,  # Custom OpenAI summary tools (may be None if import failed)
}
# Filter out None values
mcp_servers = {k: v for k, v in _mcp_servers_raw.items() if v is not None}

# Settings file path
claude_code_settings_json_file = os.path.join(path_to_project, ".claude/settings.json")


def ensure_settings_file() -> None:
    """
    Ensure the Claude Code settings file exists with proper configuration.
    Creates the file and directory if they don't exist.
    """
    if not os.path.exists(claude_code_settings_json_file):
        logger.info(f"Creating settings file: {claude_code_settings_json_file}")
        os.makedirs(os.path.dirname(claude_code_settings_json_file), exist_ok=True)

        import json
        settings = {
            "enableAllProjectMcpServers": True,
            "permissions": {"allow": ["mcp__exa", "mcp__openai-summary-tools"]},
        }
        with open(claude_code_settings_json_file, "w") as f:
            json.dump(settings, f, indent=2)
        logger.info("✅ Settings file created")


async def process_assistant_message(message: AssistantMessage, text_outputs: list, on_event: Callable[[Dict[str, Any]], Awaitable[None]] | None = None) -> None:
    """
    Process assistant messages and extract content

    Handles AssistantMessage datatype:
    - AssistantMessage(content=[TextBlock(...)] | [ToolUseBlock(...)] | [ToolResultBlock(...)], model=str, parent_tool_use_id=None)

    Args:
        message: AssistantMessage from Claude
        text_outputs: List to append text outputs to
        on_event: Optional callback for streaming events
    """
    # Extract content blocks from the message
    if not hasattr(message, 'content') or not message.content:
        logger.warning(f"Message has no content: {message}")
        return

    for block in message.content:
        # Handle TextBlock - contains AI text responses
        if isinstance(block, TextBlock):
            text = block.text
            text_outputs.append(text)
            print(f"\n🤖 Claude: {text}")

            # Stream status event
            if on_event:
                await on_event({"type": "status", "text": f"🤖 Claude: {text}"})

        # Handle ToolUseBlock - contains tool invocations
        elif isinstance(block, ToolUseBlock):
            tool_name = block.name
            tool_id = block.id
            tool_input = block.input

            # Pretty print tool usage
            print(f"\n🛠️  Using tool: {tool_name}")
            logger.debug(f"Tool ID: {tool_id}, Input: {tool_input}")

            # Build details dict for streaming
            details = {}

            # Show relevant input details based on tool type
            if tool_name == "Write":
                file_path = tool_input.get("file_path", "")
                print(f"    → Writing to: {file_path}")
                details["file_path"] = file_path
            elif tool_name == "Read":
                file_path = tool_input.get("file_path", "")
                print(f"    → Reading: {file_path}")
                details["file_path"] = file_path
            elif tool_name == "Edit":
                file_path = tool_input.get("file_path", "")
                print(f"    → Editing: {file_path}")
                details["file_path"] = file_path
            elif tool_name == "WebSearch" or "web_search" in tool_name.lower():
                query = tool_input.get("query", "")
                num_results = tool_input.get("numResults", tool_input.get("num_results", 5))
                search_type = tool_input.get("type", "auto")
                print(f"    → Query: {query}")
                print(f"    → Results: {num_results}, Type: {search_type}")
                details["query"] = query
                details["num_results"] = num_results
                details["search_type"] = search_type
            elif tool_name == "Bash":
                command = tool_input.get("command", "")
                print(f"    → Running: {command}")
                details["command"] = command
            elif tool_name.startswith("mcp_"):
                # MCP tools - handle exa and custom tools
                if "exa" in tool_name:
                    # Exa web search tool
                    query = tool_input.get("query", "")
                    print(f"    → Exa Query: {query}")
                    details["query"] = query
                    details["num_results"] = tool_input.get("numResults", 25)
                    details["search_type"] = tool_input.get("type", "deep")
                elif "summarize_data" in tool_name:
                    style = tool_input.get("style", "concise")
                    content_preview = str(tool_input.get("content", ""))[:50]
                    print(f"    → Style: {style}")
                    print(f"    → Content: {content_preview}...")
                    details["style"] = style
                elif "generate_audio" in tool_name:
                    filename = tool_input.get("filename", "output.wav")
                    print(f"    → Output: {filename}")
                    details["filename"] = filename

            # Stream tool event
            if on_event:
                await on_event({"type": "tool", "name": tool_name, "details": details})

        # Handle ToolResultBlock - contains tool results (e.g., Exa search results with URLs)
        elif isinstance(block, ToolResultBlock):
            tool_use_id = block.tool_use_id
            content = block.content
            is_error = block.is_error

            if is_error:
                logger.warning(f"Tool error for {tool_use_id}: {content}")
            else:
                # Try to parse Exa search results
                try:
                    import json
                    # ToolResultBlock content is typically a list with text content
                    if isinstance(content, list) and len(content) > 0:
                        result_text = content[0].get('text', '') if isinstance(content[0], dict) else str(content[0])

                        # Try to parse as JSON (Exa returns JSON with results)
                        try:
                            result_data = json.loads(result_text)

                            # Check if this is an Exa result with URLs
                            if 'results' in result_data and isinstance(result_data['results'], list):
                                # Extract URLs and titles from Exa results
                                sources = []
                                for result in result_data['results']:
                                    if 'url' in result:
                                        sources.append({
                                            'url': result['url'],
                                            'title': result.get('title', result['url'])
                                        })

                                if sources:
                                    logger.info(f"📚 Extracted {len(sources)} sources from Exa results")
                                    # Send sources event to frontend
                                    if on_event:
                                        await on_event({
                                            "type": "sources",
                                            "sources": sources
                                        })
                        except json.JSONDecodeError:
                            # Not JSON, skip
                            pass
                except Exception as e:
                    logger.debug(f"Could not parse tool result: {e}")

        else:
            # Unknown block type - log it
            logger.warning(f"Unknown block type: {type(block)}")


async def run_research_stream(
    query: str,
    path: str,
    context: Dict[str, Dict[str, str]],
    on_event: Callable[[Dict[str, Any]], Awaitable[None]]
) -> None:
    """
    Run research agent and stream events via callback
    
    Args:
        query: User's research query
        path: Path string from root to current node
        context: Context dict with node data
        on_event: Async callback for streaming events
    """
    logger.info("🤖 run_research_stream() called")
    logger.info(f"   Query: {query}")
    logger.info(f"   Path: {path}")
    logger.info(f"   Context size: {len(context)} nodes")

    try:
        # Ensure settings file exists
        ensure_settings_file()

        # Build context string outside the f-string to avoid backslash issue
        context_lines = [f"- {ctx.get('title', '')}: {ctx.get('content', '')}" for ctx in context.values()]
        context_str = "\n".join(context_lines)

        options = ClaudeAgentOptions(
            system_prompt=f"""You are a research assistant for a mind-map exploration tool.
The user has asked: "{query}"
Context from their exploration path:
{context_str}
Your task:
1. Use mcp__exa__web_search_exa to research this query deeply
2. Search multiple times with different angles if needed
3. Synthesize your findings into a clear, concise response (max 80 words)
4. Provide insights that encourage further exploration
Be intellectually stimulating but conversational. Think "smart friend at a bar" clarity.""",
            permission_mode='acceptEdits',
            cwd=path_to_project,
            allowed_tools=[
                "mcp__exa__web_search_exa",
                "mcp__openai-summary-tools__summarize_data",
                "Read",
                "Write",
                "Edit",
                "Bash"
            ],
            mcp_servers=mcp_servers,
            settings=claude_code_settings_json_file,
            setting_sources=["project"],
        )

        messages = []
        text_outputs = []

        logger.info("━" * 80)
        logger.info("🔧 Initializing ClaudeSDKClient...")

        async with ClaudeSDKClient(options=options) as client:
            logger.info("✅ ClaudeSDKClient initialized successfully")
            logger.info(f"📨 Sending research query: {query}")
            logger.info("━" * 80)

            await client.query(query)
            async for message in client.receive_response():
                messages.append(message)

                try:
                    # MESSAGE TYPE: SystemMessage
                    if hasattr(message, 'subtype') and message.subtype == 'init':
                        logger.info("🔧 Session initialized")
                        if hasattr(message, 'data'):
                            session_id = message.data.get('session_id', 'unknown')
                            model = message.data.get('model', 'unknown')
                            logger.info(f"   Session ID: {session_id[:8]}...")
                            logger.info(f"   Model: {model}")

                            # Show MCP server status
                            mcp_servers_status = message.data.get('mcp_servers', [])
                            if mcp_servers_status:
                                logger.info("   MCP Servers:")
                                for server in mcp_servers_status:
                                    status_icon = "✅" if server['status'] == 'connected' else "⚠️"
                                    logger.info(f"     {status_icon} {server['name']}: {server['status']}")

                    # MESSAGE TYPE: AssistantMessage
                    elif isinstance(message, AssistantMessage):
                        await process_assistant_message(message, text_outputs, on_event)

                    # MESSAGE TYPE: ResultMessage (final summary)
                    elif hasattr(message, 'subtype') and message.subtype == 'success':
                        logger.info("━" * 80)
                        logger.info("✅ Claude Agent Research Complete!")
                        logger.info("━" * 80)
                        if hasattr(message, 'duration_ms'):
                            duration_sec = message.duration_ms / 1000
                            logger.info(f"⏱️  Duration: {duration_sec:.1f}s")
                        if hasattr(message, 'num_turns'):
                            logger.info(f"🔄 Turns: {message.num_turns}")
                        if hasattr(message, 'total_cost_usd'):
                            logger.info(f"💰 Cost: ${message.total_cost_usd:.4f}")
                        logger.info("━" * 80)

                        # Synthesize final response using OpenAI
                        logger.info("🧠 Synthesizing final response with OpenAI...")
                        try:
                            from openai import OpenAI

                            openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

                            # Combine all text outputs
                            research_content = "\n\n".join(text_outputs)
                            logger.info(f"   Research content length: {len(research_content)} chars")
                            logger.info(f"   Text outputs collected: {len(text_outputs)}")

                            # Generate structured response
                            synthesis_prompt = f"""Based on this research about "{query}":
{research_content}
Create a concise response (max 80 words) and suggest 2 follow-up questions that would help explore this topic further."""

                            from pydantic import BaseModel
                            class FinalResponse(BaseModel):
                                title: str
                                response: str
                                suggested_questions: list[str]

                            logger.info("   Calling OpenAI API for synthesis...")
                            completion = openai_client.beta.chat.completions.parse(
                                model="gpt-4o-mini",
                                messages=[
                                    {"role": "system", "content": "You synthesize research into clear, concise insights for a mind-map exploration tool."},
                                    {"role": "user", "content": synthesis_prompt}
                                ],
                                response_format=FinalResponse
                            )

                            result = completion.choices[0].message.parsed
                            logger.info(f"✅ OpenAI synthesis complete: {result.title}")

                            # Send final event
                            await on_event({
                                "type": "final",
                                "title": result.title,
                                "response": result.response,
                                "suggested_questions": result.suggested_questions
                            })

                        except Exception as e:
                            logger.error(f"❌ Failed to synthesize final response: {e}")
                            import traceback
                            logger.error(traceback.format_exc())
                            # Fallback: use first text output as response
                            logger.info("   Using fallback response")
                            await on_event({
                                "type": "final",
                                "title": query[:50],
                                "response": text_outputs[0] if text_outputs else "Research completed.",
                                "suggested_questions": []
                            })

                except Exception as e:
                    logger.error(f"❌ Error processing message: {e}")
                    import traceback
                    logger.error(traceback.format_exc())

    except Exception as e:
        logger.error(f"❌ Research stream error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        await on_event({
            "type": "error",
            "message": str(e)
        })


async def main():
    """Main entry point for the research agent"""

    # Ensure settings file exists
    ensure_settings_file()

    options = ClaudeAgentOptions(
        system_prompt=f"""You are a rabbit hole explorer - a deep researcher who goes down fascinating paths to understand topics fully.
YOUR RESEARCH PROCESS (follow this workflow):
1. **INITIAL SEARCH** - Start with mcp__exa__web_search_exa to get a broad overview
   - Use 'deep' search type for comprehensive results
   - Get 10+ results to have good coverage
2. **ITERATIVE DEEP DIVE** - Follow interesting threads:
   - Search again with more specific queries based on what you found
   - Explore 2-3 different angles or sub-topics
   - Look for primary sources, interviews, specific details
   - Don't stop at surface level - dig deeper!
3. **EXPLORE SOURCES** - As you gather information:
   - Note the most interesting findings
   - Connect different pieces of information
   - Look for patterns, strategies, unique approaches
4. **SYNTHESIZE** - After research is complete:
   - Write your findings in that drunk-friend-at-bar clarity
   - Make it intellectually stimulating but natural
   - Think deep, write clear
5. **GENERATE AUDIO** - ALWAYS finish by using mcp__openai-summary-tools__generate_audio:
   - Take your final synthesis
   - Generate an audio summary (name it something descriptive like "research_summary_[topic].wav")
   - This is your audio research report!
TOOLS AVAILABLE:
- mcp__exa__web_search_exa: Your main research tool - use it multiple times!
- mcp__openai-summary-tools__summarize_data: Condense long content
- mcp__openai-summary-tools__generate_audio: Create audio summary at the end
- Read/Write/Edit: Work with files in {path_to_project}
- Bash: Run commands if needed
Remember: Research iteratively, explore deeply, then deliver audio insights.""",
        permission_mode='acceptEdits',
        cwd=path_to_project,
        allowed_tools=[
            "mcp__exa__web_search_exa",
            "mcp__openai-summary-tools__summarize_data",
            "mcp__openai-summary-tools__generate_audio",
            "Read",
            "Write",
            "Edit",
            "Bash"
        ],
        mcp_servers=mcp_servers,
        settings=claude_code_settings_json_file,
        setting_sources=["project"],
    )

    messages = []
    text_outputs = []  # Collect text responses for audio summary

    logger.info("🔧 Initializing ClaudeSDKClient...")

    async with ClaudeSDKClient(options=options) as client:
        logger.info("✅ ClaudeSDKClient initialized successfully")
        logger.info("Sending prompt to Claude SDK")

        # Demo query - replace with your own query for testing
        demo_query = input("Enter your research query: ") if os.isatty(0) else "Research a topic of interest"
        await client.query(demo_query)
        async for message in client.receive_response():
            messages.append(message)


            try:
                # MESSAGE TYPE: SystemMessage
                if hasattr(message, 'subtype') and message.subtype == 'init':
                    # Initial system message with session info
                    print("\n🔧 Session initialized")
                    if hasattr(message, 'data'):
                        session_id = message.data.get('session_id', 'unknown')
                        model = message.data.get('model', 'unknown')
                        print(f"   Session ID: {session_id[:8]}...")
                        print(f"   Model: {model}")

                        # Show MCP server status
                        mcp_servers_status = message.data.get('mcp_servers', [])
                        if mcp_servers_status:
                            print("   MCP Servers:")
                            for server in mcp_servers_status:
                                status_icon = "✅" if server['status'] == 'connected' else "⚠️"
                                print(f"     {status_icon} {server['name']}: {server['status']}")

                # MESSAGE TYPE: AssistantMessage
                elif isinstance(message, AssistantMessage):
                    await process_assistant_message(message, text_outputs)

                # MESSAGE TYPE: ResultMessage (final summary)
                elif hasattr(message, 'subtype') and message.subtype == 'success':
                    print("\n" + "="*60)
                    print("✅ Research Complete!")
                    print("="*60)
                    if hasattr(message, 'duration_ms'):
                        duration_sec = message.duration_ms / 1000
                        print(f"⏱️  Duration: {duration_sec:.1f}s")
                    if hasattr(message, 'num_turns'):
                        print(f"🔄 Turns: {message.num_turns}")
                    if hasattr(message, 'total_cost_usd'):
                        print(f"💰 Cost: ${message.total_cost_usd:.4f}")
                    print("="*60)

            except Exception as e:
                print(f"❌ Error processing message: {e}")
                import traceback
                traceback.print_exc()

    # After all messages processed
    # Audio summary generation can be added here if needed



if __name__ == "__main__":
    asyncio.run(main())
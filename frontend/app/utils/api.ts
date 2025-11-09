export interface GeneratedContent {
  title: string;
  body: string;
  image?: string;
}

export interface NodeContext {
  id: string;
  title: string;
  content: string;
}

export interface GenerateRequest {
  user_query: string;
  selected_context?: string;
  path: string;
  context: Record<string, NodeContext>;
}

const PLACEHOLDER_IMAGES = [
  'https://upload.wikimedia.org/wikipedia/commons/b/bf/IMac_M4_2024_2_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Apple_logo_grey.svg/505px-Apple_logo_grey.svg.png',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/488px-Apple_logo_black.svg.png',
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export async function generateContent(
  userQuery: string,
  selectedContext: string | undefined,
  path: string,
  context: Record<string, NodeContext>
): Promise<GeneratedContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_query: userQuery,
        selected_context: selectedContext,
        path,
        context,
      } as GenerateRequest),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      title: data.title || userQuery,
      body: data.response || '',
      // image: PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)],
    };
  } catch (error) {
    console.error('Failed to generate content:', error);
    throw error;
  }
}

export interface StreamEvent {
  type: 'status' | 'tool' | 'final' | 'error';
  text?: string;
  name?: string;
  details?: Record<string, any>;
  title?: string;
  response?: string;
  suggested_questions?: string[];
  message?: string;
}

export interface ResearchStreamCallbacks {
  onStatus?: (text: string) => void;
  onTool?: (name: string, details: Record<string, any>) => void;
  onFinal?: (title: string, response: string, suggestedQuestions: string[]) => void;
  onError?: (message: string) => void;
}

export interface ResearchStreamHandle {
  close: () => void;
}

export function startResearchStream(
  nodeId: string,
  userQuery: string,
  path: string,
  context: Record<string, NodeContext>,
  selectedContext?: string,
  callbacks?: ResearchStreamCallbacks
): ResearchStreamHandle {
  const ws = new WebSocket(`${WS_BASE_URL}/ws/research`);
  
  ws.onopen = () => {
    // Send initial request
    ws.send(JSON.stringify({
      nodeId,
      userQuery,
      selectedContext,
      path,
      context,
    }));
  };
  
  ws.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data);
      console.log('📨 WebSocket event received:', data.type, data);
      
      switch (data.type) {
        case 'status':
          if (data.text && callbacks?.onStatus) {
            callbacks.onStatus(data.text);
          }
          break;
          
        case 'tool':
          if (data.name && callbacks?.onTool) {
            callbacks.onTool(data.name, data.details || {});
          }
          break;
          
        case 'final':
          console.log('🎯 Final event received:', { 
            hasTitle: !!data.title, 
            hasResponse: !!data.response,
            title: data.title,
            response: data.response?.substring(0, 50)
          });
          if (callbacks?.onFinal) {
            // Call even if title or response is missing (use defaults)
            callbacks.onFinal(
              data.title || 'Response',
              data.response || 'No response generated',
              data.suggested_questions || []
            );
          }
          ws.close();
          break;
          
        case 'error':
          console.error('❌ Error event received:', data.message);
          if (data.message && callbacks?.onError) {
            callbacks.onError(data.message);
          }
          ws.close();
          break;
          
        default:
          console.warn('⚠️ Unknown event type:', data.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, event.data);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (callbacks?.onError) {
      callbacks.onError('WebSocket connection error');
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket closed');
  };
  
  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    },
  };
}


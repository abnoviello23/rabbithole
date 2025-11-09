export interface Subtopic {
  title: string;
  category: string;
}

export interface GeneratedContent {
  title: string;
  body: string;
  image?: string;
  subtopics?: Subtopic[];
  suggestedQuestions?: string[];
}

export interface NodeContext {
  id: string;
  title: string;
  content: string;
  // Agent metadata - includes research process for agent-generated nodes
  statusUpdates?: string[];  // Tool calls, thoughts, research steps
  sources?: Source[];        // Research sources with URLs
  sourcesCount?: number;     // Number of sources researched
  isAgentNode?: boolean;     // Flag indicating this was agent-generated
  query?: string;            // Original query that created this node
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
      subtopics: data.subtopics || [],
      suggestedQuestions: data.suggested_questions || [],
      // image: PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)],
    };
  } catch (error) {
    console.error('Failed to generate content:', error);
    throw error;
  }
}

export interface AutoModeResult {
  node_id: string;
  similarity: number;
}

export async function autoMode(
  query: string,
  nodes: Record<string, NodeContext>
): Promise<AutoModeResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/automode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        nodes,
      }),
    });

    if (!response.ok) {
      throw new Error(`Auto mode request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      node_id: data.node_id,
      similarity: data.similarity,
    };
  } catch (error) {
    console.error('Failed to run auto mode:', error);
    throw error;
  }
}

export interface ClusterResult {
  [clusterTitle: string]: string[]; // cluster title -> array of node IDs
}

export async function clusterNodes(
  nodes: Record<string, NodeContext>
): Promise<ClusterResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/cluster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: nodes,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cluster request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to cluster nodes:', error);
    throw error;
  }
}


export interface Source {
  url: string;
  title?: string;
}

export interface AgentEvent {
  type: 'status' | 'tool' | 'final' | 'error' | 'sources' | 'node_created';
  text?: string;
  name?: string;
  details?: any;
  title?: string;
  response?: string;
  suggested_questions?: string[];
  message?: string;
  sources?: Source[];
  // For node_created events
  node_id?: string;
  source_id?: string;
  body?: string;
  user_query?: string;
}

export interface AgentResearchResult {
  title: string;
  body: string;
  suggested_questions: string[];
}

export async function researchWithAgent(
  nodeId: string,
  userQuery: string,
  path: string,
  context: Record<string, NodeContext>,
  selectedContext?: string,
  onEvent?: (event: AgentEvent) => void
): Promise<AgentResearchResult> {
  return new Promise((resolve, reject) => {
    const WS_BASE_URL = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');
    const ws = new WebSocket(`${WS_BASE_URL}/ws/research`);

    let finalResult: AgentResearchResult | null = null;

    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      // Send initial request
      ws.send(JSON.stringify({
        nodeId,
        userQuery,
        path,
        context,
        selectedContext,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data: AgentEvent = JSON.parse(event.data);
        console.log('📨 Received event:', data.type, data);

        // Call the event callback if provided
        if (onEvent) {
          onEvent(data);
        }

        // Handle final event
        if (data.type === 'final') {
          finalResult = {
            title: data.title || userQuery,
            body: data.response || '',
            suggested_questions: data.suggested_questions || [],
          };
          ws.close();
        }

        // Handle error event
        if (data.type === 'error') {
          ws.close();
          reject(new Error(data.message || 'Agent research failed'));
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      reject(new Error('WebSocket connection failed'));
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      if (finalResult) {
        resolve(finalResult);
      } else {
        reject(new Error('WebSocket closed without final result'));
      }
    };
  });
}


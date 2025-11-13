export interface Subtopic {
  title: string;
  category: string;
}

export interface CostInfo {
  used: number;
  max_total: number;
}

// ============================================================================
// MINIMAL SESSION STORAGE TYPES (matches backend models)
// ============================================================================

export interface MinimalEdgeData {
  color?: string;
  userQuery?: string;
  selectedContext?: string;
  sourceType?: string; // 'button_follow_up', 'text_selection_follow_up', 'suggested_follow_up'
}

export interface MinimalEdge {
  source: string;
  target: string;
  label?: string;
  data?: MinimalEdgeData;
}

export interface CardNodeDataMinimal {
  title: string;
  body: string;
  image?: string;
  isLoading?: boolean;
  isRoot?: boolean;
  isSubtopic?: boolean;
  category?: string;
  color?: string;
  suggestedQuestions?: string[];
  subtopics?: Subtopic[];
  statusUpdates?: string[];
  sourcesCount?: number;
  sources?: Array<{ url: string; title?: string }>;
}

export interface MinimalNode {
  id: string;
  data: CardNodeDataMinimal;
}

export interface GraphState {
  sessionId: string;
  nodes: MinimalNode[];
  edges: MinimalEdge[];
}

export async function getCostInfo(idToken?: string): Promise<CostInfo> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/cost`, {
      method: 'GET',
    }, idToken);

    if (!response.ok) {
      throw new Error(`Cost info request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.cost_info;
  } catch (error) {
    // Re-throw AuthError so it can be handled by the component
    if (error instanceof AuthError) {
      throw error;
    }
    console.error('Failed to get cost info:', error);
    // Return default values on error (but not for auth errors)
    return { used: 0, max_total: 5.0 };
  }
}

export interface GeneratedContent {
  title: string;
  body: string;
  image?: string;
  subtopics?: Subtopic[];
  suggestedQuestions?: string[];
  costInfo?: CostInfo;
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

export interface UserSettings {
  length: 'short' | 'detailed';
  autoTopics: 3 | 5 | 7;
  customPrompt: string;
}

export interface GenerateRequest {
  user_query: string;
  selected_context?: string;
  path: string;
  context: Record<string, NodeContext>;
  session_id: string;
  settings?: UserSettings;
}

const PLACEHOLDER_IMAGES = [
  'https://upload.wikimedia.org/wikipedia/commons/b/bf/IMac_M4_2024_2_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Apple_logo_grey.svg/505px-Apple_logo_grey.svg.png',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/488px-Apple_logo_black.svg.png',
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Custom error class for authentication errors
export class AuthError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

// Global handler for auth errors - will be set by the app
let globalAuthErrorHandler: (() => void) | null = null;

/**
 * Set the global auth error handler (called from app components)
 * This will sign out the user when a 401 error occurs
 */
export function setAuthErrorHandler(handler: () => void) {
  globalAuthErrorHandler = handler;
}

/**
 * Handle 401 authentication errors by triggering sign out
 */
async function handleAuthError() {
  if (globalAuthErrorHandler) {
    globalAuthErrorHandler();
  } else {
    // Fallback: try to import and call signOut directly (client-side only)
    if (typeof window !== 'undefined') {
      const { signOut } = await import('next-auth/react');
      signOut({ callbackUrl: '/' });
    }
  }
}

// Helper function to get auth headers
function getAuthHeaders(idToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }

  return headers;
}

/**
 * Wrapper for fetch that handles 401 errors automatically
 */
async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  idToken?: string
): Promise<Response> {
  const headers = getAuthHeaders(idToken);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  // Handle 401 errors by triggering sign out
  if (response.status === 401) {
    handleAuthError();
    throw new AuthError('Unauthorized - please sign in again');
  }

  return response;
}

export async function generateContent(
  userQuery: string,
  selectedContext: string | undefined,
  path: string,
  context: Record<string, NodeContext>,
  sessionId: string,
  graphState?: GraphState,
  sourceType?: string,
  settings?: UserSettings,
  idToken?: string
): Promise<GeneratedContent> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/generate`, {
      method: 'POST',
      body: JSON.stringify({
        user_query: userQuery,
        selected_context: selectedContext,
        path,
        context,
        session_id: sessionId,
        graph_state: graphState,
        source_type: sourceType,
        settings,
      } as GenerateRequest),
    }, idToken);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      title: data.title || userQuery,
      body: data.response || '',
      subtopics: data.subtopics || [],
      suggestedQuestions: data.suggested_questions || [],
      costInfo: data.cost_info,
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
  costInfo?: CostInfo;
}

export async function autoMode(
  query: string,
  nodes: Record<string, NodeContext>,
  sessionId: string,
  graphState?: GraphState,
  sourceType?: string,
  idToken?: string
): Promise<AutoModeResult> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/automode`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        nodes,
        session_id: sessionId,
        graph_state: graphState,
        source_type: sourceType,
      }),
    }, idToken);

    if (!response.ok) {
      throw new Error(`Auto mode request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      node_id: data.node_id,
      similarity: data.similarity,
      costInfo: data.cost_info,
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
  nodes: Record<string, NodeContext>,
  sessionId: string,
  graphState?: GraphState,
  idToken?: string
): Promise<{ clusters: ClusterResult; costInfo?: CostInfo }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/cluster`, {
      method: 'POST',
      body: JSON.stringify({
        context: nodes,
        session_id: sessionId,
        graph_state: graphState,
      }),
    }, idToken);

    const responseText = await response.text();

    if (!response.ok) {
      let detail = responseText;

      try {
        const parsed = JSON.parse(responseText);
        if (parsed?.detail) {
          detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
        } else if (parsed?.error) {
          detail = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
        }
      } catch (parseError) {
        // keep original responseText if JSON parsing fails
      }

      const message = `Cluster request failed (${response.status} ${response.statusText}): ${detail || 'No additional details'}`;
      console.error(message);
      throw new Error(message);
    }

    const data = responseText ? JSON.parse(responseText) : {};

    // Extract cost_info and return it separately from clusters
    const { cost_info, ...clusters } = data;

    return {
      clusters: clusters as ClusterResult,
      costInfo: cost_info,
    };
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

// ============================================================================
// ANALYTICS & EVENT TRACKING
// ============================================================================

export interface UserEvent {
  event_type: string;
  event_category: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Track user interaction event for analytics
 */
export async function trackEvent(
  event: UserEvent,
  idToken?: string
): Promise<void> {
  try {
    await fetchWithAuth(`${API_BASE_URL}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    }, idToken);
  } catch (error) {
    // Re-throw AuthError so it can be handled (but typically we'll just ignore analytics errors)
    if (error instanceof AuthError) {
      // Don't throw - analytics failures shouldn't break the app
      console.debug('Auth error tracking event (user may need to sign in):', error);
    } else {
      // Silently fail for other errors - analytics shouldn't break the app
      console.debug('Failed to track event:', error);
    }
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export interface Session {
  session_id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  node_count: number;
  edge_count: number;
  is_active: boolean;
}

export interface SessionUpdateRequest {
  session_id: string;
  name?: string;
  node_count?: number;
  edge_count?: number;
}

/**
 * Create or update session metadata
 */
export async function updateSession(
  session: SessionUpdateRequest,
  idToken?: string
): Promise<void> {
  try {
    await fetchWithAuth(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      body: JSON.stringify(session),
    }, idToken);
  } catch (error) {
    // Re-throw AuthError so it can be handled
    if (error instanceof AuthError) {
      throw error;
    }
    // Silently fail for other errors - session sync shouldn't break the app
    console.debug('Failed to update session:', error);
  }
}

/**
 * List all sessions for the authenticated user
 */
export async function listSessions(idToken?: string): Promise<Session[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/sessions`, {
      method: 'GET',
    }, idToken);

    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status}`);
    }

    const data = await response.json();
    return data.sessions || [];
  } catch (error) {
    // Re-throw AuthError so it can be handled
    if (error instanceof AuthError) {
      throw error;
    }
    console.error('Failed to list sessions:', error);
    return [];
  }
}


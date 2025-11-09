export interface GeneratedContent {
  title: string;
  body: string;
  image: string;
}

export interface NodeContext {
  id: string;
  title: string;
  content: string;
}

export interface GenerateRequest {
  query: string;
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
  query: string,
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
        query,
        path,
        context,
      } as GenerateRequest),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      title: data.title || query,
      body: data.response || '',
      image: PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)],
    };
  } catch (error) {
    console.error('Failed to generate content:', error);
    throw error;
  }
}


export interface GeneratedContent {
  title: string;
  body: string;
  image: string;
}

const PLACEHOLDER_IMAGES = [
  'https://upload.wikimedia.org/wikipedia/commons/b/bf/IMac_M4_2024_2_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Apple_logo_grey.svg/505px-Apple_logo_grey.svg.png',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/488px-Apple_logo_black.svg.png',
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function generateContent(query: string): Promise<GeneratedContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: query,
        history: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.response || '';

    // Extract title from response (first sentence or first line, max 60 chars)
    let title = query;
    if (responseText) {
      const firstSentence = responseText.split(/[.!?]\s+/)[0];
      if (firstSentence && firstSentence.length <= 60) {
        title = firstSentence;
      } else if (responseText.length > 0) {
        title = responseText.substring(0, 60).trim();
        if (responseText.length > 60) {
          title += '...';
        }
      }
    }

    return {
      title: title,
      body: responseText,
      image: PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)],
    };
  } catch (error) {
    console.error('Failed to generate content:', error);
    throw error;
  }
}


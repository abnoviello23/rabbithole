/**
 * Single source of truth for subtopic node dimensions
 * Calculates size based on content to be spatially efficient
 */

export interface SubtopicDimensions {
  width: number;
  height: number;
}

/**
 * Calculate optimal dimensions for a subtopic node based on its content
 * @param title - The subtopic title text
 * @param hasCategory - Whether the subtopic has a category badge
 * @returns Calculated width and height
 */
export function calculateSubtopicDimensions(
  title: string,
  hasCategory: boolean = false
): SubtopicDimensions {
  // Font metrics (matching CardNode.tsx styling)
  const FONT_SIZE_PX = 10; // text-[10px]
  const CHAR_WIDTH = FONT_SIZE_PX * 0.5; // Compact character width for tight spacing
  const HORIZONTAL_PADDING = 12; // px-0.5 (0.5 * 4px * 2 sides) + border + small margin
  const VERTICAL_PADDING = 6; // p-1.5 (1.5 * 4px * 2 sides)
  const CATEGORY_BADGE_HEIGHT = 18; // text-[9px] + padding + margin
  const BORDER_WIDTH = 2;
  
  // Calculate width based on text length
  const textWidth = title.length * CHAR_WIDTH;
  const calculatedWidth = textWidth + HORIZONTAL_PADDING + BORDER_WIDTH;
  
  // Apply bounds to prevent too small or too large boxes (drastically reduced)
  const MIN_WIDTH = 70;
  const MAX_WIDTH = 100;
  const width = Math.min(Math.max(calculatedWidth, MIN_WIDTH), MAX_WIDTH);
  
  // Calculate height based on content
  const BASE_HEIGHT = FONT_SIZE_PX + VERTICAL_PADDING;
  const height = hasCategory 
    ? BASE_HEIGHT + CATEGORY_BADGE_HEIGHT + 4 // Extra spacing for category
    : BASE_HEIGHT + 8; // Minimum comfortable height
  
  // Debug logging
  console.log('📏 Subtopic sizing:', {
    title,
    textWidth,
    calculatedWidth,
    finalWidth: Math.round(width),
    finalHeight: Math.round(height)
  });
  
  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Get default dimensions for subtopic nodes (fallback)
 */
export function getDefaultSubtopicDimensions(): SubtopicDimensions {
  return {
    width: 80,
    height: 40
  };
}


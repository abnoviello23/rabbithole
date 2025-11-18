'use client';

import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';

interface CustomEdgeProps extends EdgeProps {
  isInActivePath?: boolean;
  isChatPanelOpen?: boolean;
}

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
  data,
  isInActivePath,
  isChatPanelOpen,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = (data as any)?.color;

  // Enhance style for active path only when chat panel is open
  const enhancedStyle = (isInActivePath && isChatPanelOpen)
    ? {
        ...style,
        strokeWidth: 3,
        stroke: color || '#60A5FA',
        filter: 'drop-shadow(0 0 4px rgba(96, 165, 250, 0.5))',
      }
    : style;

  // Truncate long labels to prevent UI crossovers
  // Full text is always available in the ChatPanel
  const MAX_LABEL_LENGTH = 60;
  const labelText = typeof label === 'string' ? label : String(label || '');
  const truncatedLabel = labelText.length > MAX_LABEL_LENGTH 
    ? labelText.slice(0, MAX_LABEL_LENGTH) + '...'
    : labelText;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={enhancedStyle} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${targetX}px,${targetY - 90}px)`,
              pointerEvents: 'all',
              maxWidth: '240px',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              boxShadow: (isInActivePath && isChatPanelOpen) ? `0 0 10px ${color || '#60A5FA'}40` : undefined,
            }}
            className="nodrag nopan bg-neutral-900 border-2 px-3 py-1.5 rounded-lg text-white text-base font-medium shadow-lg whitespace-normal break-words text-center select-text cursor-text"
            title={labelText.length > MAX_LABEL_LENGTH ? labelText : undefined}
          >
            {truncatedLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}


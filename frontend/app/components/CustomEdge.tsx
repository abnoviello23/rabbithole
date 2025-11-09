'use client';

import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';

interface CustomEdgeProps extends EdgeProps {
  isInActivePath?: boolean;
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

  // Enhance style for active path
  const enhancedStyle = isInActivePath
    ? {
        ...style,
        strokeWidth: 3,
        stroke: color || '#60A5FA',
        filter: 'drop-shadow(0 0 4px rgba(96, 165, 250, 0.5))',
      }
    : style;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={enhancedStyle} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 30}px)`,
              pointerEvents: 'all',
              maxWidth: '240px',
              borderColor: isInActivePath ? (color || '#60A5FA') : (color || 'rgba(255, 255, 255, 0.1)'),
              boxShadow: isInActivePath ? `0 0 10px ${color || '#60A5FA'}40` : undefined,
            }}
            className="nodrag nopan bg-neutral-900 border-2 px-3 py-1.5 rounded-lg text-white text-base font-medium shadow-lg whitespace-normal break-words text-center select-text cursor-text"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

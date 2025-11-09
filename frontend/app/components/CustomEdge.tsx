'use client';

import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';

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
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = (data as any)?.color;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 30}px)`,
              pointerEvents: 'all',
              maxWidth: '240px',
              borderColor: color || 'rgba(255, 255, 255, 0.1)',
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

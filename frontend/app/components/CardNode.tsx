'use client';

import { useState } from 'react';
import { Handle, Position, NodeProps, NodeToolbar } from 'reactflow';

export interface CardNodeData {
  title: string;
  body: string;
  image: string;
  isLoading?: boolean;
}

interface CardNodeComponentProps extends NodeProps<CardNodeData> {
  onAddNote?: (sourceId: string, text: string) => void;
}

export function CardNode({ data, id, onAddNote }: CardNodeComponentProps) {
  const [show, setShow] = useState(false);

  return (
    <>
      <NodeToolbar isVisible={show} position={Position.Right}>
        <div className="rounded-xl border border-white/10 bg-neutral-900 text-neutral-100 shadow-xl p-2 w-64">
          <input
            autoFocus
            placeholder="Type and press Enter"
            className="w-full rounded-lg bg-neutral-800 px-2 py-1 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onAddNote?.(id, e.currentTarget.value.trim());
                e.currentTarget.value = '';
                setShow(false);
              }
            }}
          />
        </div>
      </NodeToolbar>

      <div
        className="cursor-default nopan relative rounded-3xl border border-white/10 bg-neutral-900/90 text-neutral-100 shadow-2xl overflow-hidden"
        style={{ width: 400, minHeight: 340 }}
      >
        <div className="flex flex-col gap-2 min-h-full">
          {data.isLoading ? (
            <div className="p-6 flex items-center justify-center flex-1">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
                <p className="text-sm text-neutral-400">Generating content...</p>
              </div>
            </div>
          ) : (
            <>
              <img src={data.image} alt="" className="col-span-2 p-6 object-contain max-h-64" />
              <div className="col-span-3 p-6">
                <h2 className="text-xl font-semibold mb-2 select-text">{data.title}</h2>
                <p className="text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap select-text">
                  {data.body}
                </p>
              </div>
            </>
          )}
        </div>

        {!data.isLoading && (
          <div
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            className="absolute top-1/2 -right-6 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-text text-xl"
            title="Add note/link"
          >
            +
          </div>
        )}

        <Handle type="source" position={Position.Right} id="r" />
        <Handle type="target" position={Position.Left} id="l" />
      </div>
    </>
  );
}

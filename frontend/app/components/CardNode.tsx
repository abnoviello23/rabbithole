'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeToolbar } from 'reactflow';
import { MessageSquarePlus, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface CardNodeData {
  title: string;
  body: string;
  image?: string;
  isLoading?: boolean;
  isRoot?: boolean;
}

interface CardNodeComponentProps extends NodeProps<CardNodeData> {
  onAddNote?: (sourceId: string, text: string) => void;
}

export function CardNode({ data, id, onAddNote }: CardNodeComponentProps) {
  const [show, setShow] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  console.log(">> CardNode: ", id, data);
}, [id, data]);
  // Handle click outside to close the input
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (show && toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [show]);

  return (
    <>
      <NodeToolbar isVisible={show} position={Position.Right}>
        <div
          ref={toolbarRef}
          className="rounded-xl border border-white/10 bg-neutral-900 text-neutral-100 shadow-xl p-2 w-64"
        >
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
        style={{ width: 400 }}
      >
        <div className="flex flex-col gap-2 min-h-full">
          {data.isRoot ? (
            <div className="p-8 flex flex-col gap-4 justify-center flex-1">
              <h2 className="text-2xl font-semibold text-center">Start Your Journey</h2>
              <input
                autoFocus
                placeholder="Ask your first question..."
                className="w-full rounded-lg bg-neutral-800 border border-white/10 px-4 py-3 text-base outline-none focus:border-white/30 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    onAddNote?.(id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
          ) : data.isLoading ? (
            <div className="p-6 flex items-center justify-center flex-1">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
                <p className="text-sm text-neutral-400">Generating content...</p>
              </div>
            </div>
          ) : (
            <>
              {data.image && (
                <img src={data.image} alt="" className="col-span-2 p-6 object-contain max-h-64" />
              )}
              <div className="col-span-3 p-6">
                <h2 className="text-xl font-semibold mb-2 select-text cursor-text">{data.title}</h2>
                <div className="text-sm leading-relaxed text-neutral-300 select-text cursor-text prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, children, href, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline text-blue-400 hover:text-blue-300 transition-colors"
                          {...props}
                        >
                          {children}
                          <ExternalLink className="w-3 h-3 inline-block" />
                        </a>
                      ),
                    }}
                  >
                    {data.body}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>

        {!data.isLoading && !data.isRoot && (
          <div
            onClick={() => setShow(!show)}
            className="absolute top-1/2 right-0 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer transition-colors"
            title="Ask a follow-up question"
          >
            <MessageSquarePlus className="w-6 h-6" />
          </div>
        )}

        <Handle type="source" position={Position.Right} id="r" />
        {!data.isRoot && <Handle type="target" position={Position.Left} id="l" />}
      </div>
    </>
  );
}

'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
  nodeId: string;
  title: string;
  body: string;
  query?: string; // The query/edge label that led to this node
  color?: string;
  isRoot?: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lineage: ChatMessage[];
}

export function ChatPanel({ isOpen, onClose, lineage }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when lineage changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lineage]);

  if (!isOpen) return null;

  return (
    <div
      className="w-1/3 h-full bg-neutral-900/95 backdrop-blur-md border-l border-white/10 shadow-2xl flex flex-col"
      style={{
        animation: 'slideIn 300ms ease-in-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">Conversation Path</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        {lineage.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Select a node to view its conversation path
          </div>
        ) : (
          lineage.map((message, index) => (
            <div key={message.nodeId} className="flex flex-col gap-2">
              {/* Query/Question (except for root) */}
              {message.query && !message.isRoot && (
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] px-4 py-2 rounded-2xl border-2 text-sm"
                    style={{
                      backgroundColor: message.color ? `${message.color}20` : 'rgba(96, 165, 250, 0.2)',
                      borderColor: message.color || '#60A5FA',
                    }}
                  >
                    <p className="text-white font-medium">{message.query}</p>
                  </div>
                </div>
              )}

              {/* Response */}
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-neutral-800 rounded-2xl p-4 border border-white/10">
                  <h3 className="font-semibold text-white mb-2">{message.title}</h3>
                  <div className="text-sm text-neutral-300 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.body}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

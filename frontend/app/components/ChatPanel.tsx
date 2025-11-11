'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
  nodeId: string;
  title: string;
  body: string;
  userQuery?: string; // The user's question
  selectedContext?: string; // The text that was selected when asking
  color?: string;
  isRoot?: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lineage: ChatMessage[];
  onStartWalkthrough?: () => void;
}

interface MessageHighlight {
  messageIndex: number;
  range: Range;
  color: string;
}

export function ChatPanel({ isOpen, onClose, lineage, onStartWalkthrough }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [highlights, setHighlights] = useState<MessageHighlight[]>([]);

  // Auto-scroll to bottom when lineage changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lineage]);

  // Utility function to find text in DOM and create a Range
  const findTextRange = (searchText: string, containerNode: HTMLElement | null): Range | null => {
    if (!containerNode || !searchText) return null;

    const walker = document.createTreeWalker(
      containerNode,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textContent = node.textContent || '';
      const index = textContent.indexOf(searchText);

      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + searchText.length);
        return range;
      }
    }

    return null;
  };

  // Create highlights from lineage data
  useEffect(() => {
    if (!isOpen || lineage.length === 0) return;

    // Small delay to ensure ReactMarkdown has rendered
    const timeoutId = setTimeout(() => {
      const newHighlights: MessageHighlight[] = [];

      // For each message, find which subsequent messages selected text from it
      lineage.forEach((message, messageIndex) => {
        const messageElement = messageRefs.current.get(messageIndex);
        if (!messageElement) return;

        // Look at all subsequent messages
        for (let i = messageIndex + 1; i < lineage.length; i++) {
          const nextMessage = lineage[i];
          if (nextMessage.selectedContext && nextMessage.color) {
            const range = findTextRange(nextMessage.selectedContext, messageElement);
            if (range) {
              newHighlights.push({
                messageIndex,
                range: range,
                color: nextMessage.color,
              });
            }
          }
        }
      });

      setHighlights(newHighlights);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [lineage, isOpen]);

  // Apply CSS highlights
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      try {
        // Clear all chat highlights
        let i = 0;
        while (CSS.highlights.has(`chat-highlight-${i}`)) {
          CSS.highlights.delete(`chat-highlight-${i}`);
          i++;
        }

        // Add all highlights
        highlights.forEach((h, index) => {
          const highlight = new Highlight(h.range);
          CSS.highlights.set(`chat-highlight-${index}`, highlight);
        });

        return () => {
          let i = 0;
          while (CSS.highlights.has(`chat-highlight-${i}`)) {
            CSS.highlights.delete(`chat-highlight-${i}`);
            i++;
          }
        };
      } catch (e) {
        console.log('Highlight API not supported', e);
      }
    }
  }, [highlights]);

  if (!isOpen) return null;

  return (
    <>
      {/* Dynamic CSS for highlights */}
      <style dangerouslySetInnerHTML={{
        __html: `
          ${highlights.map((h, index) => `
            ::highlight(chat-highlight-${index}) {
              background-color: ${h.color}40;
              color: inherit;
            }
          `).join('\n')}
        `
      }} />

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
              {message.userQuery && !message.isRoot && (
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] px-4 py-2 rounded-2xl border-2 text-sm flex flex-col gap-2"
                    style={{
                      backgroundColor: message.color ? `${message.color}20` : 'rgba(96, 165, 250, 0.2)',
                      borderColor: message.color || '#60A5FA',
                    }}
                  >
                    {message.selectedContext && (
                      <div
                        className="px-3 py-2 rounded-lg border-l-4"
                        style={{
                          borderLeftColor: message.color || '#60A5FA',
                          backgroundColor: message.color ? `${message.color}40` : 'rgba(96, 165, 250, 0.4)',
                        }}
                      >
                        <p className="text-white text-xs font-medium">"{message.selectedContext}"</p>
                      </div>
                    )}
                    <p className="text-white font-medium">{message.userQuery}</p>
                  </div>
                </div>
              )}

              {/* Response */}
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-neutral-800 rounded-2xl p-4 border border-white/10">
                  <h3 className="font-semibold text-white mb-2">{message.title}</h3>
                  <div
                    ref={(el) => {
                      if (el) {
                        messageRefs.current.set(index, el);
                      }
                    }}
                    className="text-sm text-neutral-300 prose prose-invert prose-sm max-w-none"
                  >
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
      
      {/* Footer actions */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => onStartWalkthrough && onStartWalkthrough()}
          disabled={lineage.length === 0}
          className="w-full px-4 py-3 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white text-sm font-medium"
          title="Start a guided walkthrough for this conversation path"
        >
          Start Walkthrough
        </button>
      </div>
      </div>
    </>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles } from 'lucide-react';

interface FloatingChatProps {
  onQuerySubmit: (query: string) => Promise<void>;
}

export function FloatingChat({ onQuerySubmit }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [matchedNode, setMatchedNode] = useState<{ title: string; similarity: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!query.trim() || isProcessing) return;

    setIsProcessing(true);
    setStatus('Finding best match...');
    setMatchedNode(null);

    try {
      await onQuerySubmit(query);

      // Close dialog after successful submission
      setTimeout(() => {
        setIsOpen(false);
        setQuery('');
        setStatus('');
        setMatchedNode(null);
      }, 1500);
    } catch (error) {
      console.error('Failed to process query:', error);
      setStatus('Error processing query');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 group"
        title="Quick Chat"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageSquare className="w-6 h-6 text-white group-hover:animate-pulse" />
        )}
      </button>

      {/* Chat Dialog */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-50 w-96 bg-neutral-900/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-300"
          style={{
            animation: 'slideUp 300ms ease-out',
          }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500/20 to-purple-600/20 border-b border-white/10 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Quick Chat</h3>
            </div>
            <p className="text-sm text-neutral-400 mt-1">
              Ask anything - I'll find the best match and respond
            </p>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Matched Node Info */}
            {matchedNode && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="text-xs text-blue-400 font-medium mb-1">Matched Node</div>
                <div className="text-sm text-white">{matchedNode.title}</div>
                <div className="text-xs text-neutral-400 mt-1">
                  Similarity: {(matchedNode.similarity * 100).toFixed(1)}%
                </div>
              </div>
            )}

            {/* Status */}
            {status && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-purple-400">{status}</span>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to explore?"
                disabled={isProcessing}
                className="w-full px-4 py-3 pr-12 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-neutral-500 outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSubmit}
                disabled={!query.trim() || isProcessing}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
                title="Submit"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Help Text */}
            {!isProcessing && (
              <p className="text-xs text-neutral-500 mt-2">
                Press Enter to submit
              </p>
            )}
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

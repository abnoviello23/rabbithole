'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow } from 'reactflow';
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
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string; range: Range } | null>(null);
  const selectionPopupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const { getZoom } = useReactFlow();

useEffect(() => {
  console.log(">> CardNode: ", id, data);
}, [id, data]);

  // Handle text selection on mouse up
  const handleTextSelection = () => {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      console.log('Selection:', selectedText, 'ContentRef:', contentRef.current);

      if (selectedText && contentRef.current?.contains(selection?.anchorNode || null)) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        const nodeRect = nodeRef.current?.getBoundingClientRect();

        console.log('Selection rect:', rect);
        console.log('Node rect:', nodeRect);

        if (rect && range && nodeRect) {
          // Get current zoom level
          const zoom = getZoom();

          // Calculate position relative to node, accounting for zoom
          // getBoundingClientRect gives zoomed coordinates, so divide by zoom to get actual position
          const x = (rect.left - nodeRect.left) / zoom + rect.width / (2 * zoom);
          const y = (rect.top - nodeRect.top) / zoom;

          console.log('Zoom:', zoom);
          console.log('Selection rect:', { left: rect.left, top: rect.top, width: rect.width });
          console.log('Node rect:', { left: nodeRect.left, top: nodeRect.top });
          console.log('Calculated position:', { x, y });

          setSelectionPopup({
            x,
            y,
            text: selectedText,
            range: range.cloneRange(), // Clone to preserve the range
          });
          console.log('Popup set!');
        }
      }
    }, 10);
  };

  // Create custom highlight for selected text
  useEffect(() => {
    if (selectionPopup?.range && typeof CSS !== 'undefined' && CSS.highlights) {
      try {
        // Create a highlight using the CSS Custom Highlight API
        const highlight = new Highlight(selectionPopup.range);
        CSS.highlights.set('text-selection-highlight', highlight);

        return () => {
          // Clean up the highlight when popup closes
          CSS.highlights.delete('text-selection-highlight');
        };
      } catch (e) {
        console.log('Highlight API not supported', e);
      }
    }
  }, [selectionPopup]);

  // Handle click outside to close the input and selection popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      console.log('click outside');
      const target = event.target as Node;

      if (show && toolbarRef.current && !toolbarRef.current.contains(target)) {
        setShow(false);
      }
      if (selectionPopup && selectionPopupRef.current && !selectionPopupRef.current.contains(target)) {
        setSelectionPopup(null);
      }
    };

    if (show || selectionPopup) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [show, selectionPopup]);

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
        ref={nodeRef}
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
              <div className="col-span-3 p-6" ref={contentRef} onMouseUp={handleTextSelection}>
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

        {/* Selection popup - positioned relative to node */}
        {selectionPopup && (
          <div
            ref={selectionPopupRef}
            style={{
              position: 'absolute',
              left: `${selectionPopup.x}px`,
              top: `${selectionPopup.y}px`,
              transform: 'translate(-50%, calc(-100% - 8px))',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
            className="rounded-xl border border-white/20 bg-black/40 backdrop-blur-sm text-neutral-100 shadow-2xl p-2 w-64"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={(input) => { if (input) setTimeout(() => input.focus(), 0); }}
              placeholder="question"
              className="w-full rounded-lg bg-transparent px-2 py-1 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const query = `${e.currentTarget.value.trim()}${selectionPopup.text ? ` (user selected the following text: "${selectionPopup.text}" and is asking about it)` : ''}`;
                  console.log("query: ", query);
                  onAddNote?.(id, query);
                  e.currentTarget.value = '';
                  setSelectionPopup(null);
                }
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}

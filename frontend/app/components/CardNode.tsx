'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow, Edge } from 'reactflow';
import { MessageSquarePlus, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Color palette for highlights, edges, and nodes
const COLOR_PALETTE = [
  '#60A5FA', // blue
  '#34D399', // green
  '#A78BFA', // purple
  '#FB923C', // orange
  '#F472B6', // pink
  '#2DD4BF', // teal
  '#FBBF24', // yellow
  '#F87171', // red
];

// Get consistent color for a category (hash-based)
function getCategoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export interface CardNodeData {
  title: string;
  body: string;
  image?: string;
  isLoading?: boolean;
  isRoot?: boolean;
  isSubtopic?: boolean;
  category?: string;
  color?: string;
}

interface CardNodeComponentProps extends NodeProps<CardNodeData> {
  onAddNote?: (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => void;
  onNodeClick?: (nodeId: string) => void;
  isInActivePath?: boolean;
  isSelected?: boolean;
  isChatPanelOpen?: boolean;
  edges?: Edge[];
}

interface PersistentHighlight {
  range: Range;
  color: string;
  nodeId: string;
}

export function CardNode({ data, id, onAddNote, onNodeClick, isInActivePath, isSelected, isChatPanelOpen, edges }: CardNodeComponentProps) {
  const [show, setShow] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string; range: Range; color: string } | null>(null);
  const [persistentHighlights, setPersistentHighlights] = useState<PersistentHighlight[]>([]);
  const selectionPopupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const { getZoom } = useReactFlow();

useEffect(() => {
  console.log(">> CardNode: ", id, data);
}, [id, data]);

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

  // Recreate highlights from edge data when component mounts or edges change
  useEffect(() => {
    if (!edges || !contentRef.current || data.isRoot || data.isLoading || !data.body) return;

    // Small delay to ensure ReactMarkdown has rendered the content into the DOM
    const timeoutId = setTimeout(() => {
      // Find all outgoing edges from this node
      const outgoingEdges = edges.filter(edge => edge.source === id);

      // Recreate highlights from edges with selectedContext
      const recreatedHighlights: PersistentHighlight[] = [];

      outgoingEdges.forEach(edge => {
        const edgeData = edge.data as any;
        if (edgeData?.selectedContext && edgeData?.color) {
          const range = findTextRange(edgeData.selectedContext, contentRef.current);
          if (range) {
            recreatedHighlights.push({
              range: range,
              color: edgeData.color,
              nodeId: edge.target,
            });
          }
        }
      });

      // Only update if we found highlights
      if (recreatedHighlights.length > 0) {
        setPersistentHighlights(recreatedHighlights);
      }
    }, 100); // Small delay to wait for ReactMarkdown to render

    return () => clearTimeout(timeoutId);
  }, [edges, id, data.isRoot, data.isLoading, data.body]);

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

          // Pick a random color for this selection
          const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];

          console.log('Zoom:', zoom);
          console.log('Selection rect:', { left: rect.left, top: rect.top, width: rect.width });
          console.log('Node rect:', { left: nodeRect.left, top: nodeRect.top });
          console.log('Calculated position:', { x, y });
          console.log('Selected color:', color);

          setSelectionPopup({
            x,
            y,
            text: selectedText,
            range: range.cloneRange(), // Clone to preserve the range
            color,
          });
          console.log('Popup set!');
        }
      }
    }, 10);
  };

  // Create custom highlights for selected text (both temporary and persistent)
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      try {
        // Clear only this component's highlights (using node id)
        CSS.highlights.delete(`temp-highlight-${id}`);

        // Clear old persistent highlights for this node
        let i = 0;
        while (CSS.highlights.has(`persistent-highlight-${id}-${i}`)) {
          CSS.highlights.delete(`persistent-highlight-${id}-${i}`);
          i++;
        }

        // Add temporary selection highlight for this node (always shown during selection)
        if (selectionPopup?.range) {
          const highlight = new Highlight(selectionPopup.range);
          CSS.highlights.set(`temp-highlight-${id}`, highlight);
        }

        // Add all persistent highlights (always shown)
        persistentHighlights.forEach((h, index) => {
          const highlight = new Highlight(h.range);
          CSS.highlights.set(`persistent-highlight-${id}-${index}`, highlight);
        });

        // Cleanup on unmount
        return () => {
          CSS.highlights.delete(`temp-highlight-${id}`);
          let i = 0;
          while (CSS.highlights.has(`persistent-highlight-${id}-${i}`)) {
            CSS.highlights.delete(`persistent-highlight-${id}-${i}`);
            i++;
          }
        };
      } catch (e) {
        console.log('Highlight API not supported', e);
      }
    }
  }, [selectionPopup, persistentHighlights, id]);

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
      {/* Dynamic CSS for highlights with their colors */}
      <style dangerouslySetInnerHTML={{
        __html: `
          ${selectionPopup ? `
            ::highlight(temp-highlight-${id}) {
              background-color: ${selectionPopup.color}40;
              color: inherit;
            }
          ` : ''}
          ${persistentHighlights.map((h, index) => `
            ::highlight(persistent-highlight-${id}-${index}) {
              background-color: ${h.color}40;
              color: inherit;
            }
          `).join('\n')}
        `
      }} />

      <NodeToolbar isVisible={show} position={Position.Bottom}>
        <div
          ref={toolbarRef}
          className="rounded-xl border border-white/10 bg-neutral-900 text-neutral-100 shadow-xl p-2 w-64"
        >
          <input
            autoFocus
            placeholder="Ask a Follow-up Question"
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

      {/* Wrapper for node and external button */}
      <div className="relative">
        <div
          ref={nodeRef}
          onClick={(e) => {
            // Only trigger node click if clicking on the node itself, not text or interactive elements
            const target = e.target as HTMLElement;
            const isClickOnText = target.closest('.select-text, input, button, a');
            if (!isClickOnText && onNodeClick) {
              onNodeClick(id);
            }
          }}
          className="cursor-pointer nopan relative rounded-3xl border-2 bg-neutral-900/90 text-neutral-100 shadow-2xl overflow-hidden transition-all"
          style={{
            width: data.isSubtopic ? undefined : 500, // Subtopics use their calculated width, regular nodes use 500px
            borderColor: data.color || 'rgba(255, 255, 255, 0.1)',
            boxShadow: isSelected && isChatPanelOpen
              ? `0 0 0 4px ${data.color || '#60A5FA'}40, 0 0 30px ${data.color || '#60A5FA'}80`
              : isInActivePath && isChatPanelOpen
              ? `0 0 0 3px ${data.color || '#60A5FA'}30, 0 0 20px ${data.color || '#60A5FA'}40`
              : undefined,
          }}
        >
        <div className="flex flex-col gap-2 min-h-full">
          {data.isRoot ? (
            <div className="p-8 flex flex-col gap-4 justify-center flex-1">
              <h2 className="text-2xl font-semibold text-center">What's your rabbit hole? 🐰</h2>
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
          ) : data.isSubtopic ? (
            <div 
              className="p-1.5 flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-white/5 transition-colors overflow-hidden"
              style={{
                borderLeft: data.category ? `2px solid ${getCategoryColor(data.category)}` : undefined,
              }}
              onClick={() => {
                if (onAddNote) {
                  onAddNote(id, data.title);
                }
              }}
              title={`Explore: ${data.title}${data.category ? ` (${data.category})` : ''}`}
            >
              <h3 className="text-[10px] font-semibold text-center select-text leading-tight px-0.5 wrap-break-word max-w-full">{data.title}</h3>
              {data.category && (
                <span 
                  className="text-[9px] mt-0.5 px-1 py-0.5 rounded-full whitespace-nowrap"
                  style={{ 
                    backgroundColor: `${getCategoryColor(data.category)}33`,
                    color: getCategoryColor(data.category),
                  }}
                >
                  {data.category}
                </span>
              )}
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
                <h2
                  className="text-xl font-semibold mb-2 select-text cursor-pointer"
                  onClick={(e) => {
                    // Only trigger if not selecting text
                    const selection = window.getSelection();
                    if (!selection || selection.toString().length === 0) {
                      onNodeClick?.(id);
                    }
                  }}
                  title="Click to open conversation path"
                >
                  {data.title}
                </h2>
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

        <Handle type="source" position={Position.Bottom} id="b" />
        {!data.isRoot && <Handle type="target" position={Position.Top} id="t" />}

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
                if (e.key === 'Enter' && e.currentTarget.value.trim() && selectionPopup) {
                  const userQuery = e.currentTarget.value.trim();
                  const selectedContext = selectionPopup.text;
                  console.log("userQuery:", userQuery, "selectedContext:", selectedContext);

                  // Generate a unique node ID for this new node
                  const newNodeId = `node-${Date.now()}`;

                  // Add to persistent highlights
                  setPersistentHighlights(prev => [...prev, {
                    range: selectionPopup.range,
                    color: selectionPopup.color,
                    nodeId: newNodeId,
                  }]);

                  // Call onAddNote with separate userQuery and selectedContext
                  onAddNote?.(id, userQuery, selectedContext, selectionPopup.color);

                  e.currentTarget.value = '';
                  setSelectionPopup(null);
                }
              }}
            />
          </div>
        )}
        </div>

        {/* Follow-up question button - positioned at bottom edge of parent node to avoid edge label overlap */}
        {!data.isLoading && !data.isRoot && !data.isSubtopic && (
          <div
            onClick={() => setShow(!show)}
            className="absolute left-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer transition-colors nopan z-10"
            style={{ bottom: '-24px', transform: 'translateX(-50%)' }}
            title="Ask a follow-up question"
          >
            <MessageSquarePlus className="w-6 h-6" />
          </div>
        )}
      </div>
    </>
  );
}

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

export interface CardNodeData {
  title: string;
  body: string;
  image?: string;
  isLoading?: boolean;
  isRoot?: boolean;
  color?: string;
  hasLogs?: boolean; // Whether this node has research logs
}

interface CardNodeComponentProps extends NodeProps<CardNodeData> {
  onAddNote?: (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => void;
  onNodeClick?: (nodeId: string) => void;
  isInActivePath?: boolean;
  isSelected?: boolean;
  isChatPanelOpen?: boolean;
  edges?: Edge[];
  liveLogs?: string[];
}

interface PersistentHighlight {
  range: Range;
  color: string;
  nodeId: string;
}

// Format a log message with clean styling
function formatLogMessage(log: string): { type: string; content: string; details?: string } {
  // Remove emoji prefixes and clean up
  const cleanLog = log.replace(/^🤖 Claude: /, '').replace(/^🛠️\s*Using tool: /, '');
  
  if (log.includes('Using tool:') || log.includes('🛠️')) {
    const toolMatch = cleanLog.match(/^([^\n]+)/);
    const toolName = toolMatch ? toolMatch[1].replace('mcp__exa__web_search_exa', 'Web Search').replace('mcp__openai-summary-tools__', '').replace(/_/g, ' ') : 'Tool';
    const details = log.split('\n').slice(1).join('\n').trim();
    return { type: 'tool', content: toolName, details };
  } else if (log.startsWith('🤖') || log.includes('Claude:')) {
    return { type: 'thinking', content: cleanLog };
  } else if (log.startsWith('❌')) {
    return { type: 'error', content: log.replace('❌ Error: ', '') };
  } else {
    return { type: 'info', content: log };
  }
}

export function CardNode({ data, id, onAddNote, onNodeClick, isInActivePath, isSelected, isChatPanelOpen, edges, liveLogs }: CardNodeComponentProps) {
  const [show, setShow] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string; range: Range; color: string } | null>(null);
  const [persistentHighlights, setPersistentHighlights] = useState<PersistentHighlight[]>([]);
  const selectionPopupRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const { getZoom } = useReactFlow();

  useEffect(() => {
    console.log(">> CardNode: ", id, data);
  }, [id, data]);

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current && liveLogs && liveLogs.length > 0) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);

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

      <NodeToolbar isVisible={show} position={Position.Right}>
        <div
          ref={toolbarRef}
          className="rounded-xl border ml-16 border-white/10 bg-neutral-900 text-neutral-100 shadow-xl p-2 w-64"
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
            width: 400,
            // if data is root, bg transparent
            backgroundColor: data.isRoot ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
            // if data is root, border transparent
            borderColor: data.isRoot ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: data.isRoot ? 'none' : isSelected && isChatPanelOpen
              ? `0 0 0 4px ${data.color || '#60A5FA'}40, 0 0 30px ${data.color || '#60A5FA'}80`
              : isInActivePath && isChatPanelOpen
              ? `0 0 0 3px ${data.color || '#60A5FA'}30, 0 0 20px ${data.color || '#60A5FA'}40`
              : data.isRoot ? 'none' : undefined,
          }}
        >
        <div className="flex flex-col gap-2 min-h-full">
          {data.isRoot ? (
            <div className="p-8 flex flex-col gap-4 justify-center flex-1">
              <h2 className="text-2xl font-semibold text-center font-fritzle"
              style={{
                fontSize: '2rem',
                fontFamily: 'fritzle',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
              }}
              >Start Your Journey</h2>
              <input
                autoFocus
                placeholder="Ask your first question..."
                className="w-full rounded-full bg-neutral-800  border-white/10 px-4 py-3 text-base outline-none focus:border-white/30 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    onAddNote?.(id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
          ) : data.isLoading ? (
            <div className="p-4 flex flex-col flex-1 overflow-hidden">
              {/* Header with spinner */}
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-neutral-700/50">
                <div className="w-6 h-6 border-3 border-neutral-700 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-sm font-medium text-emerald-400">Researching...</p>
              </div>
              
              {/* Live logs */}
              {liveLogs && liveLogs.length > 0 ? (
                <div className="flex-1 overflow-y-auto space-y-2">
                  {liveLogs.map((log, idx) => {
                    const formatted = formatLogMessage(log);
                    return (
                      <div key={idx} className="text-xs">
                        {formatted.type === 'tool' ? (
                          <div className="flex items-start gap-2 p-2 bg-blue-500/10 rounded border-l-2 border-blue-500">
                            <span className="text-blue-400 font-mono">▶</span>
                            <div className="flex-1">
                              <div className="font-medium text-blue-300">{formatted.content}</div>
                              {formatted.details && <div className="text-neutral-400 mt-1 font-mono text-[10px]">{formatted.details}</div>}
                            </div>
                          </div>
                        ) : formatted.type === 'thinking' ? (
                          <div className="flex items-start gap-2 p-2 text-neutral-300">
                            <span className="text-neutral-500">•</span>
                            <div className="flex-1">{formatted.content}</div>
                          </div>
                        ) : formatted.type === 'error' ? (
                          <div className="flex items-start gap-2 p-2 bg-red-500/10 rounded border-l-2 border-red-500">
                            <span className="text-red-400">✕</span>
                            <div className="flex-1 text-red-300">{formatted.content}</div>
                          </div>
                        ) : (
                          <div className="text-neutral-400 px-2">{formatted.content}</div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-neutral-500">Initializing research...</p>
                </div>
              )}
            </div>
          ) : liveLogs && liveLogs.length > 0 ? (
            // Show logs + response when complete
            <div className="flex flex-col flex-1">
              {/* Response */}
              <div className="p-6 border-b border-neutral-700/30" ref={contentRef} onMouseUp={handleTextSelection}>
                <h2
                  className="text-xl font-semibold mb-2 select-text cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
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
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                          {props.children}
                          <ExternalLink className="w-3 h-3 inline" />
                        </a>
                      ),
                    }}
                  >
                    {data.body}
                  </ReactMarkdown>
                </div>
              </div>
              
              {/* Research trace */}
              <div className="flex-1 overflow-y-auto bg-neutral-900/50">
                <div className="p-3 border-b border-neutral-700/30 bg-neutral-800/50">
                  <p className="text-xs font-medium text-neutral-400">Research Trace</p>
                </div>
                <div className="p-3 space-y-2">
                  {liveLogs.map((log, idx) => {
                    const formatted = formatLogMessage(log);
                    return (
                      <div key={idx} className="text-xs">
                        {formatted.type === 'tool' ? (
                          <div className="flex items-start gap-2 p-2 bg-blue-500/10 rounded border-l-2 border-blue-500">
                            <span className="text-blue-400 font-mono">▶</span>
                            <div className="flex-1">
                              <div className="font-medium text-blue-300">{formatted.content}</div>
                              {formatted.details && <div className="text-neutral-400 mt-1 font-mono text-[10px]">{formatted.details}</div>}
                            </div>
                          </div>
                        ) : formatted.type === 'thinking' ? (
                          <div className="flex items-start gap-2 p-2 text-neutral-300">
                            <span className="text-neutral-500">•</span>
                            <div className="flex-1">{formatted.content}</div>
                          </div>
                        ) : formatted.type === 'error' ? (
                          <div className="flex items-start gap-2 p-2 bg-red-500/10 rounded border-l-2 border-red-500">
                            <span className="text-red-400">✕</span>
                            <div className="flex-1 text-red-300">{formatted.content}</div>
                          </div>
                        ) : (
                          <div className="text-neutral-400 px-2">{formatted.content}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {data.image && (
                <img src={data.image} alt="" className="col-span-2 p-6 object-contain max-h-64" />
              )}
              <div className="col-span-3 p-6" ref={contentRef} onMouseUp={handleTextSelection}>
                <h2
                  className="text-xl font-semibold mb-2 select-text cursor-pointer hover:opacity-80 transition-opacity"
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

        {/* Follow-up question button - outside node */}
        {!data.isLoading && !data.isRoot && (
          <div
            onClick={() => setShow(!show)}
            className="absolute top-1/2 -mt-8 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer transition-colors nopan"
            style={{ left: '100%', marginLeft: '8px' }}
            title="Ask a follow-up question"
          >
            <MessageSquarePlus className="w-6 h-6" />
          </div>
        )}
      </div>
    </>
  );
}

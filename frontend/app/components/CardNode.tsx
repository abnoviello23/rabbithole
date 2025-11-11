'use client';

import { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow, Edge } from 'reactflow';
import { MessageSquarePlus, ExternalLink, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Color palette ordered for maximum contrast - opposite/complementary colors spaced apart
// This ensures clusters get colors that are visually distinct
const COLOR_PALETTE = [
  '#60A5FA', // blue (0°)
  '#FB923C', // orange (30°) - complementary to blue
  '#34D399', // green (150°) - opposite to red/pink
  '#F472B6', // pink (330°) - opposite to green
  '#FBBF24', // yellow (60°) - between orange and green
  '#A78BFA', // purple (270°) - opposite to yellow
  '#F87171', // red (0°) - opposite to cyan/teal
  '#2DD4BF', // teal (180°) - opposite to red
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

// Calculate color distance in RGB space (Euclidean distance)
function colorDistance(color1: string, color2: string): number {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2));
}

// Assign colors to clusters maximizing contrast between all clusters
export function assignClusterColors(clusterTitles: string[]): Record<string, string> {
  if (clusterTitles.length === 0) return {};
  
  // Sort titles for consistent ordering
  const sortedTitles = [...clusterTitles].sort();
  const assignments: Record<string, string> = {};
  const usedColors = new Set<string>();
  
  // For each cluster, assign the color that maximizes minimum distance to all already assigned colors
  for (const title of sortedTitles) {
    if (usedColors.size === 0) {
      // First cluster gets the first color
      assignments[title] = COLOR_PALETTE[0];
      usedColors.add(COLOR_PALETTE[0]);
    } else if (usedColors.size < COLOR_PALETTE.length) {
      // For remaining colors in palette, find the one with maximum minimum distance
      let bestColor = COLOR_PALETTE[0];
      let maxMinDistance = -1;
      
      for (const candidateColor of COLOR_PALETTE) {
        if (usedColors.has(candidateColor)) {
          continue;
        }
        
        // Find minimum distance to any used color
        let minDistance = Infinity;
        for (const usedColor of usedColors) {
          const dist = colorDistance(candidateColor, usedColor);
          minDistance = Math.min(minDistance, dist);
        }
        
        if (minDistance > maxMinDistance) {
          maxMinDistance = minDistance;
          bestColor = candidateColor;
        }
      }
      
      assignments[title] = bestColor;
      usedColors.add(bestColor);
    } else {
      // All colors used, find the color that maximizes minimum distance to all used colors
      // This allows reuse but ensures maximum contrast
      let bestColor = COLOR_PALETTE[0];
      let maxMinDistance = -1;
      
      for (const candidateColor of COLOR_PALETTE) {
        // Find minimum distance to any used color
        let minDistance = Infinity;
        for (const usedColor of usedColors) {
          const dist = colorDistance(candidateColor, usedColor);
          minDistance = Math.min(minDistance, dist);
        }
        
        if (minDistance > maxMinDistance) {
          maxMinDistance = minDistance;
          bestColor = candidateColor;
        }
      }
      
      assignments[title] = bestColor;
      // Don't add to usedColors here since we're reusing colors
      // But track which colors are used for this assignment round
    }
  }
  
  return assignments;
}

// Legacy function for backward compatibility (used by ClusterLegend)
export function getClusterColor(clusterTitle: string): string {
  // This is a fallback - should use assignClusterColors in Canvas instead
  let hash = 0;
  for (let i = 0; i < clusterTitle.length; i++) {
    hash = clusterTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

// Convert hex color to rgba with opacity
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export interface Subtopic {
  title: string;
  category: string;
}

export interface Source {
  url: string;
  title?: string;
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
  suggestedQuestions?: string[];
  subtopics?: Subtopic[];
  statusUpdates?: string[]; // Real-time status updates from agent
  sourcesCount?: number; // Number of sources researched (for agent nodes)
  sources?: Source[]; // List of source URLs (for agent nodes)
}

interface CardNodeComponentProps extends NodeProps<CardNodeData> {
  onAddNote?: (sourceId: string, userQuery: string, selectedContext?: string, color?: string, sourceType?: string) => void;
  // DEPRECATED: onAgentRequest?: (sourceId: string, userQuery: string, selectedContext?: string, color?: string) => void;
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
  const [showAgent, setShowAgent] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const agentToolbarRef = useRef<HTMLDivElement>(null);
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
      if (showAgent && agentToolbarRef.current && !agentToolbarRef.current.contains(target)) {
        setShowAgent(false);
      }
      if (selectionPopup && selectionPopupRef.current && !selectionPopupRef.current.contains(target)) {
        setSelectionPopup(null);
      }
    };

    if (show || showAgent || selectionPopup) {
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [show, showAgent, selectionPopup]);

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
            placeholder="Ask a follow-up question"
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

      {/* DEPRECATED: Agent research toolbar */}
      {/* <NodeToolbar isVisible={showAgent} position={Position.Bottom}>
        <div
          ref={agentToolbarRef}
          className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/90 to-blue-900/90 backdrop-blur-sm text-neutral-100 shadow-xl p-2 w-64"
        >
          <div className="flex items-center gap-2 mb-2 px-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-300 font-semibold">AI Agent Research</span>
          </div>
          <input
            autoFocus
            placeholder="What should I research?"
            className="w-full rounded-lg bg-black/30 border border-purple-500/20 px-2 py-1 text-sm outline-none focus:border-purple-500/40 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onAgentRequest?.(id, e.currentTarget.value.trim(), undefined, '#8B5CF6');
                e.currentTarget.value = '';
                setShowAgent(false);
              }
            }}
          />
        </div>
      </NodeToolbar> */}

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
          className="cursor-pointer nopan relative rounded-3xl text-neutral-100 shadow-2xl overflow-hidden transition-all"
          style={{
            width: data.isSubtopic ? undefined : 500, // Subtopics use their calculated width, regular nodes use 500px
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'rgba(255, 255, 255, 0.1)', // Default border for all nodes
            backgroundColor: 'rgba(17, 17, 17, 0.9)', // Base background
            boxShadow: isSelected && isChatPanelOpen
              ? `0 0 0 4px ${data.color || '#60A5FA'}40, 0 0 30px ${data.color || '#60A5FA'}80`
              : isInActivePath && isChatPanelOpen
              ? `0 0 0 3px ${data.color || '#60A5FA'}30, 0 0 20px ${data.color || '#60A5FA'}40`
              : undefined,
          }}
        >
        {/* Subtle cluster color background overlay */}
        {data.color && !data.isRoot && !data.isSubtopic && (
          <div
            className="absolute inset-0 pointer-events-none rounded-3xl"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(data.color, 0.15)} 0%, ${hexToRgba(data.color, 0.08)} 100%)`,
            }}
          />
        )}
        <div className="flex flex-col gap-2 min-h-full relative z-10">
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
            <div className="p-6 flex flex-col gap-4 flex-1">
              {/* Status updates list - no scrolling, expands node height */}
              {data.statusUpdates && data.statusUpdates.length > 0 && (
                <div className="space-y-2">
                  {data.statusUpdates.map((status, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-neutral-300 bg-neutral-800/50 rounded-lg px-3 py-2 animate-fade-in"
                      style={{
                        animationDelay: `${idx * 50}ms`,
                      }}
                    >
                      {status}
                    </div>
                  ))}
                </div>
              )}

              {/* Loading spinner */}
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 border-4 border-purple-700/30 border-t-purple-400 rounded-full animate-spin" />
                <p className="text-sm text-purple-300 font-medium">
                  {data.statusUpdates && data.statusUpdates.length > 0 ? 'Processing...' : 'Generating content...'}
                </p>
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

              {/* Subtopics List */}
              {data.subtopics && data.subtopics.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="border-t border-white/10 pt-4">
                    <h3 className="text-xs font-semibold text-neutral-400 mb-3">Related Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.subtopics.map((subtopic, index) => {
                        // Check if this subtopic has been explored (has an outgoing edge with matching title)
                        const matchingEdge = edges?.find(edge =>
                          edge.source === id &&
                          (edge.label === subtopic.title || edge.data?.userQuery === subtopic.title)
                        );
                        const isActive = !!matchingEdge;
                        const categoryColor = getCategoryColor(subtopic.category);

                        return (
                          <button
                            key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Only create a new node if this subtopic hasn't been explored yet
                              if (!isActive) {
                                onAddNote?.(id, subtopic.title, undefined, categoryColor, 'suggested_follow_up');
                              } else if (matchingEdge && onNodeClick) {
                                // If already explored, navigate to the existing node
                                onNodeClick(matchingEdge.target);
                              }
                            }}
                            className="cursor-pointer px-3 py-1.5 rounded-lg hover:bg-white/10 hover:scale-105 border transition-all duration-200 flex items-center gap-2 group"
                            style={{
                              borderLeftWidth: '3px',
                              borderLeftColor: categoryColor,
                              borderTopColor: isActive ? categoryColor : 'rgba(255, 255, 255, 0.1)',
                              borderRightColor: isActive ? categoryColor : 'rgba(255, 255, 255, 0.1)',
                              borderBottomColor: isActive ? categoryColor : 'rgba(255, 255, 255, 0.1)',
                              backgroundColor: isActive ? `${categoryColor}20` : 'rgba(255, 255, 255, 0.03)',
                            }}
                            title={isActive ? `View: ${subtopic.title}` : `Explore: ${subtopic.title} (${subtopic.category})`}
                          >
                            <span className="text-xs font-semibold text-neutral-200 group-hover:text-neutral-100 transition-colors">{subtopic.title}</span>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={{
                                backgroundColor: `${categoryColor}33`,
                                color: categoryColor,
                              }}
                            >
                              {subtopic.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Sources Badge (for agent-researched nodes) */}
              {data.sourcesCount && data.sourcesCount > 0 && (
                <div className="px-6 pb-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSources(!showSources);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-purple-900/20 border border-purple-500/20 hover:bg-purple-900/30 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs text-purple-300 font-medium">
                      Researched from {data.sourcesCount} source{data.sourcesCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-purple-400 ml-auto">
                      {showSources ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Expandable sources list */}
                  {showSources && data.sources && data.sources.length > 0 && (
                    <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                      {data.sources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 p-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors group"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-purple-400 font-mono mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-neutral-300 group-hover:text-neutral-100 truncate">
                              {source.title || source.url}
                            </p>
                            <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                              {source.url}
                            </p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-neutral-500 group-hover:text-purple-400 flex-shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <Handle type="source" position={Position.Bottom} id="b" />
        {!data.isRoot && <Handle type="target" position={Position.Top} id="t" />}
        </div>

        {/* Selection popup - positioned outside node to avoid overflow-hidden clipping */}
        {selectionPopup && (
          <div
            ref={selectionPopupRef}
            style={{
              position: 'absolute',
              left: `${selectionPopup.x}px`,
              top: `${selectionPopup.y}px`,
              transform: 'translate(-50%, calc(-100% - 8px))',
              zIndex: 9999,
              pointerEvents: 'auto',
            }}
            className="rounded-xl border border-white/20 bg-black/95 backdrop-blur-sm text-neutral-100 shadow-2xl p-2 w-64"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={(input) => { if (input) setTimeout(() => input.focus(), 0); }}
              placeholder="Ask a follow-up question"
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

        {/* Action buttons - outside node */}
        {!data.isLoading && !data.isRoot && !data.isSubtopic && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-2" style={{ top: '100%', marginTop: '8px' }}>
            {/* Follow-up question button */}
            <div
              onClick={() => {
                setShow(!show);
                setShowAgent(false);
              }}
              className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer transition-all nopan hover:scale-110"
              title="Ask a follow-up question"
            >
              <MessageSquarePlus className="w-6 h-6" />
            </div>

            {/* DEPRECATED: AI Agent research button */}
            {/* <div
              onClick={() => {
                setShowAgent(!showAgent);
                setShow(false);
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 flex items-center justify-center cursor-pointer transition-all nopan hover:scale-110"
              title="Research with AI Agent"
            >
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div> */}
          </div>
        )}
      </div>
    </>
  );
}

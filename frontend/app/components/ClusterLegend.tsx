'use client';

import { X } from 'lucide-react';
import { ClusterResult } from '../utils/api';
import { assignClusterColors } from './CardNode';

interface ClusterLegendProps {
  clusterData: ClusterResult | null;
  onClose?: () => void;
}

export function ClusterLegend({ clusterData, onClose }: ClusterLegendProps) {
  if (!clusterData || Object.keys(clusterData).length === 0) {
    return null;
  }

  const clusters = Object.entries(clusterData);
  const totalNodes = clusters.reduce((sum, [, nodeIds]) => sum + nodeIds.length, 0);
  
  // Use the same color assignment logic as Canvas for consistency
  const clusterTitles = clusters.map(([title]) => title);
  const clusterColorMap = assignClusterColors(clusterTitles);

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-black/70 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl p-4 min-w-[260px] max-w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <h3 className="text-sm font-semibold text-white">Clusters</h3>
          <span className="text-xs text-white/50">
            ({clusters.length})
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            title="Close legend"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="text-xs text-white/40 mb-3 pb-2 border-b border-white/10">
        {totalNodes} {totalNodes === 1 ? 'node' : 'nodes'} grouped
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
          .cluster-legend-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .cluster-legend-scroll::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
          }
          .cluster-legend-scroll::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
          }
          .cluster-legend-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        `
      }} />
      <div 
        className="cluster-legend-scroll flex flex-col gap-2 overflow-y-auto pr-2"
        style={{
          maxHeight: '33vh',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05)',
        }}
      >
        {clusters.map(([clusterTitle, nodeIds]) => {
          const color = clusterColorMap[clusterTitle];
          return (
            <div
              key={clusterTitle}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors cursor-default"
            >
              <div
                className="w-5 h-5 rounded flex-shrink-0 mt-0.5 border-2 shadow-sm"
                style={{
                  backgroundColor: `${color}25`,
                  borderColor: color,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate" title={clusterTitle}>
                  {clusterTitle}
                </div>
                <div className="text-xs text-white/50 mt-0.5">
                  {nodeIds.length} {nodeIds.length === 1 ? 'node' : 'nodes'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

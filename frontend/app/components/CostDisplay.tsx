'use client';

interface CostDisplayProps {
  used: number;
  maxTotal: number;
}

export function CostDisplay({ used, maxTotal }: CostDisplayProps) {
  // Calculate percentage used
  const percentage = (used / maxTotal) * 100;

  // Determine color based on usage
  const getColor = () => {
    if (percentage < 50) return 'text-green-400';
    if (percentage < 80) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getBgColor = () => {
    if (percentage < 50) return 'bg-green-400/10 border-green-400/20';
    if (percentage < 80) return 'bg-yellow-400/10 border-yellow-400/20';
    return 'bg-red-400/10 border-red-400/20';
  };

  return (
    <div
      className={`px-3 py-2 backdrop-blur-sm border rounded-lg ${getBgColor()} transition-colors`}
      title={`Cost: $${used.toFixed(2)} / $${maxTotal.toFixed(2)}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Cost:</span>
        <span className={`text-sm font-mono font-medium ${getColor()}`}>
          ${used.toFixed(2)} / ${maxTotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

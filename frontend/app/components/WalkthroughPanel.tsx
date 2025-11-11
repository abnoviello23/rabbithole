import React from 'react';

type WalkthroughStep = {
  nodeId: string;
  title: string;
  caption: string;
};

export function WalkthroughPanel({
  isOpen,
  onClose,
  steps,
  currentIndex,
  onPrev,
  onNext,
  onJump,
}: {
  isOpen: boolean;
  onClose: () => void;
  steps: WalkthroughStep[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
}) {
  if (!isOpen) return null;

  const current = steps[currentIndex];

  return (
    <div className="fixed top-0 right-0 h-full w-[32rem] max-w-[90vw] z-50 bg-black/70 backdrop-blur-xl border-l border-white/10 text-white flex flex-col">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm uppercase tracking-wider text-white/60">Guided Walkthrough</div>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-sm"
        >
          Close
        </button>
      </div>

      {/* Current step content */}
      <div className="p-5 flex-1 overflow-auto">
        <div className="text-xs mb-3 text-white/60">
          Step {currentIndex + 1} of {steps.length}
        </div>
        <h3 className="text-xl font-semibold mb-3">{current?.title || '—'}</h3>
        <p className="text-white/85 leading-relaxed whitespace-pre-wrap">
          {current?.caption || 'No details available.'}
        </p>
      </div>

      {/* Controls */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={currentIndex === 0}
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors text-sm"
          >
            Previous
          </button>
          <button
            onClick={onNext}
            disabled={currentIndex >= steps.length - 1}
            className="px-3 py-2 rounded-md bg-indigo-500/80 hover:bg-indigo-500 transition-colors text-sm"
          >
            Next
          </button>
        </div>
      </div>

      {/* Step list */}
      <div className="border-t border-white/10 max-h-64 overflow-auto">
        {steps.map((s, i) => (
          <button
            key={s.nodeId + i}
            onClick={() => onJump(i)}
            className={`w-full text-left px-5 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
              i === currentIndex ? 'bg-white/10' : ''
            }`}
          >
            <div className="text-xs text-white/60 mb-1">Step {i + 1}</div>
            <div className="text-sm">{s.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { WalkthroughStep };



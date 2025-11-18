'use client';

import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, ChevronDown } from 'lucide-react';

interface Session {
  name: string;
  session_id: string;
}

interface SessionManagerProps {
  currentSession: string;
  sessions: Session[];
  onLoadSession: (session: Session | string) => void;
  onCreateSession: () => void;
  onDeleteSession: (session: Session | string) => void;
}

export function SessionManager({
  currentSession,
  sessions,
  onLoadSession,
  onCreateSession,
  onDeleteSession,
}: SessionManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="fixed top-4 left-4 z-60" ref={dropdownRef}>
      {/* Current session button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg text-white hover:bg-black/50 transition-colors"
      >
        <FolderOpen className="w-4 h-4" />
        <span className="text-sm font-medium max-w-[200px] truncate">
          {currentSession}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl overflow-hidden">
          {/* New Session Button */}
          <button
            onClick={() => {
              onCreateSession();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-3 text-white hover:bg-white/10 transition-colors border-b border-white/10"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">New Session</span>
          </button>

          {/* Sessions List */}
          <div className="max-h-[300px] overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-neutral-400 text-center">
                No saved sessions
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.session_id}
                  className={`flex items-center justify-between px-4 py-2 hover:bg-white/10 transition-colors ${
                    session.name === currentSession ? 'bg-white/5' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      onLoadSession(session);
                      setIsOpen(false);
                    }}
                    className="flex-1 text-left text-sm text-white truncate"
                  >
                    {session.name}
                  </button>
                  {session.name !== currentSession && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session);
                      }}
                      className="ml-2 p-1 text-neutral-400 hover:text-red-400 transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

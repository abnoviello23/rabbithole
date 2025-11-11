'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface UserSettings {
  length: 'short' | 'detailed';
  autoTopics: 3 | 5 | 7;
  customPrompt: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  length: 'detailed',
  autoTopics: 3,
  customPrompt: '',
};

const SETTINGS_STORAGE_KEY = 'rabbithole_user_settings';

interface SettingsPanelProps {
  onSettingsChange: (settings: UserSettings) => void;
}

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserSettings;
        setSettings(parsed);
        onSettingsChange(parsed);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [onSettingsChange]);

  // Save settings to localStorage whenever they change
  const updateSettings = (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    onSettingsChange(updated);
  };

  return (
    <div className="border-b border-white/10">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-semibold text-neutral-300">Settings</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>

      {/* Settings Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Length Setting */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 block mb-2">
              Response Length
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => updateSettings({ length: 'short' })}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  settings.length === 'short'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                Short (1 paragraph)
              </button>
              <button
                onClick={() => updateSettings({ length: 'detailed' })}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  settings.length === 'detailed'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                Detailed (3 paragraphs)
              </button>
            </div>
          </div>

          {/* Auto-topics Setting */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 block mb-2">
              Related Topics
            </label>
            <div className="flex gap-2">
              {[3, 5, 7].map((num) => (
                <button
                  key={num}
                  onClick={() => updateSettings({ autoTopics: num as 3 | 5 | 7 })}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    settings.autoTopics === num
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt Setting */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 block mb-2">
              Custom Prompt (optional)
            </label>
            <textarea
              value={settings.customPrompt}
              onChange={(e) => updateSettings({ customPrompt: e.target.value })}
              placeholder="Add custom instructions to prepend to the system prompt..."
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-white/10 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500 transition-colors resize-none"
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  );
}

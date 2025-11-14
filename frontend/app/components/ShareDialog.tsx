'use client';

import { useState } from 'react';
import { X, Copy, Check, Share2, Link as LinkIcon } from 'lucide-react';
import { enableSessionSharing, disableSessionSharing } from '../utils/api';

interface ShareDialogProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  idToken?: string;
  existingShareToken?: string | null;
  onShareTokenChange?: (token: string | null) => void;
}

export default function ShareDialog({
  sessionId,
  isOpen,
  onClose,
  idToken,
  existingShareToken,
  onShareTokenChange,
}: ShareDialogProps) {
  const [shareToken, setShareToken] = useState<string | null>(existingShareToken || null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/shared/${shareToken}`
    : null;

  const handleEnableSharing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await enableSessionSharing(sessionId, idToken);
      setShareToken(response.share_token);
      if (onShareTokenChange) {
        onShareTokenChange(response.share_token);
      }
    } catch (err) {
      console.error('Failed to enable sharing:', err);
      setError(err instanceof Error ? err.message : 'Failed to enable sharing');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableSharing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await disableSessionSharing(sessionId, idToken);
      setShareToken(null);
      if (onShareTokenChange) {
        onShareTokenChange(null);
      }
    } catch (err) {
      console.error('Failed to disable sharing:', err);
      setError(err instanceof Error ? err.message : 'Failed to disable sharing');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      setError('Failed to copy link to clipboard');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/20 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Share Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">
            Create a public link to share this session. Anyone with the link can view it in read-only mode.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {shareToken && shareUrl ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-neutral-800 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <LinkIcon className="w-4 h-4 text-neutral-400" />
                  <span className="text-xs text-neutral-400 uppercase">Share Link</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition-colors"
                    title="Copy link"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-green-400 mt-2">Link copied to clipboard!</p>
                )}
              </div>

              <button
                onClick={handleDisableSharing}
                disabled={isLoading}
                className="w-full px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Disabling...' : 'Disable Sharing'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnableSharing}
              disabled={isLoading}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 border border-blue-500/30 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating link...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Create Public Link
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


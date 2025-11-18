'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { LogOut, Share2 } from 'lucide-react';
import { CostDisplay } from './CostDisplay';

interface SignInProps {
  costInfo?: {
    used: number;
    max_total: number;
  };
  onShareClick?: () => void;
}

export default function SignIn({ costInfo, onShareClick }: SignInProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="absolute top-4 right-4 z-50">
        <div className="px-4 py-2 rounded-lg bg-neutral-800 border border-white/10 text-neutral-300 text-sm">
          Loading...
        </div>
      </div>
    );
  }

  if (session && session.user) {
    return (
      <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
        {/* Share Button */}
        {onShareClick && (
          <button
            onClick={onShareClick}
            className="px-3 py-2 backdrop-blur-sm border rounded-lg bg-neutral-800/80 hover:bg-neutral-700/80 border-white/20 text-white hover:border-blue-500/50 transition-colors flex items-center gap-2"
            title="Share session"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm font-medium">Share</span>
          </button>
        )}

        {/* Cost Display */}
        {costInfo && (
          <CostDisplay used={costInfo.used} maxTotal={costInfo.max_total} />
        )}

        {/* User Info */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 border border-white/10">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-neutral-100">
              {session.user.name}
            </span>
            <span className="text-xs text-neutral-400">
              {session.user.email}
            </span>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => signOut()}
          className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-50">
      <button
        onClick={() => signIn('google')}
        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium transition-colors shadow-lg"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

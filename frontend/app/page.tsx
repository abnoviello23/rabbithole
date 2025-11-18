'use client';

import { useSession } from 'next-auth/react';
import Canvas from './components/Canvas';
import SignIn from './components/SignIn';

export default function Home() {
  const { data: session, status } = useSession();

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">Digging the rabbit's hole... </p>
        </div>
      </div>
    );
  }

  // Show sign in page if not authenticated
  if (status === 'unauthenticated' || !session?.user) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="p-8 flex flex-col gap-4 justify-center flex-1 max-w-2xl w-full">
          <h2 className="text-2xl font-semibold text-center text-white">What's your rabbit hole? 🐰</h2>
          <div className="flex justify-center">
            <SignIn />
          </div>
        </div>
      </div>
    );
  }

  // Show Canvas if authenticated
  return <Canvas />;
}


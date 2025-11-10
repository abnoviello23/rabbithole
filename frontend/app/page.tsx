'use client';

import { useSession } from 'next-auth/react';
import SlickCanvas from "./components/Canvas";
import SignIn from "./components/SignIn";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <SignIn />
        <div className="text-center">
          <h1 className="text-4xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">
            Welcome to Rabbit Hole 🐰
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Please sign in with Google to start exploring
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <SignIn />
      <SlickCanvas />
    </div>
  );
}

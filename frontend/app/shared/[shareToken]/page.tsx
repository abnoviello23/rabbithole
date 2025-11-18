'use client';

import { useParams } from 'next/navigation';
import SharedCanvas from '../../components/SharedCanvas';

export default function SharedSessionPage() {
  const params = useParams();
  const shareToken = params?.shareToken as string;

  if (!shareToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">Invalid Share Link</p>
          <p className="text-neutral-400">The share token is missing from the URL.</p>
        </div>
      </div>
    );
  }

  return <SharedCanvas shareToken={shareToken} />;
}


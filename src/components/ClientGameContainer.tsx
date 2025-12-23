"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Dynamic imports with better loading strategy
const DynamicGameContainer = dynamic(() => import('./GameContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="text-white text-xl">Loading Boby's World...</div>
    </div>
  ),
});

// Separate lazy loading for game modes (future enhancement)
export const loadBobyWorldMode = () => import('./GameContainer');
export const loadRunningGameMode = () => import('./game/RunningGameUI');

export default function ClientGameContainer() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-xl animate-pulse">Initializing Game...</div>
      </div>
    }>
      <DynamicGameContainer />
    </Suspense>
  );
}

"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';

// Dynamic imports with better loading strategy
const DynamicGameContainer = dynamic(() => import('./GameContainer'), {
  ssr: false,
  loading: () => <LoadingScreen variant="indeterminate" />,
});

// Separate lazy loading for game modes (future enhancement)
export const loadBobyWorldMode = () => import('./GameContainer');
export const loadRunningGameMode = () => import('./game/RunningGameUI');

export default function ClientGameContainer() {
  return (
    <Suspense fallback={<LoadingScreen variant="indeterminate" />}>
      <DynamicGameContainer />
    </Suspense>
  );
}

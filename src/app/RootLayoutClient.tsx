'use client';

import React, { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import WalletContextProvider from '@/components/wallet/WalletContextProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { AudioProvider, useAudio } from '@/contexts/AudioContext';
import SoundManager from '@/components/game/SoundManager';

function AudioInitializer() {
  const { soundManagerRef, isMuted, hasUserInteracted } = useAudio();

  useEffect(() => {
    // This component primarily ensures SoundManager is rendered and connected to context.
  }, []);

  return (
    <SoundManager
      ref={soundManagerRef}
      isMuted={isMuted}
      hasUserInteracted={hasUserInteracted}
      onPlaybackBlocked={() => console.warn("Audio playback was blocked.")}
      currentScreen={'loading'} // This prop is now internal to SoundManager, but still required by its interface
    />
  );
}

export default function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Register Service Worker for asset caching
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('[SW] Registered successfully:', registration.scope);
        })
        .catch(error => {
          console.error('[SW] Registration failed:', error);
        });
    } else {
      console.warn('[SW] Service Workers not supported');
    }
  }, []);

  return (

    <WalletContextProvider>
      <AuthProvider>
        <AudioProvider>
          {children}
          <Toaster />
          <AudioInitializer />
        </AudioProvider>
      </AuthProvider>
    </WalletContextProvider>
  );
}

"use client";

import { Toaster } from "@/components/ui/toaster";
import WalletContextProvider from "@/components/wallet/WalletContextProvider";
import { AudioProvider, useAudio } from "@/contexts/AudioContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { performanceMonitor } from "@/lib/advanced-service-worker";
import { swrConfig } from "@/lib/swr/swr-config";
import { logger } from "@/utils/logger";
import "@solana/wallet-adapter-react-ui/styles.css";
import dynamic from "next/dynamic";
import React, { useEffect } from "react";
import { SWRConfig } from "swr";

// Dynamically import SoundManager to keep the initial bundle light
const SoundManager = dynamic(() => import("@/components/game/SoundManager"), {
  ssr: false,
});

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
      onPlaybackBlocked={() => logger.warn("Audio playback was blocked.")}
      currentScreen={"loading"} // This prop is now internal to SoundManager, but still required by its interface
    />
  );
}

export default function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Register Service Worker and initialize advanced features
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(registration => {
          logger.log("[SW] Registered successfully:", registration.scope);
        })
        .catch(error => {
          logger.error("[SW] Registration failed:", error);
        });
    } else {
      logger.warn("[SW] Service Workers not supported");
    }

    // Record initial load time
    performanceMonitor.recordLoadTime(performance.now());
  }, []);

  return (
    <SWRConfig value={swrConfig}>
      <WalletContextProvider>
        <AuthProvider>
          <AudioProvider>
            {children}
            <Toaster />
            <AudioInitializer />
          </AudioProvider>
        </AuthProvider>
      </WalletContextProvider>
    </SWRConfig>
  );
}

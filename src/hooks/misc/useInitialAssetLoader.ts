"use client";

import { initialAssetPreloader } from "@/lib/asset-preload/initialAssetPreloader";
import type { PreloadProgress } from "@/lib/asset-preload/preloadTypes";
import { MANIFEST_STATS } from "@/lib/gameAssetManifest";
import { useCallback, useEffect, useState } from "react";

interface UseInitialAssetLoaderProps {
  onComplete: () => void;
  onError: (error: string) => void;
}

const INITIAL_STATE: PreloadProgress = {
  totalAssets: MANIFEST_STATS.totalAssets,
  loadedAssets: 0,
  loadedSizeMB: 0,
  totalSizeMB: MANIFEST_STATS.totalEstimatedSizeMB,
  currentPriority: "critical",
  phase: "initializing",
  isComplete: false,
  errors: [],
  verifiedAssets: 0,
  corruptedAssets: 0,
  downloadSpeed: 0,
  integrityChecks: [],
};

export const useInitialAssetLoader = ({ onComplete, onError }: UseInitialAssetLoaderProps) => {
  const [progress, setProgress] = useState<PreloadProgress>(INITIAL_STATE);
  const [startTime] = useState(Date.now());
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [isCheckOnly, setIsCheckOnly] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const handleProgress = useCallback(
    (p: PreloadProgress) => {
      setProgress(p);
      const elapsed = Date.now() - startTime;
      const ratio = p.loadedAssets / p.totalAssets;
      if (ratio > 0.1) setEstimatedTimeRemaining(Math.max(0, elapsed / ratio - elapsed));
    },
    [startTime]
  );

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const { checkAssetAvailability } = await import("@/lib/asset-preload/assetChecker");
        const result = await checkAssetAvailability();
        if (!mounted) return;
        if (result.allPresent) {
          setIsCheckOnly(true);
          setTimeout(() => {
            if (mounted) onComplete();
          }, 2000);
          return;
        }
        setIsInitialLoading(false);
        const success = await initialAssetPreloader.preloadAllAssets({
          onProgress: p => {
            if (mounted) handleProgress(p);
          },
          maxConcurrentLoads: 3,
        });
        if (mounted && success) setTimeout(() => onComplete(), 500);
        else if (mounted) throw new Error("Preload failed");
      } catch (e) {
        if (mounted) onError(e instanceof Error ? e.message : "Unknown");
      }
    };
    run();
    return () => {
      mounted = false;
      initialAssetPreloader.cancelPreload();
    };
  }, [onComplete, onError, handleProgress]);

  return { progress, estimatedTimeRemaining, isCheckOnly, isInitialLoading };
};

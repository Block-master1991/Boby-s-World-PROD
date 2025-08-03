'use client';

import { useState, useEffect, useCallback, MutableRefObject, useRef } from 'react';
import * as THREE from 'three';
import { useDynamicModelLoader, DynamicLoadableObject } from './useDynamicModelLoader';
import { Octree } from '@/lib/Octree';

interface UseGameAssetLoaderProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  octreeRef: MutableRefObject<Octree | null>;
  // Callbacks for initialization of game elements
  initializeDog: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  initializeCoins: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  initializeEnemies: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  // New: Callback for loading progress
  onProgress?: (url: string, loaded: number, total: number) => void;
}

export const useGameAssetLoader = ({
  sceneRef,
  cameraRef,
  octreeRef,
  initializeDog,
  initializeCoins,
  initializeEnemies,
  onProgress, // Destructure new prop
}: UseGameAssetLoaderProps) => {
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalAssetsToLoad = 3; // Dog, Coins, Enemies
  const progressRef = useRef({ dog: 0, coins: 0, enemies: 0 });

  const updateProgress = useCallback(() => {
    const totalProgressPercentage = (progressRef.current.dog + progressRef.current.coins + progressRef.current.enemies) / totalAssetsToLoad;
    setLoadProgress(totalProgressPercentage);
    console.log(`[GameAssetLoader] Overall Progress: ${totalProgressPercentage.toFixed(2)}%`);
  }, [totalAssetsToLoad]);

  const createProgressCallback = useCallback((assetName: 'dog' | 'coins' | 'enemies') => {
    return (url: string, loaded: number, total: number) => {
      const progressPercentage = total > 0 ? (loaded / total) * 100 : 100;
      progressRef.current[assetName] = progressPercentage;
      console.log(`[GameAssetLoader] ${assetName} progress: ${loaded}/${total} (${progressPercentage.toFixed(2)}%)`);
      updateProgress();
    };
  }, [updateProgress]);

  const loadGameAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setLoadProgress(0);
    setError(null);
    progressRef.current = { dog: 0, coins: 0, enemies: 0 };
    console.log("[GameAssetLoader] Starting hybrid asset loading...");

    try {
      // Step 1: Load the primary asset (Dog) first, as others depend on it.
      console.log("[GameAssetLoader] Loading Dog model...");
      await initializeDog(createProgressCallback('dog'));
      console.log("[GameAssetLoader] Dog Model Loaded.");
      progressRef.current.dog = 100;
      updateProgress();

      // Step 2: Now that the dog model is loaded, load dependent assets in parallel.
      console.log("[GameAssetLoader] Loading dependent assets (Coins, Enemies) in parallel...");
      const coinsPromise = initializeCoins(createProgressCallback('coins')).then(() => {
        console.log("[GameAssetLoader] Coins Loaded.");
        progressRef.current.coins = 100;
        updateProgress();
      });

      const enemiesPromise = initializeEnemies(createProgressCallback('enemies')).then(() => {
        console.log("[GameAssetLoader] Enemies Loaded.");
        progressRef.current.enemies = 100;
        updateProgress();
      });

      await Promise.all([coinsPromise, enemiesPromise]);

      setIsLoadingAssets(false);
      setLoadProgress(100);
      console.log("[GameAssetLoader] All game assets loaded successfully. Final Progress: 100%");

    } catch (err: any) {
      console.error("[GameAssetLoader] Critical error during game asset loading:", err);
      setError(err.message || "Failed to load game assets.");
      setIsLoadingAssets(false);
      setLoadProgress(0);
      // Re-throw the error to ensure it's caught by the parent component (GameCanvas)
      throw err;
    }
  }, [initializeDog, initializeCoins, initializeEnemies, createProgressCallback, updateProgress]);

  // This effect will trigger the loading process when the component mounts
  // or when dependencies change (though we want it to run once for initial load)
  useEffect(() => {
    // Only run if scene and camera are ready
    if (sceneRef.current && cameraRef.current && !isLoadingAssets) {
      // This condition prevents re-running after initial load
      // We want to explicitly call loadGameAssets when needed by GameCanvas
      // For now, we'll rely on the parent to call it.
    }
  }, [sceneRef, cameraRef, isLoadingAssets]);

  return { isLoadingAssets, loadProgress, error, loadGameAssets };
};

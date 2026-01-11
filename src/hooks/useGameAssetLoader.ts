'use client';

import type { MutableRefObject} from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { Environment } from '@/lib/ez-tree/environment/environment';
import { Grass } from '@/lib/ez-tree/environment/grass';
import { Rocks } from '@/lib/ez-tree/environment/rocks';
import { Trees } from '@/lib/ez-tree/environment/trees';
import { Flowers } from '@/lib/ez-tree/environment/flowers';
import { logger } from '@/utils/logger';

interface UseGameAssetLoaderProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  // Callbacks for initialization of game elements
  initializeDog: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  initializeCoins: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  initializeEnemies: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>;
  initializeTrees: (onProgress?: (url: string, loaded: number, total: number) => void) => Promise<void>; // Add initializeTrees
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
  initializeTrees, // Destructure new prop
  onProgress, // Destructure new prop
}: UseGameAssetLoaderProps) => {
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalAssetsToLoad = 6; // Environment + Dog, Coins, Enemies, Trees, World
  const progressRef = useRef({ environment: 0, dog: 0, coins: 0, enemies: 0, trees: 0, world: 0 }); // Add world preload

  const updateProgress = useCallback(() => {
    const totalProgressPercentage = (progressRef.current.environment + progressRef.current.dog + progressRef.current.coins + progressRef.current.enemies + progressRef.current.trees) / totalAssetsToLoad; // Update calculation
    setLoadProgress(totalProgressPercentage);
    logger.log(`[GameAssetLoader] Overall Progress: ${totalProgressPercentage.toFixed(2)}%`);
  }, [totalAssetsToLoad]);

  const createProgressCallback = useCallback((assetName: 'environment' | 'dog' | 'coins' | 'enemies' | 'trees') => { // Update type
    return (url: string, loaded: number, total: number) => {
      const progressPercentage = total > 0 ? (loaded / total) * 100 : 100;
      progressRef.current[assetName] = progressPercentage;
      logger.log(`[GameAssetLoader] ${assetName} progress: ${loaded}/${total} (${progressPercentage.toFixed(2)}%)`);
      if (onProgress) {
        onProgress(url, loaded, total);
      }
      updateProgress();
    };
  }, [updateProgress, onProgress]);

  const preloadEnvironmentAssets = useCallback(async () => {
    logger.log("[GameAssetLoader] Preloading Environment Assets...");
    await Grass.fetchAssets();
    await Rocks.fetchAssets();
    await Trees.prototype.fetchAssets();
    await Flowers.fetchAssets();
    progressRef.current.environment = 100;
    updateProgress();
    logger.log("[GameAssetLoader] Environment Assets Preloaded.");
  }, [updateProgress]);

  const loadGameAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setLoadProgress(0);
    setError(null);
    progressRef.current = { environment: 0, dog: 0, coins: 0, enemies: 0, trees: 0, world: 0 }; // Reset all progress
    logger.log("[GameAssetLoader] Starting hybrid asset loading...");

    try {
      // Step 0: Preload environment assets first
      await preloadEnvironmentAssets();

      // Step 1: Load the primary asset (Dog) first, as others depend on it.
      logger.log("[GameAssetLoader] Loading Dog model...");
      await initializeDog(createProgressCallback('dog'));
      logger.log("[GameAssetLoader] Dog Model Loaded.");
      progressRef.current.dog = 100;
      updateProgress();

      // Step 2: Now that the dog model is loaded, load dependent assets in parallel.
      logger.log("[GameAssetLoader] Loading dependent assets (Coins, Enemies, Trees) in parallel...");
      const coinsPromise = initializeCoins(createProgressCallback('coins')).then(() => {
        logger.log("[GameAssetLoader] Coins Loaded.");
        progressRef.current.coins = 100;
        updateProgress();
      });

      const enemiesPromise = initializeEnemies(createProgressCallback('enemies')).then(() => {
        logger.log("[GameAssetLoader] Enemies Loaded.");
        progressRef.current.enemies = 100;
        updateProgress();
      });

      const treesPromise = initializeTrees(createProgressCallback('trees')).then(() => { // Add trees promise
        logger.log("[GameAssetLoader] Trees Loaded.");
        progressRef.current.trees = 100;
        updateProgress();
      });

      await Promise.all([coinsPromise, enemiesPromise, treesPromise]); // Wait for all promises

      // Initialize Octree if it doesn't exist yet
      if (!octreeRef.current) {
        // Define world bounds for the octree (adjust size based on your game world)
        const worldBounds = new THREE.Box3(
          new THREE.Vector3(-100, -10, -100), // min corner
          new THREE.Vector3(100, 100, 100)   // max corner
        );
        octreeRef.current = new Octree<GameObject>(worldBounds);
        logger.log("[GameAssetLoader] Octree initialized for collision detection");
      }

      setIsLoadingAssets(false);
      setLoadProgress(100);
      logger.log("[GameAssetLoader] All game assets loaded successfully. Final Progress: 100%");

    } catch (err) {
      logger.error("[GameAssetLoader] Critical error during game asset loading:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred while loading game assets.");
      }
      setIsLoadingAssets(false);
      setLoadProgress(0);
      // Re-throw the error to ensure it's caught by the parent component (GameCanvas)
      throw err;
    }
  }, [initializeDog, initializeCoins, initializeEnemies, initializeTrees, createProgressCallback, updateProgress, octreeRef]); // Add initializeTrees to dependencies

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

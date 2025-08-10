import * as THREE from 'three';
import { useCallback, useState, useEffect, useRef } from 'react';
import { modelLoader, LoadPriority } from '../utils/modelLoader';
import { useLODSwitching } from './useLODSwitching';
import { useModelBatching } from './useModelBatching';

interface OptimizedStaticObjectsProps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
}

// This hook is now a bridge between the central modelLoader and the scene management logic.
export const useOptimizedStaticObjects = ({
  scene,
  camera,
  renderer,
}: OptimizedStaticObjectsProps) => {
  const lodSwitching = useLODSwitching();
  const modelBatching = useModelBatching();
  const [isInitialized, setIsInitialized] = useState(false);
  const loadedChunksRef = useRef<Set<string>>(new Set());

  // 1. Initialize the central modelLoader system
  useEffect(() => {
    const initialize = async () => {
      if (!isInitialized) {
        await modelLoader.initialize(renderer, camera);
        setIsInitialized(true);
      }
    };
    initialize();
  }, [renderer, camera, isInitialized]);

  // 2. Load models for chunks and create batched/LOD meshes
  const loadModelsWithOptimizations = useCallback(
    async (chunks: Array<{ x: number; z: number }>) => {
      if (!isInitialized) return;

      const modelToLoad = {
        identifier: 'tree1',
        paths: {
          high: '/models/lands/Tree1.glb',
          medium: '/models/lands/Tree1_medium.glb',
          low: '/models/lands/Tree1_low.glb',
        },
        positions: generatePositions(chunks[0].x, chunks[0].z), // Simplified for one chunk
      };

      const chunkKey = `${chunks[0].x}_${chunks[0].z}`;
      if (loadedChunksRef.current.has(chunkKey)) {
        return; // Avoid reloading the same chunk
      }

      try {
        // Load all LODs for the model in parallel with high priority
        const [highModel, mediumModel, lowModel] = await Promise.all([
          modelLoader.loadModel(modelToLoad.paths.high, true, LoadPriority.HIGH),
          modelLoader.loadModel(modelToLoad.paths.medium, true, LoadPriority.MEDIUM),
          modelLoader.loadModel(modelToLoad.paths.low, true, LoadPriority.LOW),
        ]);

        // For this example, we'll use the batching hook directly.
        // A full LOD implementation would use the useLODSwitching hook.
        const batch = modelBatching.addToBatch(
          modelToLoad.paths.high, // Use high-LOD path as identifier
          modelToLoad.positions[0].position,
          modelToLoad.positions[0].rotation,
          modelToLoad.positions[0].scale
        );

        // Add all other positions to the same batch
        for (let i = 1; i < modelToLoad.positions.length; i++) {
            modelBatching.addToBatch(
                modelToLoad.paths.high,
                modelToLoad.positions[i].position,
                modelToLoad.positions[i].rotation,
                modelToLoad.positions[i].scale
            );
        }
        
        const mesh = await modelBatching.createMeshFromBatch(batch, highModel);
        if (mesh) {
          scene.add(mesh);
          // The central modelLoader automatically adds objects to its occlusion system
        }

        loadedChunksRef.current.add(chunkKey);

      } catch (error) {
        console.error(`Error loading models for chunk ${chunkKey}:`, error);
      }
    },
    [scene, modelBatching, isInitialized]
  );

  // 3. Update all systems in the central modelLoader
  const updateScene = useCallback(() => {
    if (!isInitialized) return;
    
    // This single call updates occlusion culling, performance monitoring, etc.
    modelLoader.update();

    // The LOD switching logic would also be called here
    // lodSwitching.updateLODBasedOnDistance(...);
  }, [isInitialized]);

  // 4. Cleanup resources
  const cleanup = useCallback(() => {
    // Dispose of geometries and materials in the scene
    scene.children = scene.children.filter(child => {
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
        return false;
      }
      return true;
    });
    loadedChunksRef.current.clear();
  }, [scene]);

  // 5. Expose public methods and getters
  return {
    loadModelsWithOptimizations,
    updateScene,
    cleanup,
    // Get stats directly from the central modelLoader
    getPerformanceMetrics: () => modelLoader.getStatus().performance,
    getMemoryStats: () => modelLoader.getStatus().memory,
  };
};

// Helper function to generate random positions for trees in a chunk
const generatePositions = (chunkX: number, chunkZ: number) => {
  const positions = [];
  const count = 50; // Number of trees per chunk

  for (let i = 0; i < count; i++) {
    positions.push({
      position: new THREE.Vector3(
        chunkX * 100 + Math.random() * 100,
        0,
        chunkZ * 100 + Math.random() * 100
      ),
      rotation: new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
      scale: new THREE.Vector3(
        0.8 + Math.random() * 0.4,
        0.8 + Math.random() * 0.4,
        0.8 + Math.random() * 0.4
      ),
    });
  }

  return positions;
};

import * as THREE from 'three';
import { useCallback, useState, useEffect, useRef } from 'react';
import { modelLoader, LoadPriority } from '../utils/modelLoader';
import { useLODSwitching } from './useLODSwitching';

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

        // 1. Create the InstancedMeshes for each LOD level
        const maxInstances = modelToLoad.positions.length;
        const lodMeshes = await lodSwitching.createLODMeshes(
          modelToLoad.identifier,
          { high: highModel, medium: mediumModel, low: lowModel },
          maxInstances
        );

        // 2. Add the created meshes to the scene
        if (lodMeshes) {
          if (lodMeshes.highMesh) scene.add(lodMeshes.highMesh);
          if (lodMeshes.mediumMesh) scene.add(lodMeshes.mediumMesh);
          if (lodMeshes.lowMesh) scene.add(lodMeshes.lowMesh);
        }

        // 3. Add each tree instance to the LOD system
        modelToLoad.positions.forEach((transform, index) => {
          const instanceId = `${modelToLoad.identifier}_${chunkKey}_${index}`;
          lodSwitching.addInstance(
            instanceId,
            modelToLoad.identifier,
            transform.position,
            transform.rotation,
            transform.scale
          );
        });

        loadedChunksRef.current.add(chunkKey);

      } catch (error) {
        console.error(`Error loading models for chunk ${chunkKey}:`, error);
      }
    },
    [scene, isInitialized, lodSwitching]
  );

  // 3. Update all systems in the central modelLoader
  const updateScene = useCallback(() => {
    if (!isInitialized) return;
    
    // This single call updates occlusion culling, performance monitoring, etc.
    modelLoader.update();

    // Update visibility based on frustum culling
    // This will hide objects outside camera view to improve performance
    if (camera) {
      lodSwitching.updateVisibilityBasedOnFrustum(camera);
    }
  }, [isInitialized, camera, lodSwitching]);

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

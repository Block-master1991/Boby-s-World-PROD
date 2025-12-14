import * as THREE from 'three';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND } from '../constants';
import { RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../chunkUtils';
import { Grass } from '../ez-tree/environment/grass';
import { Rocks } from '../ez-tree/environment/rocks';
import { Trees } from '../ez-tree/environment/trees';
import { Flowers } from '../ez-tree/environment/flowers';

// Define an interface for the content of a chunk
interface ChunkContent {
  id: string; // Unique identifier for the chunk
  grassMesh: THREE.InstancedMesh | null;
  rocksGroup: THREE.Group | null;
  treesGroup: THREE.Group | null;
  flowersGroup: THREE.Group | null;
  objects: THREE.Object3D[]; // Array to hold all Three.js objects in this chunk for easy removal
  isLoaded: boolean; // Track if chunk content is fully loaded and added to scene
  isDisposed: boolean; // Track if chunk resources are disposed
}

// واجهة لبيانات القطعة التي يتم إنشاؤها بواسطة العامل
interface ChunkData {
  grassData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  rocksData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  treesData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  flowersData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
}

export class ChunkManager extends THREE.Object3D {
  private worker: Worker;
  private loadedChunks: Map<string, ChunkContent> = new Map();
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private lastPlayerChunk: { chunkX: number; chunkZ: number } | null = null;
  private grassGenerator: Grass;
  private rocksGenerator: Rocks;
  private treesGenerator: Trees;
  private flowersGenerator: Flowers;

  private loadingQueue: string[] = [];
  private unloadingQueue: string[] = [];
  private isProcessingQueue: boolean = false;
  private _generatorsReady: boolean = false; // New flag to indicate if generators are ready

  constructor(grassGenerator: Grass, rocksGenerator: Rocks, treesGenerator: Trees, flowersGenerator: Flowers) {
    super();
    this.name = 'ChunkManager';

    this.grassGenerator = grassGenerator;
    this.rocksGenerator = rocksGenerator;
    this.treesGenerator = treesGenerator;
    this.flowersGenerator = flowersGenerator;

    this.worker = new Worker(new URL('../../workers/chunkWorker.ts', import.meta.url));
    this.worker.onmessage = (e) => {
      const { chunkKey, grassData, rocksData, treesData, flowersData } = e.data;
      const chunk = this.loadedChunks.get(chunkKey);

      // Populate the chunk with the received data
      if (chunk) {
        this.populateChunk(chunk, grassData, rocksData, treesData, flowersData);
        // Add chunk content to scene after populating
        this.addChunkContentToScene(chunk);
        console.log(`[ChunkManager] Populated chunk ${chunkKey} with ${grassData.positions.length / 3} grass, ${rocksData.positions.length / 3} rocks, ${treesData.positions.length / 3} trees, ${flowersData.positions.length / 3} flowers`);
      }
    };
  }

  public updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
    this.updateChunks();
  }

  private updateChunks(): void {
    const { chunkX: currentPlayerChunkX, chunkZ: currentPlayerChunkZ } = getChunkCoordinates(
      this.playerPosition.x,
      this.playerPosition.z
    );

    if (
      this.lastPlayerChunk &&
      this.lastPlayerChunk.chunkX === currentPlayerChunkX &&
      this.lastPlayerChunk.chunkZ === currentPlayerChunkZ
    ) {
      return;
    }

    this.lastPlayerChunk = { chunkX: currentPlayerChunkX, chunkZ: currentPlayerChunkZ };

    const chunksToKeep: Set<string> = new Set();
    const chunksToLoadNow: string[] = [];
    const chunksToUnloadNow: string[] = [];

    // Determine which chunks should be loaded or kept
    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        const targetChunkX = currentPlayerChunkX + x;
        const targetChunkZ = currentPlayerChunkZ + z;
        const chunkKey = getChunkKey(targetChunkX, targetChunkZ);
        chunksToKeep.add(chunkKey);

        if (!this.loadedChunks.has(chunkKey)) {
          chunksToLoadNow.push(chunkKey);
        }
      }
    }

    // Determine which chunks should be unloaded
    for (const [key] of this.loadedChunks.entries()) {
      if (!chunksToKeep.has(key)) {
        chunksToUnloadNow.push(key);
      }
    }

    // Add to queues, prioritizing unloading
    this.unloadingQueue.push(...chunksToUnloadNow);
    this.loadingQueue.push(...chunksToLoadNow);

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    // Only proceed with loading if generators are ready
    if (!this._generatorsReady && this.loadingQueue.length > 0) {
      console.log("[ChunkManager] Generators not yet ready, deferring chunk loading.");
      this.isProcessingQueue = false;
      return;
    }

    // Prioritize unloading
    if (this.unloadingQueue.length > 0) {
      const chunkKey = this.unloadingQueue.shift()!;
      const chunk = this.loadedChunks.get(chunkKey);
      if (chunk) {
        await this.unloadChunk(chunk);
        this.loadedChunks.delete(chunkKey);
      }
    } else if (this.loadingQueue.length > 0) {
      const chunkKey = this.loadingQueue.shift()!;
      const { chunkX, chunkZ } = this.parseChunkKey(chunkKey);
      // Double check if it's still needed and not already loaded
      if (!this.loadedChunks.has(chunkKey)) {
        const newChunk = await this.loadChunkModern(chunkX, chunkZ);
        // Ensure the chunk is still not loaded before setting it
        if (!this.loadedChunks.has(chunkKey)) {
          this.loadedChunks.set(chunkKey, newChunk);
          this.addChunkContentToScene(newChunk);
        }
      }
    }

    this.isProcessingQueue = false;

    // If there's more work, schedule the next processing frame
    if (this.unloadingQueue.length > 0 || this.loadingQueue.length > 0) {
      requestAnimationFrame(() => this.processQueue());
    }
  }

  public setGeneratorsReady(): void {
    this._generatorsReady = true;
    console.log("[ChunkManager] Generators are ready. Starting queue processing.");
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private parseChunkKey(chunkKey: string): { chunkX: number; chunkZ: number } {
    const parts = chunkKey.split(',');
    return { chunkX: parseInt(parts[0]), chunkZ: parseInt(parts[1]) };
  }

  private async loadChunkModern(chunkX: number, chunkZ: number): Promise<ChunkContent> {
    const chunkKey = getChunkKey(chunkX, chunkZ);
    const chunkContent: ChunkContent = {
      id: chunkKey,
      grassMesh: null,
      rocksGroup: null,
      treesGroup: null,
      flowersGroup: null,
      objects: [],
      isLoaded: false,
      isDisposed: false,
    };

    if (!this.grassGenerator || !this.rocksGenerator || !this.treesGenerator || !this.flowersGenerator) {
      throw new Error('Generators not initialized for modern API');
    }

    // Create a promise to wait for worker response
    return new Promise((resolve) => {
      // Store the resolve function to be called when worker responds
      const originalHandler = this.worker.onmessage;
      this.worker.onmessage = (e) => {
        const { chunkKey: responseChunkKey, grassData, rocksData, treesData, flowersData } = e.data;

        // Only process if this is the response we're waiting for
        if (responseChunkKey === chunkKey) {
          // Restore original handler
          this.worker.onmessage = originalHandler;

          // Populate the chunk with the received data
          this.populateChunk(chunkContent, grassData, rocksData, treesData, flowersData);

          // Mark as loaded and resolve
          chunkContent.isLoaded = true;
          resolve(chunkContent);
        }
      };

      this.worker.postMessage({
        chunkX,
        chunkZ,
        grassOptions: this.grassGenerator.options,
        rocksOptions: this.rocksGenerator.options,
        treesOptions: this.treesGenerator.options,
        flowersOptions: this.flowersGenerator.options,
        chunkKey,
        worldMin: WORLD_MIN_BOUND,
        worldMax: WORLD_MAX_BOUND,
      });
    });
  }

  private populateChunk(chunk: ChunkContent, grassData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }, rocksData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }, treesData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }, flowersData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }): void {
    if (!this.grassGenerator || !this.rocksGenerator || !this.treesGenerator || !this.flowersGenerator) {
      console.error('Generators not initialized');
      return;
    }

    // دالة مساعدة للحصول على ارتفاع التضاريس عند نقطة معينة
    const getHeightAt = (x: number, z: number): number => {
      // البحث عن الأرض في المشهد لتحديد الارتفاع
      // هذا افتراض وقد يحتاج تعديل حسب كيفية تخزين بيانات التضاريس في مشروعك
      try {
        // محاولة العثور على كائن الأرض في المشهد
        let ground: THREE.Object3D | null = null;
        this.traverse((child) => {
          if (child.name === 'Ground') {
            ground = child;
          }
        });

        if (ground && (ground as any).type === 'Mesh' && 'geometry' in ground) {
          // استخدام Raycaster لتحديد ارتفاع النقطة على سطح الأرض
          const raycaster = new THREE.Raycaster();
          const direction = new THREE.Vector3(0, -1, 0);
          const origin = new THREE.Vector3(x, 1000, z); // نقطة مرتفعة فوق التضاريس
          raycaster.set(origin, direction);

          const intersects = raycaster.intersectObject(ground);
          if (intersects.length > 0) {
            return intersects[0].point.y;
          }
        }
      } catch (error) {
        console.warn('Error determining terrain height:', error);
      }

      // القيمة الافتراضية إذا لم يتمكن من تحديد الارتفاع
      return 0;
    };

    // Generate and add grass
    if (grassData.positions.length > 0) {
      const grassMesh = this.grassGenerator.generateGrassFromData(grassData);
      if (grassMesh) {
        chunk.grassMesh = grassMesh;
        chunk.objects.push(grassMesh);
      }
    }

    // Generate and add rocks
    if (rocksData.positions.length > 0) {
      const rocksGroup = this.rocksGenerator.generateRocksFromData(rocksData);
      if (rocksGroup) {
        chunk.rocksGroup = rocksGroup;
        chunk.objects.push(rocksGroup);
      }
    }

    // Generate and add trees
    if (treesData.positions.length > 0) {
      const treesGroup = this.treesGenerator.generateTreesFromData(treesData);
      if (treesGroup) {
        chunk.treesGroup = treesGroup;
        chunk.objects.push(treesGroup);
      }
    }

    // Generate and add flowers - مع تمرير دالة تحديد الارتفاع
    if (flowersData.positions.length > 0) {
      const flowersGroup = this.flowersGenerator.generateFlowersFromData(flowersData, getHeightAt);
      if (flowersGroup) {
        chunk.flowersGroup = flowersGroup;
        chunk.objects.push(flowersGroup);
      }
    }

    chunk.isLoaded = true;
  }

  private addChunkContentToScene(chunk: ChunkContent): void {
    console.log(`[ChunkManager] Adding chunk ${chunk.id} content to scene with ${chunk.objects.length} objects`);

    chunk.objects.forEach(obj => {
      this.add(obj);
      console.log(`[ChunkManager] Added object ${obj.name || 'unnamed'} to scene`);
    });

    this.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = true;

        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            if (mat instanceof THREE.Material) {
              mat.needsUpdate = true;
            }
          });
        }
      }
    });
  }

  private async unloadChunk(chunk: ChunkContent): Promise<void> {
    if (chunk.isDisposed) return; // Already disposed

    chunk.objects.forEach(obj => {
      this.remove(obj);
      // Dispose of geometries and materials if necessary to free up memory
      if (obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      } else if (obj instanceof THREE.Group) {
        if (chunk.treesGroup === obj) {
          this.treesGenerator.disposeChunk(obj);
        } else if (chunk.rocksGroup === obj) {
          this.rocksGenerator.disposeChunk(obj); // Assuming Rocks also has a disposeChunk method
        } else if (chunk.flowersGroup === obj) {
          this.flowersGenerator.disposeChunk(obj);
        }
        obj.clear();
      }
    });
    chunk.objects = [];
    chunk.isLoaded = false;
    chunk.isDisposed = true; // Mark as disposed
  }

  public updateModern(elapsedTime: number): void {
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
        const materials = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
        materials.forEach((mat: THREE.Material) => {
          if ((mat as THREE.MeshPhongMaterial).userData?.shader) {
            const shader = (mat as THREE.MeshPhongMaterial).userData.shader as { uniforms: { uTime: { value: number } } };
            shader.uniforms.uTime.value = elapsedTime;
          }
        });
      }
    });

    // Update trees separately, assuming they have a different update mechanism.
    if (this.treesGenerator) {
      this.treesGenerator.update(elapsedTime);
    }
    // Flowers update method removed for consistency with Rocks class
    // No update needed for flowers as they don't have animation or wind effects
  }

  public dispose(): void {
    this.loadedChunks.forEach((chunkContent, chunkKey) => {
      this.unloadChunk(chunkContent);
      console.log(`[ChunkManager] Disposed chunk ${chunkKey}`);
    });

    this.loadedChunks.clear();
    this.loadingQueue = [];
    this.unloadingQueue = [];

    this.worker.terminate();

    console.log('[ChunkManager] Disposed chunk manager');
  }
}

import type * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { logger } from "../logger";
import { lodManager } from "./LODManager";
import { memoryManager } from "./MemoryManager";
import { modelGrouper } from "./ModelGrouper";
import { occlusionCullingManager } from "./OcclusionCullingManager";
import { performanceOptimizer } from "./PerformanceOptimizer";
import { priorityManager } from "./PriorityManager";
import { retryManager } from "./RetryManager";
import { LoadPriority } from "./types";
import { workerManager } from "./WorkerManager";

/**
 * Standard GLTF loading function used by the system.
 * Orchestrates priority, compression, and occlusion registration.
 */
export const loadGLTF = (
  path: string,
  compress: boolean = true,
  instanceId?: string,
  priority: LoadPriority = LoadPriority.MEDIUM
): Promise<THREE.Group> => {
  const promise = priorityManager.addToQueue(path, priority, compress, instanceId);

  promise
    .then(model => {
      // Automatically add loaded models to the occlusion culling system
      const id = instanceId || path;
      occlusionCullingManager.addObject(id, model);
    })
    .catch(error => {
      logger.error(`Failed to load model for occlusion culling: ${path}`, error);
    });

  return promise;
};

export class ModelLoader {
  private static instance: ModelLoader;
  private initialized = false;
  private dracoLoader: DRACOLoader | null = null;

  private constructor() {}

  public static getInstance(): ModelLoader {
    if (!ModelLoader.instance) {
      ModelLoader.instance = new ModelLoader();
    }
    return ModelLoader.instance;
  }

  public async initialize(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void> {
    if (this.initialized) return;

    // Initialize DRACOLoader
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath("/libs/draco/");
    logger.log("[ModelLoader] DRACOLoader initialized.");

    await this.dracoLoader.preload();
    logger.log("[ModelLoader] DRACOLoader decoder preloaded.");

    retryManager.setDracoLoader(this.dracoLoader as DRACOLoader);

    // Initialize systems that require external objects
    occlusionCullingManager.initialize(renderer, camera);
    performanceOptimizer.initialize(renderer);
    lodManager.setCamera(camera);

    this.initialized = true;
    logger.log("ModelLoader and all subsystems initialized.");
  }

  public async loadModel(
    path: string,
    compress: boolean = true,
    priority: LoadPriority = LoadPriority.MEDIUM,
    instanceId?: string
  ): Promise<THREE.Group> {
    if (!this.initialized) {
      throw new Error("ModelLoader not initialized. Call initialize() first.");
    }

    const model = await loadGLTF(path, compress, instanceId, priority);
    const groupInstance = modelGrouper.createInstance(path, instanceId || path);

    return groupInstance ? groupInstance : model;
  }

  public update(): void {
    if (!this.initialized) return;

    occlusionCullingManager.update();
    performanceOptimizer.update();
    modelGrouper.cleanupOldGroups();
  }

  public getStatus() {
    if (!this.initialized) {
      return { error: "ModelLoader not initialized." };
    }
    return {
      memory: memoryManager.getMemoryUsage(),
      performance: performanceOptimizer.getMetrics(),
      workers: workerManager.getWorkerStatus(),
      occlusion: occlusionCullingManager.getOcclusionStats(),
      queue: priorityManager.getQueueStatus(),
    };
  }
}

export const modelLoader = ModelLoader.getInstance();

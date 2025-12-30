// src/utils/modelLoader.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { getModel, putModel } from '../lib/indexedDB'; // Import IndexedDB utilities

type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

// --- ENUMS and INTERFACES ---

export enum LoadPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

interface PriorityRequest {
  path: string;
  priority: LoadPriority;
  resolve: (model: THREE.Group) => void;
  reject: (reason?: unknown) => void;
  compress: boolean;
  instanceId?: string;
}

interface MemoryInfo {
  size: number;
  lastAccessed: number;
  accessCount: number;
  priority: LoadPriority;
}

// --- ADVANCED MEMORY MANAGER ---

class MemoryManager {
  private static instance: MemoryManager;
  private modelCache: Map<string, { model: THREE.Group; info: MemoryInfo }> = new Map();
  private readonly MAX_MEMORY_USAGE = 500 * 1024 * 1024; // 500MB
  private readonly CLEANUP_THRESHOLD = 0.8;
  private currentMemoryUsage = 0;

  private constructor() { }

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public cacheModel(path: string, model: THREE.Group, priority: LoadPriority): void {
    if (this.modelCache.has(path)) return;
    const size = this.calculateModelSize(model);
    if (this.currentMemoryUsage + size > this.MAX_MEMORY_USAGE) {
      this.cleanup();
    }
    if (this.currentMemoryUsage + size > this.MAX_MEMORY_USAGE) {
      console.warn(`Cannot cache model ${path}, not enough memory.`);
      return;
    }

    const info: MemoryInfo = { size, lastAccessed: Date.now(), accessCount: 1, priority };
    this.modelCache.set(path, { model, info });
    this.currentMemoryUsage += size;
  }

  public getModel(path: string): THREE.Group | null {
    const cached = this.modelCache.get(path);
    if (!cached) return null;
    cached.info.lastAccessed = Date.now();
    cached.info.accessCount++;
    return cached.model.clone();
  }

  private calculateModelSize(model: THREE.Group): number {
    let size = 0;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geom = child.geometry;
        if (geom.attributes.position) size += geom.attributes.position.array.byteLength;
        if (geom.attributes.normal) size += geom.attributes.normal.array.byteLength;
        if (geom.attributes.uv) size += geom.attributes.uv.array.byteLength;
        if (geom.index) size += geom.index.array.byteLength;

        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          if (mat.map) size += this.calculateTextureSize(mat.map);
          if (mat.normalMap) size += this.calculateTextureSize(mat.normalMap);
        }
      }
    });
    return size;
  }

  private calculateTextureSize(texture: THREE.Texture): number {
    const img = texture.image;
    if (!img) return 0;
    // Simple approximation: width * height * 4 bytes (RGBA)
    return img.width * img.height * 4;
  }

  public cleanup(): void {
    const models = Array.from(this.modelCache.entries());
    models.sort((a, b) => {
      const aInfo = a[1].info;
      const bInfo = b[1].info;
      if (aInfo.priority !== bInfo.priority) return aInfo.priority - bInfo.priority; // Lower priority first
      const aScore = aInfo.accessCount / (Date.now() - aInfo.lastAccessed + 1);
      const bScore = bInfo.accessCount / (Date.now() - bInfo.lastAccessed + 1);
      return aScore - bScore; // Lower score first
    });

    let removedSize = 0;
    for (const [path, cached] of models) {
      if (this.currentMemoryUsage - removedSize <= this.MAX_MEMORY_USAGE * this.CLEANUP_THRESHOLD) break;
      this.modelCache.delete(path);
      removedSize += cached.info.size;
    }
    this.currentMemoryUsage -= removedSize;
  }

  public removeFromCache(path: string) {
    const cached = this.modelCache.get(path);
    if (cached) {
      this.currentMemoryUsage -= cached.info.size;
      this.modelCache.delete(path);
    }
  }

  public getMemoryUsage() {
    return {
      current: this.currentMemoryUsage,
      max: this.MAX_MEMORY_USAGE,
    };
  }
}

export const memoryManager = MemoryManager.getInstance();

// --- END ADVANCED MEMORY MANAGER ---


// --- ADVANCED COMPRESSION SYSTEM ---

// Helper functions for serialization
function serializeGeometry(geometry: THREE.BufferGeometry) {
  const attributes: { [name: string]: { array: TypedArray; itemSize: number } } = {};
  for (const name in geometry.attributes) {
    const attribute = geometry.attributes[name];
    attributes[name] = {
      array: attribute.array.slice(0), // Create a copy for transferring
      itemSize: attribute.itemSize,
    };
  }
  return {
    attributes,
    index: geometry.index ? { array: geometry.index.array.slice(0) } : null, // Create a copy for transferring
  };
}

function deserializeGeometry(data: { attributes: { [name: string]: { array: TypedArray; itemSize: number } }; index: { array: TypedArray } | null; quantization?: unknown }): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const name in data.attributes) {
    const attrData = data.attributes[name];
    let buffer;
    // Handle different quantized array types
    if (name === 'position') buffer = new Int16Array(attrData.array);
    else if (name === 'uv') buffer = new Uint16Array(attrData.array);
    else if (name === 'normal') buffer = new Int8Array(attrData.array);
    else buffer = new Float32Array(attrData.array);

    geometry.setAttribute(name, new THREE.BufferAttribute(buffer, attrData.itemSize));
  }
  if (data.index) {
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index.array), 1));
  }

  if (data.quantization) geometry.userData.quantization = data.quantization;
  return geometry;
}


class CompressionManager {
  private static instance: CompressionManager;
  private compressionLevels: Map<string, number> = new Map();
  private constructor() { }
  public static getInstance(): CompressionManager {
    if (!CompressionManager.instance) CompressionManager.instance = new CompressionManager();
    return CompressionManager.instance;
  }
  public async compressModel(model: THREE.Group, level: number = 1): Promise<THREE.Group> {
    const compressed = model.clone(true); // Deep clone
    const compressionPromises: Promise<void>[] = [];

    compressed.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const compressionPromise = this.compressGeometry(child.geometry, level).then(compressedGeom => {
          child.geometry.dispose(); // Dispose old geometry
          child.geometry = compressedGeom;
        });
        compressionPromises.push(compressionPromise);

        const mat = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach(() => this.compressMaterial());
        else this.compressMaterial();
      }
    });

    await Promise.all(compressionPromises);
    return compressed;
  }
  private async compressGeometry(geometry: THREE.BufferGeometry, level: number): Promise<THREE.BufferGeometry> {
    const serialized = serializeGeometry(geometry);
    const result = await workerManager.executeTask('COMPRESS_GEOMETRY', { geometry: serialized, level }) as { attributes: { [name: string]: { array: TypedArray; itemSize: number } }; index: { array: TypedArray } | null; quantization?: unknown };
    return deserializeGeometry(result);
  }
  private compressMaterial() {
    // Implementation from previous step
  }
  public setCompressionLevel(path: string, level: number) { this.compressionLevels.set(path, Math.max(1, Math.min(5, level))); }
  public getCompressionLevel(path: string): number { return this.compressionLevels.get(path) || 1; }
}
export const compressionManager = CompressionManager.getInstance();

// --- END ADVANCED COMPRESSION SYSTEM ---


// --- WEB WORKER MANAGER ---

interface WorkerTask {
  id: string;
  type: string;
  data: unknown;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

class WorkerManager {
  private static instance: WorkerManager;
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private MAX_WORKERS: number;
  private isBrowser: boolean;

  private constructor() {
    this.isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
    this.MAX_WORKERS = this.isBrowser ? Math.min(navigator.hardwareConcurrency || 4, 4) : 4;

    if (this.isBrowser) {
      this.initializeWorkers();
    }
  }

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  private initializeWorkers() {
    for (let i = 0; i < this.MAX_WORKERS; i++) {
      // Use the dedicated worker file
      const worker = new Worker(new URL('../workers/modelProcessor.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = this.handleWorkerMessage.bind(this);
      worker.onerror = this.handleWorkerError.bind(this);
      this.workers.push(worker);
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    // The new worker has a different message structure
    const { type, data, error } = event.data;

    // Find the task associated with this worker response. This is a simplification.
    // A robust implementation would match response to a specific task ID.
    const task = this.taskQueue.shift(); // Assuming FIFO for simplicity

    if (task) {
      this.activeTasks.delete(task.id);
      if (type.endsWith('_COMPLETE')) {
        task.resolve(data);
      } else if (type === 'ERROR') {
        task.reject(new Error(error));
      }
      this.processQueue();
    }
  }

  private handleWorkerError(event: ErrorEvent) {
    console.error('Worker error:', event.error);
    // It's important to find which task failed to reject its promise.
    // This is a simplified error handling. A more robust solution would
    // track which worker was running which task.
    this.processQueue();
  }

  private processQueue() {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.MAX_WORKERS) {
      const task = this.taskQueue.shift();
      if (task) {
        this._executeTaskOnWorker(task);
      }
    }
  }

  private _executeTaskOnWorker(task: WorkerTask) {
    const worker = this.workers[this.activeTasks.size % this.MAX_WORKERS];
    if (worker) {
      this.activeTasks.set(task.id, task);

      // The new worker expects a different data structure
      const geometryData = (task.data as { geometry: { attributes: Record<string, { array: { buffer: ArrayBuffer } }>; index?: { array: { buffer: ArrayBuffer } } | null } }).geometry;
      const transferableData = Object.values(geometryData.attributes).map(attr => attr.array.buffer);
      if (geometryData.index) {
        transferableData.push(geometryData.index.array.buffer);
      }

      worker.postMessage({
        type: task.type,
        data: task.data
      }, transferableData);
    } else {
      this.taskQueue.unshift(task);
    }
  }

  public executeTask(type: string, data: unknown): Promise<unknown> {
    if (!this.isBrowser) {
      return Promise.reject(new Error("Workers are not available in a non-browser environment."));
    }
    return new Promise((resolve, reject) => {
      const task: WorkerTask = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        data,
        resolve,
        reject
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  getWorkerStatus(): {
    total: number;
    active: number;
    queued: number;
  } {
    if (!this.isBrowser) {
      return { total: 0, active: 0, queued: 0 };
    }
    return {
      total: this.workers.length,
      active: this.activeTasks.size,
      queued: this.taskQueue.length
    };
  }

  terminateWorkers(): void {
    if (!this.isBrowser) return;
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.activeTasks.clear();
    this.taskQueue = [];
  }
}

export const workerManager = WorkerManager.getInstance();

// --- END WEB WORKER MANAGER ---


// --- MODEL GROUPING SYSTEM ---

class ModelGrouper {
  private static instance: ModelGrouper;
  private modelGroups: Map<string, { model: THREE.Group; instances: Map<string, THREE.Group> }> = new Map();
  private constructor() { }
  public static getInstance(): ModelGrouper {
    if (!ModelGrouper.instance) ModelGrouper.instance = new ModelGrouper();
    return ModelGrouper.instance;
  }
  public createInstance(path: string, instanceId: string): THREE.Group | null {
    let group = this.modelGroups.get(path);

    // If the base model isn't loaded and grouped yet, try to get it from the memory manager
    if (!group) {
      const modelFromCache = memoryManager.getModel(path);
      if (!modelFromCache) {
        console.warn(`[ModelGrouper] Base model not found in cache for path: ${path}`);
        return null;
      }
      group = { model: modelFromCache, instances: new Map() };
      this.modelGroups.set(path, group);
    }

    // Create a new instance (clone) of the base model
    const instance = group.model.clone();
    group.instances.set(instanceId, instance);

    return instance;
  }
  public removeInstance() { }
  public updateGroupModel() { }

  public cleanupOldGroups() {
    // Placeholder for cleaning up old, unused model groups
  }
}
export const modelGrouper = ModelGrouper.getInstance();

// --- END MODEL GROUPING SYSTEM ---


// --- OCCLUSION CULLING MANAGER ---

interface OcclusionObject {
  object: THREE.Object3D;
  boundingBox: THREE.Box3;
  boundingSphere: THREE.Sphere;
  visible: boolean;
  lastCheck: number;
}

class OcclusionCullingManager {
  private static instance: OcclusionCullingManager;
  private objects: Map<string, OcclusionObject> = new Map();
  private camera: THREE.Camera | null = null;
  private occlusionMap: THREE.WebGLRenderTarget | null = null;
  private checkInterval = 100; // ms
  private lastCheck = 0;
  private renderer: THREE.WebGLRenderer | null = null;

  private constructor() { }

  static getInstance(): OcclusionCullingManager {
    if (!OcclusionCullingManager.instance) {
      OcclusionCullingManager.instance = new OcclusionCullingManager();
    }
    return OcclusionCullingManager.instance;
  }

  initialize(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.renderer = renderer;
    this.camera = camera;

    // Create occlusion map
    this.occlusionMap = new THREE.WebGLRenderTarget(256, 256, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat
    });
  }

  addObject(id: string, object: THREE.Object3D) {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const boundingSphere = new THREE.Sphere();
    boundingBox.getBoundingSphere(boundingSphere);

    this.objects.set(id, {
      object,
      boundingBox,
      boundingSphere,
      visible: true,
      lastCheck: 0
    });
  }

  removeObject(id: string) {
    this.objects.delete(id);
  }

  update() {
    if (!this.camera || !this.renderer || !this.occlusionMap) return;

    const now = Date.now();
    if (now - this.lastCheck < this.checkInterval) return;

    this.lastCheck = now;

    // Render occlusion map
    this.renderer.setRenderTarget(this.occlusionMap);
    this.renderer.clear();

    // Check each object
    this.objects.forEach((occlusionObject) => {
      const isVisible = this.checkVisibility(occlusionObject);
      if (isVisible !== occlusionObject.visible) {
        occlusionObject.visible = isVisible;
        occlusionObject.object.visible = isVisible;
      }
      occlusionObject.lastCheck = now;
    });

    this.renderer.setRenderTarget(null);
  }

  private checkVisibility(occlusionObject: OcclusionObject): boolean {
    if (!this.camera) return false;

    // Frustum culling
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      )
    );

    if (!frustum.intersectsSphere(occlusionObject.boundingSphere)) {
      return false;
    }

    // Distance culling
    const distance = this.camera.position.distanceTo(occlusionObject.boundingSphere.center);
    if (distance > occlusionObject.boundingSphere.radius * 10) {
      return false;
    }

    // Simple occlusion test (can be enhanced with actual occlusion query)
    return true;
  }

  setCheckInterval(interval: number) {
    this.checkInterval = Math.max(16, interval); // Minimum 16ms (60fps)
  }

  getVisibleObjects(): THREE.Object3D[] {
    const visible: THREE.Object3D[] = [];
    this.objects.forEach(occlusionObject => {
      if (occlusionObject.visible) {
        visible.push(occlusionObject.object);
      }
    });
    return visible;
  }

  getOcclusionStats(): {
    total: number;
    visible: number;
    culled: number;
  } {
    let visible = 0;
    this.objects.forEach(occlusionObject => {
      if (occlusionObject.visible) visible++;
    });

    return {
      total: this.objects.size,
      visible,
      culled: this.objects.size - visible
    };
  }
}

export const occlusionCullingManager = OcclusionCullingManager.getInstance();

// --- END OCCLUSION CULLING MANAGER ---


// --- LOD MANAGER ---

class LODManager {
  private static instance: LODManager;
  private camera: THREE.Camera | null = null;

  private constructor() { }

  static getInstance(): LODManager {
    if (!LODManager.instance) {
      LODManager.instance = new LODManager();
    }
    return LODManager.instance;
  }

  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }

  updateLODDistances(qualityLevel: number) {
    console.log(`[LODManager] Updating LOD distances with quality level: ${qualityLevel}`);
    // In a full implementation, this would adjust LOD distances on relevant objects
  }
}

export const lodManager = LODManager.getInstance();

// --- END LOD MANAGER ---


// --- DYNAMIC PERFORMANCE OPTIMIZER ---

interface PerformanceMetrics {
  fps: number;
  memory: number;
  drawCalls: number;
  triangles: number;
}

class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private metrics: PerformanceMetrics = {
    fps: 60,
    memory: 0,
    drawCalls: 0,
    triangles: 0
  };
  private targetFPS = 60;
  private targetMemory = 500 * 1024 * 1024; // 500MB
  private qualityLevel = 1;
  private lastOptimization = 0;
  private optimizationInterval = 5000; // 5 seconds
  private renderer: THREE.WebGLRenderer | null = null;

  private constructor() { }

  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  initialize(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.startMonitoring();
  }

  private startMonitoring() {
    let lastTime = performance.now();
    let frames = 0;

    const monitor = () => {
      const now = performance.now();
      frames++;

      if (now - lastTime >= 1000) {
        this.metrics.fps = Math.round((frames * 1000) / (now - lastTime));
        frames = 0;
        lastTime = now;

        this.updateMetrics();
        this.optimize();
      }

      requestAnimationFrame(monitor);
    };

    monitor();
  }

  private updateMetrics() {
    if (!this.renderer) return;

    const info = this.renderer.info;
    this.metrics.drawCalls = info.render.calls;
    this.metrics.triangles = info.render.triangles;

    // @ts-expect-error performance.memory is a non-standard API.
    if (performance.memory) {
      // @ts-expect-error performance.memory is a non-standard API.
      this.metrics.memory = performance.memory.usedJSHeapSize;
    }
  }

  private optimize() {
    const now = Date.now();
    if (now - this.lastOptimization < this.optimizationInterval) return;

    this.lastOptimization = now;

    // Adjust quality based on performance
    if (this.metrics.fps < this.targetFPS * 0.8) {
      this.decreaseQuality();
    } else if (this.metrics.fps > this.targetFPS * 0.9 && this.qualityLevel < 1) {
      this.increaseQuality();
    }

    // Memory optimization
    if (this.metrics.memory > this.targetMemory * 0.8) {
      this.optimizeMemory();
    }
  }

  private decreaseQuality() {
    this.qualityLevel = Math.max(0.1, this.qualityLevel - 0.1);
    this.applyQualitySettings();
  }

  private increaseQuality() {
    this.qualityLevel = Math.min(1, this.qualityLevel + 0.1);
    this.applyQualitySettings();
  }

  private applyQualitySettings() {
    // Update compression levels
    compressionManager.setCompressionLevel('*', this.qualityLevel);

    // Update LOD distances
    lodManager.updateLODDistances(this.qualityLevel);

    // Update occlusion culling
    occlusionCullingManager.setCheckInterval(
      Math.round(100 / this.qualityLevel)
    );
  }

  private optimizeMemory() {
    // Clear unused resources
    memoryManager.cleanup();

    // Force garbage collection if available
    const gc = (window as Window & { gc?: () => void }).gc;
    if (gc) {
      gc();
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getQualityLevel(): number {
    return this.qualityLevel;
  }

  setTargetFPS(fps: number) {
    this.targetFPS = Math.max(30, Math.min(120, fps));
  }

  setTargetMemory(bytes: number) {
    this.targetMemory = Math.max(100 * 1024 * 1024, bytes); // Minimum 100MB
  }

  setOptimizationInterval(ms: number) {
    this.optimizationInterval = Math.max(1000, ms); // Minimum 1 second
  }

  update() {
    // The optimization logic is already running via requestAnimationFrame in startMonitoring.
    // This update method can be used for any additional per-frame logic if needed in the future.
  }
}

export const performanceOptimizer = PerformanceOptimizer.getInstance();

// --- END DYNAMIC PERFORMANCE OPTIMIZER ---


// --- RETRY AND CANCELLATION SYSTEM ---

class RetryManager {
  private static instance: RetryManager;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private _dracoLoader: DRACOLoader | null = null; // Add private dracoLoader

  private constructor() { }
  public static getInstance(): RetryManager {
    if (!RetryManager.instance) RetryManager.instance = new RetryManager();
    return RetryManager.instance;
  }

  public setDracoLoader(loader: DRACOLoader): void {
    this._dracoLoader = loader;
  }

  public async loadWithRetry(path: string, compress: boolean, instanceId: string | undefined, priority: LoadPriority, abortController: AbortController): Promise<THREE.Group> {
    const cachedModel = memoryManager.getModel(path);
    if (cachedModel) return cachedModel;

    for (let i = 0; i < this.MAX_RETRIES; i++) {
      if (abortController.signal.aborted) throw new Error('Load cancelled');
      try {
        const model = await this.loadModelInternal(path, compress, priority, abortController.signal);
        memoryManager.cacheModel(path, model, priority);
        return model.clone();
      } catch (error) {
        if (i === this.MAX_RETRIES - 1) throw error;
        await new Promise(res => setTimeout(res, this.RETRY_DELAY));
      }
    }
    throw new Error(`Failed to load model at ${path}`);
  }

  private async loadModelInternal(path: string, compress: boolean, priority: LoadPriority, signal: AbortSignal): Promise<THREE.Group> {
    // OFFLINE-FIRST: Always try IndexedDB first, never load from network during gameplay
    const cachedData = await getModel(path); // Use full path as key for consistency
    if (cachedData) {
      console.log(`[RetryManager] ✓ Loading model from IndexedDB (offline-first): ${path}`);
      const loader = new GLTFLoader();
      if (this._dracoLoader) {
        loader.setDRACOLoader(this._dracoLoader);
      }

      signal.throwIfAborted();
      const gltf = await loader.parseAsync(cachedData, path);
      let model = gltf.scene;

      if (compress) {
        const level = compressionManager.getCompressionLevel(path);
        model = await compressionManager.compressModel(model, level);
      }
      return model;
    }

    // EMERGENCY FALLBACK: Only in development or when asset is missing from preload
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[RetryManager] ⚠️ Asset not found in IndexedDB, attempting emergency network load: ${path}`);
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        // Cache for future use
        await putModel(path, arrayBuffer);

        const loader = new GLTFLoader();
        if (this._dracoLoader) {
          loader.setDRACOLoader(this._dracoLoader);
        }

        signal.throwIfAborted();
        const gltf = await loader.parseAsync(arrayBuffer, path);
        let model = gltf.scene;

        if (compress) {
          const level = compressionManager.getCompressionLevel(path);
          model = await compressionManager.compressModel(model, level);
        }

        console.log(`[RetryManager] ✓ Emergency load successful and cached: ${path}`);
        return model;
      } catch (networkError) {
        console.error(`[RetryManager] ✗ Emergency network load failed for: ${path}`, networkError);
        throw new Error(`Asset not available offline and network load failed: ${path}`);
      }
    }

    // PRODUCTION: Asset must be preloaded, throw error if not found
    throw new Error(`Asset not found in IndexedDB preload cache (offline-first mode): ${path}`);
  }
}
export const retryManager = RetryManager.getInstance();

// --- END RETRY AND CANCELLATION SYSTEM ---


// --- ADVANCED PRIORITY SYSTEM ---

class PriorityManager {
  private static instance: PriorityManager;
  private loadQueues: Map<LoadPriority, PriorityRequest[]> = new Map();
  private activeLoads: Map<string, AbortController> = new Map();
  private readonly MAX_CONCURRENT_LOADS = 3;
  private processingQueue = false;

  private constructor() {
    const priorities = Object.values(LoadPriority).filter(v => typeof v === 'number') as LoadPriority[];
    for (const priority of priorities) this.loadQueues.set(priority, []);
  }

  public static getInstance(): PriorityManager {
    if (!PriorityManager.instance) PriorityManager.instance = new PriorityManager();
    return PriorityManager.instance;
  }

  public addToQueue(path: string, priority: LoadPriority, compress: boolean, instanceId?: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const request: PriorityRequest = { path, priority, resolve, reject, compress, instanceId };
      this.loadQueues.get(priority)?.push(request);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;
    while (this.activeLoads.size < this.MAX_CONCURRENT_LOADS) {
      const request = this.getNextRequest();
      if (!request) break;
      const abortController = new AbortController();
      this.activeLoads.set(request.path, abortController);
      try {
        const model = await retryManager.loadWithRetry(request.path, request.compress, request.instanceId, request.priority, abortController);
        request.resolve(model);
      } catch (error) {
        request.reject(error);
      } finally {
        this.activeLoads.delete(request.path);
      }
    }
    this.processingQueue = false;
    if (Array.from(this.loadQueues.values()).some(q => q.length > 0)) this.processQueue();
  }

  private getNextRequest(): PriorityRequest | null {
    const priorities = Object.values(LoadPriority).filter(v => typeof v === 'number').sort((a, b) => (a as number) - (b as number)) as LoadPriority[];
    for (const priority of priorities) {
      const queue = this.loadQueues.get(priority);
      if (queue && queue.length > 0) return queue.shift()!;
    }
    return null;
  }

  public getQueueStatus() {
    let total = 0;
    this.loadQueues.forEach(queue => total += queue.length);
    return {
      active: this.activeLoads.size,
      queued: total,
    };
  }
}
export const priorityManager = PriorityManager.getInstance();

// --- END ADVANCED PRIORITY SYSTEM ---


// --- PUBLIC API ---

export const loadGLTF = (path: string, compress: boolean = true, instanceId?: string, priority: LoadPriority = LoadPriority.MEDIUM): Promise<THREE.Group> => {
  const promise = priorityManager.addToQueue(path, priority, compress, instanceId);
  promise.then(model => {
    // Automatically add loaded models to the occlusion culling system
    const id = instanceId || path;
    occlusionCullingManager.addObject(id, model);
  }).catch(error => {
    console.error(`Failed to load model for occlusion culling: ${path}`, error);
  });
  return promise;
};

// --- UNIFIED MODEL LOADER FACADE ---

class ModelLoader {
  private static instance: ModelLoader;
  private initialized = false;
  private dracoLoader: DRACOLoader | null = null;

  private constructor() { }

  static getInstance(): ModelLoader {
    if (!ModelLoader.instance) {
      ModelLoader.instance = new ModelLoader();
    }
    return ModelLoader.instance;
  }

  async initialize(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (this.initialized) return;

    // Initialize all systems
    // Note: Most managers are singletons and don't need explicit async init,
    // but this structure is kept for potential future async initializations.
    // Initialize DRACOLoader
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('/libs/draco/'); // Set the path to the Draco decoder
    console.log("[ModelLoader] DRACOLoader initialized. Decoder path set.");

    // Preload the DRACO decoder files
    await this.dracoLoader.preload();
    console.log("[ModelLoader] DRACOLoader decoder preloaded.");

    retryManager.setDracoLoader(this.dracoLoader); // Pass dracoLoader to RetryManager
    console.log("[ModelLoader] DRACOLoader passed to RetryManager.");

    await Promise.all([
      Promise.resolve(workerManager),
      Promise.resolve(lodManager),
      Promise.resolve(retryManager),
      Promise.resolve(modelGrouper),
      Promise.resolve(compressionManager),
      Promise.resolve(priorityManager),
      Promise.resolve(memoryManager),
      Promise.resolve(occlusionCullingManager),
      Promise.resolve(performanceOptimizer)
    ]);

    // Setup systems that require external objects
    occlusionCullingManager.initialize(renderer, camera);
    performanceOptimizer.initialize(renderer);
    lodManager.setCamera(camera);

    this.initialized = true;
    console.log("ModelLoader and all subsystems initialized.");
  }

  async loadModel(
    path: string,
    compress: boolean = true,
    priority: LoadPriority = LoadPriority.MEDIUM,
    instanceId?: string
  ): Promise<THREE.Group> {
    if (!this.initialized) {
      throw new Error('ModelLoader not initialized. Call initialize() first.');
    }

    // The existing loadGLTF function already handles the priority queue and caching logic.
    // We can call it directly. In a larger refactor, this logic would be moved inside this class.
    // For now, we wrap the existing public API.
    const model = await loadGLTF(path, compress, instanceId, priority);

    // The createInstance logic from ModelGrouper should be properly integrated here.
    // For now, we return the cloned model directly from the loader.
    const groupInstance = modelGrouper.createInstance(path, instanceId || path);

    return groupInstance ? groupInstance : model;
  }

  update() {
    if (!this.initialized) return;

    // Update all systems that require per-frame updates
    occlusionCullingManager.update();
    performanceOptimizer.update(); // This is currently a no-op but good practice to keep
    modelGrouper.cleanupOldGroups(); // Placeholder for now
  }

  getStatus() {
    if (!this.initialized) {
      return { error: "ModelLoader not initialized." };
    }
    return {
      memory: memoryManager.getMemoryUsage(),
      performance: performanceOptimizer.getMetrics(),
      workers: workerManager.getWorkerStatus(),
      occlusion: occlusionCullingManager.getOcclusionStats(),
      queue: priorityManager.getQueueStatus()
    };
  }
}

export const modelLoader = ModelLoader.getInstance();

// --- END UNIFIED MODEL LOADER FACADE ---

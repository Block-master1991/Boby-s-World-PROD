import { isDev } from '@/lib/config/env';
import type * as THREE from 'three';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { getModel, putModel } from '../../lib/indexedDB';
import { logger } from '../logger';
import { compressionManager } from './CompressionManager';
import { memoryManager } from './MemoryManager';
import { type LoadOptions } from './types';

export class RetryManager {
  private static instance: RetryManager;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private _dracoLoader: DRACOLoader | null = null;

  private constructor() { }

  public static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  public setDracoLoader(loader: DRACOLoader): void {
    this._dracoLoader = loader;
  }

  public async loadWithRetry(options: LoadOptions): Promise<THREE.Group> {
    const { path, priority, abortController } = options;
    
    const cachedModel = memoryManager.getModel(path);
    if (cachedModel) return cachedModel;

    for (let i = 0; i < this.MAX_RETRIES; i++) {
      if (abortController.signal.aborted) throw new Error('Load cancelled');
      try {
        // eslint-disable-next-line no-await-in-loop
        const model = await this.loadModelInternal(options);
        memoryManager.cacheModel(path, model, priority);
        return model.clone();
      } catch (error) {
        if (i === this.MAX_RETRIES - 1) throw error;
        // eslint-disable-next-line no-await-in-loop
        await new Promise(res => setTimeout(res, this.RETRY_DELAY));
      }
    }
    throw new Error(`Failed to load model at ${path}`);
  }

  private async loadModelInternal(options: LoadOptions): Promise<THREE.Group> {
    const { path, compress, abortController } = options;
    const {signal} = abortController;

    // OFFLINE-FIRST: Always try IndexedDB first
    let arrayBuffer: ArrayBuffer | undefined | null = await getModel(path);
    
    if (arrayBuffer) {
      logger.log(`[RetryManager] ✓ Loading model from IndexedDB (offline-first): ${path}`);
    } else if (isDev) {
      arrayBuffer = await this.emergencyNetworkLoad(path);
    }

    if (!arrayBuffer) {
      throw new Error(`Asset not found in IndexedDB preload cache (offline-first mode): ${path}`);
    }

    signal.throwIfAborted();
    let model = await this.parseGltfBuffer(arrayBuffer, path);

    if (compress) {
      const level = compressionManager.getCompressionLevel(path);
      model = await compressionManager.compressModel(model, level);
    }

    return model;
  }

  private async emergencyNetworkLoad(path: string): Promise<ArrayBuffer | null> {
    logger.warn(`[RetryManager] ⚠️ Asset not found in IndexedDB, attempting emergency network load: ${path}`);
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      // Cache for future use
      await putModel(path, arrayBuffer);
      logger.log(`[RetryManager] ✓ Emergency load successful and cached: ${path}`);
      return arrayBuffer;
    } catch (networkError) {
      logger.error(`[RetryManager] ✗ Emergency network load failed for: ${path}`, networkError);
      return null;
    }
  }

  private async parseGltfBuffer(buffer: ArrayBuffer, path: string): Promise<THREE.Group> {
    const loader = new GLTFLoader();
    if (this._dracoLoader) {
      loader.setDRACOLoader(this._dracoLoader);
    }

    const gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.parse(buffer, path, resolve, reject);
    });

    return gltf.scene;
  }
}

export const retryManager = RetryManager.getInstance();

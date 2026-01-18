import * as THREE from 'three';
import { logger } from 'utils/logger';
import { RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../chunkUtils';
import { WORLD_MAX_BOUND, WORLD_MIN_BOUND } from '../constants';
import type { Flowers } from '../ez-tree/environment/flowers';
import type { Grass } from '../ez-tree/environment/grass';
import type { Rocks } from '../ez-tree/environment/rocks';
import type { Trees } from '../ez-tree/environment/trees';
import { ChunkContentManager } from './ChunkContentManager';
import type { ChunkContent, ChunkData, ChunkManagerEventMap } from './types';

export class ChunkManager extends THREE.Object3D<ChunkManagerEventMap> {
  private worker: Worker;
  private loadedChunks = new Map<string, ChunkContent>();
  private playerPosition = new THREE.Vector3();
  private lastPlayerChunk: { chunkX: number; chunkZ: number } | null = null;
  private loadingQueue: string[] = [];
  private unloadingQueue: string[] = [];
  private isProcessingQueue = false;
  private _generatorsReady = false;
  private contentManager: ChunkContentManager;
  private pendingResolves = new Map<string, (data: ChunkData) => void>();

  constructor(
    private grassGenerator: Grass,
    private rocksGenerator: Rocks,
    private treesGenerator: Trees,
    private flowersGenerator: Flowers
  ) {
    super();
    this.name = 'ChunkManager';
    this.contentManager = new ChunkContentManager(grassGenerator, rocksGenerator, treesGenerator, flowersGenerator);
    this.worker = new Worker(new URL('../../workers/chunkWorker.ts', import.meta.url));
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { chunkKey, grassData, rocksData, treesData, flowersData, gameplayData } = e.data;
    const resolve = this.pendingResolves.get(chunkKey);
    if (resolve) {
      this.pendingResolves.delete(chunkKey);
      resolve(e.data);
    } else {
      const chunk = this.loadedChunks.get(chunkKey);
      if (chunk) {
        const data: ChunkData = { grassData, rocksData, treesData, flowersData, gameplayData };
        this.contentManager.populateChunk(chunk, data);
        this.contentManager.addContentToScene(this, chunk);
        logger.log(`[ChunkManager] Populated chunk ${chunkKey} (Fallback)`);
      }
    }
  }

  public updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
    this.updateChunks();
  }

  private updateChunks(): void {
    const { chunkX: cx, chunkZ: cz } = getChunkCoordinates(this.playerPosition.x, this.playerPosition.z);
    if (this.lastPlayerChunk?.chunkX === cx && this.lastPlayerChunk?.chunkZ === cz) return;
    this.lastPlayerChunk = { chunkX: cx, chunkZ: cz };

    const toKeep = new Set<string>();
    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        const key = getChunkKey(cx + x, cz + z);
        toKeep.add(key);
        if (!this.loadedChunks.has(key)) this.loadingQueue.push(key);
      }
    }

    for (const [key] of this.loadedChunks.entries()) {
      if (!toKeep.has(key)) this.unloadingQueue.push(key);
    }

    if (!this.isProcessingQueue) this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    if (!this._generatorsReady && this.loadingQueue.length > 0) {
      this.isProcessingQueue = false; return;
    }

    if (this.unloadingQueue.length > 0) {
      const key = this.unloadingQueue.shift()!;
      const chunk = this.loadedChunks.get(key);
      if (chunk) { this.unloadChunk(chunk); this.loadedChunks.delete(key); }
    } else if (this.loadingQueue.length > 0) {
      const key = this.loadingQueue.shift()!;
      const { chunkX, chunkZ } = this.parseChunkKey(key);
      if (!this.loadedChunks.has(key)) {
        const chunk = await this.loadChunkModern(chunkX, chunkZ);
        if (!this.loadedChunks.has(key)) {
          this.loadedChunks.set(key, chunk);
          this.contentManager.addContentToScene(this, chunk);
        }
      }
    }

    this.isProcessingQueue = false;
    if (this.unloadingQueue.length > 0 || this.loadingQueue.length > 0) {
      requestAnimationFrame(() => this.processQueue());
    }
  }

  public setGeneratorsReady(): void {
    this._generatorsReady = true;
    logger.log("[ChunkManager] Generators are ready. Starting queue processing.");
    if (!this.isProcessingQueue) this.processQueue();
  }

  private parseChunkKey(key: string): { chunkX: number; chunkZ: number } {
    const parts = key.split(',').map(v => parseInt(v));
    const x = parts[0] ?? 0;
    const z = parts[1] ?? 0;
    return { chunkX: x, chunkZ: z };
  }

  private loadChunkModern(chunkX: number, chunkZ: number): Promise<ChunkContent> {
    const key = getChunkKey(chunkX, chunkZ);
    if (!this.grassGenerator || !this.rocksGenerator || !this.treesGenerator || !this.flowersGenerator) {
      return Promise.resolve(this.createFallbackChunk(key));
    }
    const chunk: ChunkContent = {
      id: key, grassMesh: null, rocksGroup: null, treesGroup: null, flowersGroup: null,
      objects: [], isLoaded: false, isDisposed: false, gameplayData: { coinSpawns: [], enemySpawns: [] }
    };
    return this.generateChunkWithRetry(chunk, chunkX, chunkZ);
  }

  private handleChunkData(chunk: ChunkContent, data: ChunkData): void {
    try {
      this.contentManager.populateChunk(chunk, data);
      this.dispatchEvent({ type: 'chunk-loaded', chunkKey: chunk.id, chunk });
    } catch (e) {
      logger.warn(`[ChunkManager] Population failed for ${chunk.id}:`, e);
      chunk.isLoaded = true;
      this.dispatchEvent({ type: 'chunk-loaded', chunkKey: chunk.id, chunk });
    }
  }

  public getGameplaySpawns(key: string) {
    const chunk = this.loadedChunks.get(key);
    return chunk?.gameplayData || null;
  }

  private unloadChunk(chunk: ChunkContent): void {
    this.contentManager.unloadChunk(this, chunk);
  }

  public updateModern(elapsedTime: number): void {
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
        const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
        mats.forEach((m) => {
          const s = m.userData['shader'] as { uniforms: { uTime: { value: number } } } | undefined;
          if (s) s.uniforms.uTime.value = elapsedTime;
        });
      }
    });
    if (this.treesGenerator) this.treesGenerator.update(elapsedTime);
    if (this.flowersGenerator) this.flowersGenerator.updateWindEffect(elapsedTime);
  }

  public async generateChunkAsync(chunkX: number, chunkZ: number): Promise<void> {
    const key = getChunkKey(chunkX, chunkZ);
    if (this.loadedChunks.has(key)) return;
    try {
      const chunk = await this.loadChunkModern(chunkX, chunkZ);
      if (!this.loadedChunks.has(key)) {
        this.loadedChunks.set(key, chunk);
        this.contentManager.addContentToScene(this, chunk);
      }
    } catch (e) {
      logger.error(`[ChunkManager] Preload failed for ${key}:`, e);
    }
  }

  public dispose(): void {
    this.loadedChunks.forEach(c => this.unloadChunk(c));
    this.loadedChunks.clear();
    this.worker.terminate();
  }

  private createFallbackChunk(key: string): ChunkContent {
    const chunk: ChunkContent = {
      id: key, grassMesh: null, rocksGroup: null, treesGroup: null, flowersGroup: null,
      objects: [], isLoaded: true, isDisposed: false, gameplayData: { coinSpawns: [], enemySpawns: [] }
    };
    this.dispatchEvent({ type: 'chunk-loaded', chunkKey: key, chunk });
    return chunk;
  }

  private async generateChunkWithRetry(chunk: ChunkContent, cx: number, cz: number, max = 10): Promise<ChunkContent> {
    const key = chunk.id;
    /* eslint-disable no-await-in-loop */
    for (let i = 1; i <= max; i++) {
      try {
        return await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 45000);
          this.pendingResolves.set(key, (data) => {
            clearTimeout(t); this.handleChunkData(chunk, data); resolve(chunk);
          });
          this.worker.postMessage({
            chunkX: cx, chunkZ: cz, grassOptions: this.grassGenerator.options,
            rocksOptions: this.rocksGenerator.options, treesOptions: this.treesGenerator.options,
            flowersOptions: this.flowersGenerator.options, chunkKey: key,
            worldMin: WORLD_MIN_BOUND, worldMax: WORLD_MAX_BOUND,
          });
        });
      } catch {
        if (i < max) await new Promise(r => setTimeout(r, 1000 * i));
      }
    }
    /* eslint-enable no-await-in-loop */
    logger.error(`[ChunkManager] All attempts failed for chunk ${key}`);
    chunk.isLoaded = true;
    this.dispatchEvent({ type: 'chunk-loaded', chunkKey: key, chunk });
    return chunk;
  }
}

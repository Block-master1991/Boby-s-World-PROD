import * as THREE from "three";
import { logger } from "utils/logger";
import {
  CHUNK_SIZE,
  RENDER_DISTANCE_CHUNKS,
  getChunkCoordinates,
  getChunkKey,
} from "../chunkUtils";
import { WORLD_MAX_BOUND, WORLD_MIN_BOUND } from "../constants";
import type { Flowers } from "../ez-tree/environment/flowers";
import type { Grass } from "../ez-tree/environment/grass";
import type { Rocks } from "../ez-tree/environment/rocks";
import type { Trees } from "../ez-tree/environment/trees";
import { ChunkContentManager } from "./ChunkContentManager";
import type { ChunkContent, ChunkData, ChunkManagerEventMap } from "./types";

export class ChunkManager extends THREE.Object3D<ChunkManagerEventMap> {
  private worker: Worker;
  private loadedChunks = new Map<string, ChunkContent>();
  private playerPosition = new THREE.Vector3();
  private lastPlayerChunk: { chunkX: number; chunkZ: number } | null = null;
  private loadingQueue: string[] = [];
  private unloadingQueue: string[] = [];
  // private readonly BATCH_SIZE = 3;
  private readonly MAX_LOADED_CHUNKS = 30; // Optimized: Closer to 5x5 (25) visible range + buffer
  private isProcessingQueue = false;
  private _generatorsReady = false;
  private contentManager: ChunkContentManager;
  private pendingResolves = new Map<string, (data: ChunkData) => void>();
  private pendingTreeGroups = new Map<string, { group: THREE.Group; timeoutId: number }>();
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  constructor(
    private grassGenerator: Grass,
    private rocksGenerator: Rocks,
    private treesGenerator: Trees,
    private flowersGenerator: Flowers
  ) {
    super();
    this.name = "ChunkManager";
    this.contentManager = new ChunkContentManager(
      grassGenerator,
      rocksGenerator,
      treesGenerator,
      flowersGenerator
    );
    this.worker = new Worker(new URL("../../workers/chunkWorker.ts", import.meta.url));
    this.worker.onmessage = e => this.handleWorkerMessage(e);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { chunkKey, grassData, rocksData, treesData, flowersData, gameplayData } = e.data;

    /* // Log chunk contents for performance analysis
    const totalElements = grassData.positions.length / 3 + rocksData.positions.length / 3 +
                         treesData.positions.length / 3 + flowersData.positions.length / 3;
    logger.log(`[ChunkManager] Chunk ${chunkKey} loaded - Elements: ${totalElements} (Grass: ${grassData.positions.length/3}, Rocks: ${rocksData.positions.length/3}, Trees: ${treesData.positions.length/3}, Flowers: ${flowersData.positions.length/3})`); */

    const resolve = this.pendingResolves.get(chunkKey);
    if (resolve) {
      this.pendingResolves.delete(chunkKey);
      resolve(e.data);
    } else {
      const chunk = this.loadedChunks.get(chunkKey);
      if (chunk) {
        this.contentManager.populateChunk(chunk, {
          grassData,
          rocksData,
          treesData,
          flowersData,
          gameplayData,
        });
        this.contentManager.addContentToScene(this, chunk);
      }
    }
  }

  public updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
    this.updateChunks();
  }

  private updateChunks(): void {
    const { chunkX: cx, chunkZ: cz } = getChunkCoordinates(
      this.playerPosition.x,
      this.playerPosition.z
    );
    if (this.lastPlayerChunk?.chunkX === cx && this.lastPlayerChunk?.chunkZ === cz) return;
    this.lastPlayerChunk = { chunkX: cx, chunkZ: cz };
    /* const playerDistance = Math.sqrt(cx * cx + cz * cz) * CHUNK_SIZE;
    logger.log(`[ChunkManager] Player at chunk (${cx}, ${cz}) - Distance: ${playerDistance.toFixed(1)} units - Loaded chunks: ${this.loadedChunks.size}/${this.MAX_LOADED_CHUNKS}`); */
    const toKeep = new Set<string>();
    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        const key = getChunkKey(cx + x, cz + z);
        toKeep.add(key);
        // Prevent overloading: only add to queue if we won't exceed safe limit
        if (
          !this.loadedChunks.has(key) &&
          !this.loadingQueue.includes(key) &&
          this.loadedChunks.size + this.loadingQueue.length < this.MAX_LOADED_CHUNKS + 5
        ) {
          this.loadingQueue.push(key);
        }
      }
    }

    for (const [key] of this.loadedChunks.entries()) {
      if (!toKeep.has(key)) this.unloadingQueue.push(key);
    }

    this.sortLoadingQueueByDistance();
    if (!this.isProcessingQueue) this.processQueue();
  }

  private sortLoadingQueueByDistance(): void {
    if (this.loadingQueue.length <= 1) return;
    const { chunkX: px, chunkZ: pz } = this.lastPlayerChunk!;
    this.loadingQueue.sort((a, b) => {
      const aC = this.parseChunkKey(a);
      const bC = this.parseChunkKey(b);
      return (
        Math.abs(aC.chunkX - px) +
        Math.abs(aC.chunkZ - pz) -
        (Math.abs(bC.chunkX - px) + Math.abs(bC.chunkZ - pz))
      );
    });
  }

  private queueTreeGroupForRemoval(key: string, treeGroup: THREE.Group): void {
    const existing = this.pendingTreeGroups.get(key);
    if (existing) {
      clearTimeout(existing.timeoutId);
      existing.group.parent?.remove(existing.group);
      this.pendingTreeGroups.delete(key);
    }

    const timeoutId = window.setTimeout(() => {
      const pending = this.pendingTreeGroups.get(key);
      if (pending) {
        pending.group.parent?.remove(pending.group);
        this.pendingTreeGroups.delete(key);
      }
    }, 3000);

    this.pendingTreeGroups.set(key, { group: treeGroup, timeoutId });
  }

  private unloadChunkWithTreePreservation(key: string, chunk: ChunkContent): void {
    const treeGroup = chunk.treesGroup;
    this.contentManager.unloadChunk(this, chunk);
    if (treeGroup) {
      this.queueTreeGroupForRemoval(key, treeGroup);
      chunk.treesGroup = null;
    }
    this.loadedChunks.delete(key);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (
      this.unloadingQueue.length > 0 ||
      (this._generatorsReady && this.loadingQueue.length > 0)
    ) {
      if (this.unloadingQueue.length > 0) this.processUnloadQueue();
      if (this.loadedChunks.size > this.MAX_LOADED_CHUNKS && this.lastPlayerChunk)
        this.processForcedUnload();
      if (
        this._generatorsReady &&
        this.loadingQueue.length > 0 &&
        this.loadedChunks.size < this.MAX_LOADED_CHUNKS
      ) {
        // eslint-disable-next-line no-await-in-loop
        await this.processLoadQueue();
      }

      if (this.unloadingQueue.length > 0 || this.loadingQueue.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => requestAnimationFrame(r));
      }
    }

    this.isProcessingQueue = false;
  }

  private processUnloadQueue(): void {
    const unloadBatch = this.unloadingQueue.splice(0, 1);
    for (const key of unloadBatch) {
      const chunk = this.loadedChunks.get(key);
      if (chunk) this.unloadChunkWithTreePreservation(key, chunk);
    }
  }

  private processForcedUnload(): void {
    const { chunkX: px, chunkZ: pz } = this.lastPlayerChunk!;
    const sorted = [...this.loadedChunks.entries()]
      .map(([k]) => {
        const c = this.parseChunkKey(k);
        return { key: k, dist: Math.abs(c.chunkX - px) + Math.abs(c.chunkZ - pz) };
      })
      .sort((a, b) => b.dist - a.dist);

    const toRemove = sorted.slice(0, this.loadedChunks.size - this.MAX_LOADED_CHUNKS);
    for (const { key } of toRemove) {
      const chunk = this.loadedChunks.get(key);
      if (chunk) {
        this.unloadChunkWithTreePreservation(key, chunk);
        logger.log(`[ChunkManager] Force-unloaded distant chunk ${key}`);
      }
    }
  }

  private async processLoadQueue(): Promise<void> {
    const loadBatch = this.loadingQueue.splice(0, 1);
    await Promise.all(
      loadBatch.map(async key => {
        if (this.loadedChunks.has(key)) return;
        const { chunkX, chunkZ } = this.parseChunkKey(key);
        try {
          const chunk = await this.loadChunkModern(chunkX, chunkZ);
          if (!this.loadedChunks.has(key)) {
            const pending = this.pendingTreeGroups.get(key);
            if (pending) {
              clearTimeout(pending.timeoutId);
              pending.group.parent?.remove(pending.group);
              this.pendingTreeGroups.delete(key);
            }
            this.loadedChunks.set(key, chunk);
            this.contentManager.addContentToScene(this, chunk);
          }
        } catch (e) {
          logger.warn(`[ChunkManager] Load fail ${key}:`, e);
        }
      })
    );
  }

  private loadChunkModern(x: number, z: number): Promise<ChunkContent> {
    const key = getChunkKey(x, z);
    const chunk: ChunkContent = {
      id: key,
      grassMesh: null,
      rocksGroup: null,
      treesGroup: null,
      flowersGroup: null,
      objects: [],
      isLoaded: false,
      isDisposed: false,
      gameplayData: { coinSpawns: [], enemySpawns: [] },
    };

    return new Promise(resolve => {
      this.pendingResolves.set(key, data => {
        this.contentManager.populateChunk(chunk, data);
        chunk.isLoaded = true;
        this.dispatchEvent({ type: "chunk-loaded", chunkKey: key, chunk });
        resolve(chunk);
      });
      this.worker.postMessage({
        chunkX: x,
        chunkZ: z,
        grassOptions: this.grassGenerator.options,
        rocksOptions: this.rocksGenerator.options,
        treesOptions: this.treesGenerator.options,
        flowersOptions: this.flowersGenerator.options,
        chunkKey: key,
        worldMin: WORLD_MIN_BOUND,
        worldMax: WORLD_MAX_BOUND,
      });
      setTimeout(() => {
        if (this.pendingResolves.has(key)) {
          this.pendingResolves.delete(key);
          resolve(this.createFallbackChunk(key));
        }
      }, 10000);
    });
  }

  public updateModern(elapsedTime: number, camera?: THREE.Camera): void {
    if (this.treesGenerator) this.treesGenerator.update(elapsedTime);
    if (this.flowersGenerator) this.flowersGenerator.updateWindEffect(elapsedTime);
    if (this.grassGenerator) this.grassGenerator.updateWindEffect(elapsedTime);

    if (camera) {
      this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

      for (const chunk of this.loadedChunks.values()) {
        const { chunkX, chunkZ } = this.parseChunkKey(chunk.id);
        const center = new THREE.Vector3(
          chunkX * CHUNK_SIZE + CHUNK_SIZE / 2,
          0,
          chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
        );
        const isVisible = this.frustum.intersectsSphere(
          new THREE.Sphere(center, CHUNK_SIZE * 0.866)
        );

        for (const obj of chunk.objects) {
          if (obj.name === "trees") continue;
          obj.visible = isVisible;
        }
      }
    }
  }
  public setGeneratorsReady(): void {
    this._generatorsReady = true;
    if (!this.isProcessingQueue) this.processQueue();
  }
  public getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }
  public waitForInitialChunks(requiredCount = 25): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.loadedChunks.size >= requiredCount) {
          logger.log(`[ChunkManager] Initial ${this.loadedChunks.size} chunks loaded. Ready!`);
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }
  private parseChunkKey(key: string): { chunkX: number; chunkZ: number } {
    const p = key.split(",").map(v => parseInt(v));
    return { chunkX: p[0] ?? 0, chunkZ: p[1] ?? 0 };
  }
  public async generateChunkAsync(x: number, z: number): Promise<void> {
    const key = getChunkKey(x, z);
    if (this.loadedChunks.has(key) || this.loadingQueue.includes(key)) return;
    this.loadingQueue.unshift(key);
    if (!this.isProcessingQueue) await this.processQueue();
  }
  public getGameplaySpawns(key: string) {
    return this.loadedChunks.get(key)?.gameplayData || null;
  }
  public dispose(): void {
    this.loadedChunks.forEach(c => this.contentManager.unloadChunk(this, c));
    this.loadedChunks.clear();
    this.worker.terminate();
  }
  private createFallbackChunk(key: string): ChunkContent {
    const chunk: ChunkContent = {
      id: key,
      grassMesh: null,
      rocksGroup: null,
      treesGroup: null,
      flowersGroup: null,
      objects: [],
      isLoaded: true,
      isDisposed: false,
      gameplayData: { coinSpawns: [], enemySpawns: [] },
    };
    this.dispatchEvent({ type: "chunk-loaded", chunkKey: key, chunk });
    return chunk;
  }
}

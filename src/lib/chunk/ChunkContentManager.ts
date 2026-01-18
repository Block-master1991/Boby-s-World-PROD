import * as THREE from 'three';
import { logger } from 'utils/logger';
import type { Flowers } from '../ez-tree/environment/flowers';
import type { Grass } from '../ez-tree/environment/grass';
import type { Rocks } from '../ez-tree/environment/rocks';
import type { Trees } from '../ez-tree/environment/trees';
import type { ChunkContent, ChunkData } from './types';

export class ChunkContentManager {
  constructor(
    private grassGenerator: Grass,
    private rocksGenerator: Rocks,
    private treesGenerator: Trees,
    private flowersGenerator: Flowers
  ) {}

  public populateChunk(chunk: ChunkContent, data: ChunkData): void {
    const { grassData, rocksData, treesData, flowersData, gameplayData } = data;

    if (grassData.positions.length > 0) {
      const mesh = this.grassGenerator.generateGrassFromData(grassData);
      if (mesh) { chunk.grassMesh = mesh; chunk.objects.push(mesh); }
    }

    if (rocksData.positions.length > 0) {
      const group = this.rocksGenerator.generateRocksFromData(rocksData);
      if (group) { chunk.rocksGroup = group; chunk.objects.push(group); }
    }

    if (treesData.positions.length > 0) {
      const group = this.treesGenerator.generateTreesFromData(treesData);
      if (group) { chunk.treesGroup = group; chunk.objects.push(group); }
    }

    if (flowersData.positions.length > 0) {
      const group = this.flowersGenerator.generateFlowersFromData(flowersData);
      if (group) { chunk.flowersGroup = group; chunk.objects.push(group); }
    }

    chunk.gameplayData = gameplayData;
    chunk.isLoaded = true;
    logger.log(`[ChunkManager] Populated chunk ${chunk.id}`);
  }

  public addContentToScene(scene: THREE.Object3D, chunk: ChunkContent): void {
    logger.log(`[ChunkManager] Adding chunk ${chunk.id} content to scene with ${chunk.objects.length} objects`);
    chunk.objects.forEach(obj => {
      scene.add(obj);
      this.setupShadows(obj);
      logger.log(`[ChunkManager] Added object ${obj.name || 'unnamed'} to scene`);
    });
  }

  private setupShadows(obj: THREE.Object3D): void {
    if (obj instanceof THREE.InstancedMesh) {
      obj.castShadow = true; obj.receiveShadow = true; obj.frustumCulled = true;
    } else {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true; child.receiveShadow = true; child.frustumCulled = true;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => { m.needsUpdate = true; });
          }
        }
      });
    }
  }

  public unloadChunk(scene: THREE.Object3D, chunk: ChunkContent): void {
    if (chunk.isDisposed) return;
    chunk.objects.forEach(obj => {
      scene.remove(obj);
      this.disposeObject(obj, chunk);
    });
    chunk.objects = []; chunk.isLoaded = false; chunk.isDisposed = true;
  }

  private disposeObject(obj: THREE.Object3D, chunk: ChunkContent): void {
    if (obj instanceof THREE.InstancedMesh) {
      obj.geometry.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
    } else if (obj instanceof THREE.Group) {
      if (chunk.treesGroup === obj) this.treesGenerator.disposeChunk(obj);
      else if (chunk.rocksGroup === obj) this.rocksGenerator.disposeChunk(obj);
      else if (chunk.flowersGroup === obj) this.flowersGenerator.disposeChunk(obj);
      obj.clear();
    }
  }
}

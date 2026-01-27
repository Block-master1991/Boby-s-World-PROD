import * as THREE from 'three';
import type { Flowers } from '../ez-tree/environment/flowers';
import type { Grass } from '../ez-tree/environment/grass';
import type { Rocks } from '../ez-tree/environment/rocks';
import type { Trees } from '../ez-tree/environment/trees';
import { getLODManager } from '../lod-manager';
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
  }

  public addContentToScene(scene: THREE.Object3D, chunk: ChunkContent): void {
    const lodManager = getLODManager();

    for (const obj of chunk.objects) {
      scene.add(obj);      
      // Shadow properties and frustum culling should be pre-set in generators for performance
      
      // Register with LOD Manager if it's a group (Trees, Rocks, Flowers)
      if (lodManager && obj instanceof THREE.Group) {
        lodManager.registerLODObject(`${chunk.id}_${obj.name}`, obj, [
          { distance: 0, quality: 1 },    
          { distance: 80, quality: 0.6 }, 
          { distance: 150, quality: 0 },  
        ]);
      }
    }
  }



  public unloadChunk(scene: THREE.Object3D, chunk: ChunkContent): void {
    if (chunk.isDisposed) return;
    const lodManager = getLODManager();

    chunk.objects.forEach(obj => {
      scene.remove(obj);
      
      // Unregister from LOD Manager
      if (lodManager && obj instanceof THREE.Group) {
        lodManager.unregisterLODObject(`${chunk.id}_${obj.name}`);
      }
      
      this.disposeObject(obj, chunk);
    });
    chunk.objects = []; chunk.isLoaded = false; chunk.isDisposed = true;
  }

  private disposeObject(obj: THREE.Object3D, chunk: ChunkContent): void {
    if (obj instanceof THREE.InstancedMesh) {
      // For InstancedMesh (Grass), we ONLY dispose geometry IF it's not shared
      // In our case, grass geometry is shared, so we DON'T dispose it here.
      // We also NEVER dispose shared materials.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj.geometry = null as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj.material = null as any;
    } else if (obj instanceof THREE.Group) {
      // For groups (Trees, Rocks, Flowers):
      // - Trees and Flowers use shared materials/geometries from cache
      // - Rocks might be unique or shared (currently they clone meshes)
      
      if (chunk.treesGroup === obj) {
        // Safe disposal: we want to remove the group from scene but keep cache
        this.treesGenerator.disposeChunk(obj);
      } else if (chunk.rocksGroup === obj) {
        this.rocksGenerator.disposeChunk(obj);
      } else if (chunk.flowersGroup === obj) {
        this.flowersGenerator.disposeChunk(obj);
      }
      
      // Crucial: Clear references to help GC
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          child.geometry = null as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          child.material = null as any;
        }
      });
      obj.clear();
    }
  }
}

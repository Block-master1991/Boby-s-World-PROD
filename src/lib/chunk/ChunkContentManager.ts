import * as THREE from "three";
import { getLODManager } from "../lod/lod-manager";
import type { Flowers } from "../world-generation/environment-generator/flowers";
import type { Grass } from "../world-generation/environment-generator/grass";
import type { Rocks } from "../world-generation/environment-generator/rocks";
import type { Trees } from "../world-generation/environment-generator/trees";
import type { ChunkContent, ChunkData } from "./types";

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
      if (mesh) {
        chunk.grassMesh = mesh;
        chunk.objects.push(mesh);
      }
    }

    if (rocksData.positions.length > 0) {
      const group = this.rocksGenerator.generateRocksFromData(rocksData);
      if (group) {
        chunk.rocksGroup = group;
        chunk.objects.push(group);
      }
    }

    if (treesData.positions.length > 0) {
      const group = this.treesGenerator.generateTreesFromData(treesData);
      if (group) {
        chunk.treesGroup = group;
        chunk.objects.push(group);
      }
    }

    if (flowersData.positions.length > 0) {
      const group = this.flowersGenerator.generateFlowersFromData(flowersData);
      if (group) {
        chunk.flowersGroup = group;
        chunk.objects.push(group);
      }
    }

    chunk.gameplayData = gameplayData;
    chunk.isLoaded = true;
  }

  public addContentToScene(scene: THREE.Object3D, chunk: ChunkContent): void {
    const lodManager = getLODManager();

    for (const obj of chunk.objects) {
      scene.add(obj);
      // Shadow properties and frustum culling should be pre-set in generators for performance

      // Register with LOD Manager for groups that benefit from LOD (Rocks, Flowers).
      // Trees are EXCLUDED: they have no LOD geometry, and registering them causes
      // a visibility conflict — LODManager sets visible=false at distance>150 every 200ms
      // while the frustum check sets visible=true every frame, causing flickering.
      if (lodManager && obj instanceof THREE.Group && obj.name !== "trees") {
        lodManager.registerLODObject(`${chunk.id}_${obj.name}`, obj, [
          { distance: 0, quality: 1 },
          { distance: 100, quality: 0.6 },
          { distance: 200, quality: 0 },
        ]);
      }
    }
  }

  public unloadChunk(scene: THREE.Object3D, chunk: ChunkContent): void {
    if (chunk.isDisposed) return;
    const lodManager = getLODManager();
    const remainingObjects: THREE.Object3D[] = [];

    chunk.objects.forEach(obj => {
      if (obj === chunk.treesGroup) {
        // Keep tree groups in the scene so they can fade out naturally via material dithering.
        remainingObjects.push(obj);
        return;
      }

      scene.remove(obj);

      // Unregister from LOD Manager
      if (lodManager && obj instanceof THREE.Group) {
        lodManager.unregisterLODObject(`${chunk.id}_${obj.name}`);
      }

      this.disposeObject(obj, chunk);
    });

    chunk.objects = remainingObjects;
    chunk.isLoaded = false;
    chunk.isDisposed = remainingObjects.length === 0;
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

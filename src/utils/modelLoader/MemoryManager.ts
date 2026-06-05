import type * as THREE from "three";
import type { LoadPriority } from "./types";
import { type MemoryInfo } from "./types";

export class MemoryManager {
  private static instance: MemoryManager;
  private modelCache: Map<string, { model: THREE.Group; info: MemoryInfo }> = new Map();
  private readonly MAX_MEMORY_USAGE = 500 * 1024 * 1024; // 500MB

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public cacheModel(path: string, model: THREE.Group, priority: LoadPriority): void {
    const size = this.calculateModelSize(model);

    // Cleanup if we're over memory limit
    if (this.getMemoryUsage() + size > this.MAX_MEMORY_USAGE) {
      this.cleanup();
    }

    this.modelCache.set(path, {
      model,
      info: {
        size,
        lastAccessed: Date.now(),
        accessCount: 1,
        priority,
      },
    });
  }

  public getModel(path: string): THREE.Group | null {
    const entry = this.modelCache.get(path);
    if (entry) {
      entry.info.lastAccessed = Date.now();
      entry.info.accessCount++;
      return entry.model.clone();
    }
    return null;
  }

  public calculateModelSize(model: THREE.Group): number {
    let totalSize = 0;
    model.traverse(object => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        const geometry = mesh.geometry as THREE.BufferGeometry;

        // Vertices, Normals, UVs, etc.
        for (const name in geometry.attributes) {
          const attribute = geometry.getAttribute(name);
          if (attribute) {
            totalSize += (attribute.array as THREE.TypedArray).byteLength;
          }
        }

        // Indices
        if (geometry.index) {
          totalSize += geometry.index.array.byteLength;
        }

        // Texture size
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            this.processMaterial(mat, size => {
              totalSize += size;
            });
          });
        } else {
          this.processMaterial(mesh.material, size => {
            totalSize += size;
          });
        }
      }
    });
    return totalSize;
  }

  private processMaterial(material: THREE.Material, addSize: (s: number) => void): void {
    // Check common texture slots
    const textureSlots: (keyof THREE.MeshStandardMaterial)[] = [
      "map",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
      "aoMap",
    ];
    for (const slot of textureSlots) {
      const texture = (material as unknown as Record<string, unknown>)[
        slot
      ] as THREE.Texture | null;
      if (texture && texture.isTexture) {
        addSize(this.calculateTextureSize(texture));
      }
    }
  }

  public calculateTextureSize(texture: THREE.Texture): number {
    const image = texture.image as HTMLImageElement | null;
    if (image && image.width && image.height) {
      return image.width * image.height * 4; // Assuming 4 bytes per pixel
    }
    return 0;
  }

  public cleanup(): void {
    const sortedCache = Array.from(this.modelCache.entries()).sort((a, b) => {
      // First priority, then access count, then last accessed
      if (a[1].info.priority !== b[1].info.priority) {
        return b[1].info.priority - a[1].info.priority; // Lower priority (higher number) first
      }
      if (a[1].info.accessCount !== b[1].info.accessCount) {
        return a[1].info.accessCount - b[1].info.accessCount;
      }
      return a[1].info.lastAccessed - b[1].info.lastAccessed;
    });

    // Remove 20% of the cache or enough to get under the limit
    const targetSize = this.MAX_MEMORY_USAGE * 0.8;
    let currentUsage = this.getMemoryUsage();

    for (const [path, entry] of sortedCache) {
      if (currentUsage <= targetSize) break;

      this.removeFromCache(path);
      currentUsage -= entry.info.size;
    }
  }

  public removeFromCache(path: string): void {
    const entry = this.modelCache.get(path);
    if (entry) {
      entry.model.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => (m as THREE.Material).dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      this.modelCache.delete(path);
    }
  }

  public getMemoryUsage(): number {
    let usage = 0;
    this.modelCache.forEach(entry => {
      usage += entry.info.size;
    });
    return usage;
  }
}

export const memoryManager = MemoryManager.getInstance();

import { THREE } from "@/lib/three-chunk";
import { ObjectPool } from "./ObjectPool";
import type { PoolConfig } from "./types";

// Three.js Object Pool for Meshes with shared geometry/material optimization
export class MeshPool extends ObjectPool<THREE.Mesh> {
  private geometry: THREE.BufferGeometry;
  private material: THREE.Material;

  /** Whether geometry can be safely shared (no per-mesh vertex modifications) */
  private shareGeometry: boolean;
  /** Whether material can be safely shared (no per-mesh material modifications) */
  private shareMaterial: boolean;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    config?: Partial<PoolConfig>
  ) {
    super(config);
    this.geometry = geometry;
    this.material = material;

    // Determine if sharing is safe: default to true for better memory efficiency
    // Sharing is safe when meshes only differ by transform (position/rotation/scale)
    this.shareGeometry = true;
    this.shareMaterial = true;
  }

  protected create(): THREE.Mesh {
    // Use shared geometry/material when possible to reduce memory by ~20-30%
    // Clone only when per-mesh modifications are needed
    const geo = this.shareGeometry ? this.geometry : this.geometry.clone();
    const mat = this.shareMaterial ? this.material : this.material.clone();
    return new THREE.Mesh(geo, mat);
  }

  protected reset(obj: THREE.Mesh): void {
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.visible = true;
    obj.updateMatrix();

    // Reset material properties only if we own the material (cloned)
    if (!this.shareMaterial && obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material.emissive.setHex(0x000000);
      obj.material.opacity = 1.0;
      obj.material.transparent = false;
    }
  }

  protected dispose(obj: THREE.Mesh): void {
    // Only dispose geometry if it was cloned (not shared)
    if (!this.shareGeometry && obj.geometry) {
      obj.geometry.dispose();
    }
    // Only dispose material if it was cloned (not shared)
    if (!this.shareMaterial && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(mat => {
          if (mat && typeof mat.dispose === "function") {
            mat.dispose();
          }
        });
      } else if (
        obj.material &&
        typeof (obj.material as unknown as Record<string, unknown>)["dispose"] === "function"
      ) {
        (obj.material as unknown as { dispose: () => void }).dispose();
      }
    }
  }

  protected isValid(obj: THREE.Mesh): boolean {
    return obj.geometry !== null && obj.material !== null;
  }

  /** Enable or disable geometry sharing at runtime */
  setShareGeometry(share: boolean): void {
    this.shareGeometry = share;
  }

  /** Enable or disable material sharing at runtime */
  setShareMaterial(share: boolean): void {
    this.shareMaterial = share;
  }
}

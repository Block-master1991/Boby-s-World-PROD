import { THREE } from "@/lib/three-chunk";
import { ObjectPool } from "./ObjectPool";
import type { PoolConfig } from "./types";

// Particle System Pool with optimized lifecycle management
export class ParticleSystemPool extends ObjectPool<THREE.Points> {
  private maxParticles: number;

  /** Shared geometry template – cloned per instance only when needed */
  private sharedGeometry: THREE.BufferGeometry | null = null;
  /** Shared material – reused across all particles for memory efficiency */
  private sharedMaterial: THREE.PointsMaterial | null = null;

  constructor(maxParticles: number = 100, config?: Partial<PoolConfig>) {
    super(config);
    this.maxParticles = maxParticles;
    this.createSharedResources();
  }

  /** Create shared resources once to avoid redundant allocations */
  private createSharedResources(): void {
    // Shared material – all particles use the same material
    this.sharedMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    // Shared geometry template – used as a reference for buffer sizes
    this.sharedGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    this.sharedGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.sharedGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  protected create(): THREE.Points {
    // Each Points object needs its own geometry (buffers are mutated per frame)
    // but we can copy the structure from the shared template
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Reuse shared material instead of creating a new one per particle system
    const material = this.sharedMaterial!;

    return new THREE.Points(geometry, material);
  }

  protected reset(obj: THREE.Points): void {
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.visible = false;
    obj.updateMatrix();

    // Reset particle positions efficiently
    const positionAttr = obj.geometry.attributes["position"];
    const colorAttr = obj.geometry.attributes["color"];

    if (positionAttr && positionAttr.array) {
      const positions = positionAttr.array as Float32Array;
      positions.fill(0);
      positionAttr.needsUpdate = true;
    }

    if (colorAttr && colorAttr.array) {
      const colors = colorAttr.array as Float32Array;
      colors.fill(0);
      colorAttr.needsUpdate = true;
    }
  }

  protected dispose(obj: THREE.Points): void {
    // Only dispose geometry (material is shared)
    if (obj.geometry) obj.geometry.dispose();
    // Do NOT dispose shared material here
  }

  protected isValid(obj: THREE.Points): boolean {
    return obj.geometry !== null && obj.material !== null;
  }

  /** Dispose shared resources – call only when the entire pool is being destroyed */
  disposeSharedResources(): void {
    if (this.sharedGeometry) {
      this.sharedGeometry.dispose();
      this.sharedGeometry = null;
    }
    if (this.sharedMaterial) {
      this.sharedMaterial.dispose();
      this.sharedMaterial = null;
    }
  }
}

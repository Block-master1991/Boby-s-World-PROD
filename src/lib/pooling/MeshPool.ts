import { THREE } from '@/lib/three-chunk';
import { ObjectPool } from './ObjectPool';
import type { PoolConfig } from './types';

// Three.js Object Pool for Meshes
export class MeshPool extends ObjectPool<THREE.Mesh> {
    private geometry: THREE.BufferGeometry;
    private material: THREE.Material;

    constructor(geometry: THREE.BufferGeometry, material: THREE.Material, config?: Partial<PoolConfig>) {
        super(config);
        this.geometry = geometry;
        this.material = material;
    }

    protected create(): THREE.Mesh {
        return new THREE.Mesh(this.geometry.clone(), this.material.clone());
    }

    protected reset(obj: THREE.Mesh): void {
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
        obj.visible = true;

        // Reset material properties
        if (obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.emissive.setHex(0x000000);
            obj.material.opacity = 1.0;
            obj.material.transparent = false;
        }
    }

    protected dispose(obj: THREE.Mesh): void {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => {
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                });
            } else if (obj.material && typeof (obj.material as unknown as Record<string, unknown>)['dispose'] === 'function') {
                 // Cast to unknown first then Record to safely check for dispose function
                (obj.material as unknown as { dispose: () => void }).dispose();
            }
        }
    }

    protected isValid(obj: THREE.Mesh): boolean {
        return obj.geometry !== null && obj.material !== null;
    }
}

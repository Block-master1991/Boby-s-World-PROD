import { THREE } from '@/lib/three-chunk';
import { ObjectPool } from './ObjectPool';

// Vector3 Pool for temporary calculations
export class Vector3Pool extends ObjectPool<THREE.Vector3> {
    protected create(): THREE.Vector3 {
        return new THREE.Vector3();
    }

    protected reset(obj: THREE.Vector3): void {
        obj.set(0, 0, 0);
    }

    protected dispose(): void {
        // Vector3 doesn't need disposal
    }

    protected isValid(): boolean {
        return true;
    }

    // Utility methods for vector operations
    getTempVector(x: number = 0, y: number = 0, z: number = 0): THREE.Vector3 {
        const vec = this.get();
        vec.set(x, y, z);
        return vec;
    }

    releaseTempVector(vec: THREE.Vector3): void {
        this.release(vec);
    }
}

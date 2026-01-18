import { THREE } from '@/lib/three-chunk';
import { ObjectPool } from './ObjectPool';
import type { PoolConfig } from './types';

// Particle System Pool
export class ParticleSystemPool extends ObjectPool<THREE.Points> {
    private maxParticles: number;

    constructor(maxParticles: number = 100, config?: Partial<PoolConfig>) {
        super(config);
        this.maxParticles = maxParticles;
    }

    protected create(): THREE.Points {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const colors = new Float32Array(this.maxParticles * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Points(geometry, material);
    }

    protected reset(obj: THREE.Points): void {
        obj.position.set(0, 0, 0);
        obj.visible = false;

        // Reset particle positions
        // Safely access properties that strict TS flagged as potentially undefined
        const positionAttr = obj.geometry.attributes['position'];
        const colorAttr = obj.geometry.attributes['color'];

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
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && typeof (obj.material as unknown as Record<string, unknown>)['dispose'] === 'function') {
            (obj.material as unknown as { dispose: () => void }).dispose();
        }
    }

    protected isValid(obj: THREE.Points): boolean {
        return obj.geometry !== null && obj.material !== null;
    }
}

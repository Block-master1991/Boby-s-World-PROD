import * as THREE from 'three';
import { getDevicePerformanceConfig } from '../../utils';

export class Clouds extends THREE.Object3D {
    private instancedMesh: THREE.InstancedMesh | null = null;
    private cloudData: {
        position: THREE.Vector3;
        scale: number;
        driftSpeedMultiplier: number;
        bobSpeed: number;
        bobOffset: number;
        initialY: number;
    }[] = [];

    private worldSize = 10000;
    private count = 0;
    private tempMatrix = new THREE.Matrix4();
    private tempPos = new THREE.Vector3();
    private tempScale = new THREE.Vector3();
    private tempQuaternion = new THREE.Quaternion();

    constructor() {
        super();
        this.name = 'Clouds';
        this.init();
    }

    private init() {
        const perfConfig = getDevicePerformanceConfig();
        const baseCount = perfConfig.isMobile ? 100 : 300;
        this.count = baseCount;

        const textureLoader = new THREE.TextureLoader();
        const cloudTexture = textureLoader.load('/cloud.png');

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: cloudTexture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            alphaTest: 0.01
        });

        this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.instancedMesh.frustumCulled = false; // Disable culling to prevent sudden disappearance
        this.add(this.instancedMesh);

        for (let i = 0; i < this.count; i++) {
            // Increased heights significantly to avoid "ground sticking" look
            // Low clouds start at 400, high clouds go up to 1000
            const isHigh = Math.random() > 0.4;
            const initialY = isHigh
                ? 600 + Math.random() * 400
                : 350 + Math.random() * 150;

            const position = new THREE.Vector3(
                Math.random() * this.worldSize - this.worldSize / 2,
                initialY,
                Math.random() * this.worldSize - this.worldSize / 2
            );

            const scale = 200 + Math.random() * 300;
            const driftSpeedMultiplier = isHigh ? 0.3 : 0.8;

            this.cloudData.push({
                position,
                scale,
                driftSpeedMultiplier,
                bobSpeed: 0.15 + Math.random() * 0.3,
                bobOffset: Math.random() * Math.PI * 2,
                initialY
            });
        }
    }

    public update(elapsedTime: number, cameraPosition: THREE.Vector3) {
        if (!this.instancedMesh) return;

        const halfSize = this.worldSize / 2;
        const windSpeed = 12;

        for (let i = 0; i < this.count; i++) {
            const data = this.cloudData[i];

            // 1. Move position
            data.position.x += windSpeed * 0.01 * data.driftSpeedMultiplier;

            // 2. World Wrap (X & Z)
            if (data.position.x > halfSize) data.position.x = -halfSize;
            if (cameraPosition) {
                const dz = data.position.z - cameraPosition.z;
                if (dz > halfSize) data.position.z -= this.worldSize;
                else if (dz < -halfSize) data.position.z += this.worldSize;
            }

            // 3. Sky Dome Curvature & Bobbing
            // We lift the clouds slightly as they get further from the camera 
            // to simulate a curved atmosphere and keep them away from the ground plane.
            let distOffset = 0;
            if (cameraPosition) {
                const dx = data.position.x - cameraPosition.x;
                const dz = data.position.z - cameraPosition.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                // Lift by up to 150 units at the edges
                distOffset = (distance / halfSize) * 200;
            }

            const currentY = data.initialY + distOffset + Math.sin(elapsedTime * data.bobSpeed + data.bobOffset) * 15;

            // 4. Billboard logic
            if (cameraPosition) {
                this.tempPos.set(data.position.x, currentY, data.position.z);

                const dx = cameraPosition.x - this.tempPos.x;
                const dz = cameraPosition.z - this.tempPos.z;
                const angle = Math.atan2(dx, dz);

                this.tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);

                this.tempScale.set(data.scale, data.scale, 1);
                this.tempMatrix.compose(this.tempPos, this.tempQuaternion, this.tempScale);
            } else {
                this.tempMatrix.makeTranslation(data.position.x, currentY, data.position.z);
                this.tempMatrix.scale(new THREE.Vector3(data.scale, data.scale, 1));
            }

            this.instancedMesh.setMatrixAt(i, this.tempMatrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
}

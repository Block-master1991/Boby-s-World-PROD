import * as THREE from 'three';

interface DogShieldEffectOptions {
  scene: THREE.Scene;
  dogPosition: THREE.Vector3;
}

class DogShieldEffect {
  public mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private dogPosition: THREE.Vector3;

  constructor(options: DogShieldEffectOptions) {
    this.scene = options.scene;
    this.dogPosition = options.dogPosition;

    const geometry = new THREE.SphereGeometry(1, 32, 32); // Radius, widthSegments, heightSegments
    const material = new THREE.MeshBasicMaterial({
      color: 0x0000FF, // Blue color
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      wireframe: true, // Optional: for an electrical/force field look
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  public update(isActive: boolean, dogPosition: THREE.Vector3) {
    this.dogPosition = dogPosition;

    if (isActive) {
      if (!this.mesh.parent) {
        this.scene.add(this.mesh); // Add back to scene if it was removed
      }
      this.mesh.position.copy(this.dogPosition);
      // Simple pulsing scale effect for the shield
      this.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.1);
      this.mesh.rotation.y += 0.02; // Rotate the shield
    } else {
      if (this.mesh.parent) {
        this.scene.remove(this.mesh); // Remove from scene when inactive
      }
    }
  }

  public dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export default DogShieldEffect;

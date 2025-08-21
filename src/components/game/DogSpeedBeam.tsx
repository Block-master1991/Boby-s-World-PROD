import * as THREE from 'three';

interface DogSpeedBeamOptions {
  scene: THREE.Scene;
  dogPosition: THREE.Vector3;
  dogRotation: THREE.Euler;
}

class DogSpeedBeam {
  public mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private dogPosition: THREE.Vector3;
  private dogRotation: THREE.Euler;

  constructor(options: DogSpeedBeamOptions) {
    this.scene = options.scene;
    this.dogPosition = options.dogPosition;
    this.dogRotation = options.dogRotation;

    const geometry = new THREE.BoxGeometry(0.2, 0.2, 1); // Width, Height, Depth of the beam
    const material = new THREE.MeshBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.7 }); // Cyan color
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  public update(isActive: boolean, dogPosition: THREE.Vector3, dogRotation: THREE.Euler) {
    this.dogPosition = dogPosition;
    this.dogRotation = dogRotation;

    if (isActive) {
      if (!this.mesh.parent) {
        this.scene.add(this.mesh); // Add back to scene if it was removed
      }
      // Position the beam slightly behind the dog
      const offset = new THREE.Vector3(0, 1.5, -1.0).applyEuler(this.dogRotation); // Adjust Z offset and apply dog's rotation
      this.mesh.position.copy(this.dogPosition).add(offset);
      this.mesh.rotation.copy(this.dogRotation);

      // Simple pulsing effect for the beam
      this.mesh.scale.z = 1 + Math.sin(performance.now() * 0.01) * 0.1;
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

export default DogSpeedBeam;

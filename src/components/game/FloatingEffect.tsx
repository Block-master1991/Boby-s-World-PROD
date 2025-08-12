import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

interface FloatingEffectOptions {
  position: THREE.Vector3;
  effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score';
  value: number; // e.g., 1 for +1, -1 for -1
  camera: THREE.Camera; // Pass camera for lookAt
  onComplete: (id: string) => void; // Callback to notify parent when animation is complete
  id: string; // Unique ID for the effect
  animationType: 'floatUp' | 'attractToTarget' | 'followTarget';
  targetMesh?: THREE.Object3D; // For 'followTarget'
  targetPosition?: THREE.Vector3; // For 'attractToTarget'
  is3DModel?: boolean; // To load a 3D model instead of a 2D texture
}

class FloatingEffect {
  public mesh: THREE.Group;
  private startTime: number;
  private opacity: number;
  private yOffset: number;
  private camera: THREE.Camera;
  private onComplete: (id: string) => void;
  private id: string;
  private iconMesh: THREE.Object3D | null = null;
  private textMesh: THREE.Mesh | null = null;
  private effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score';
  private animationType: 'floatUp' | 'attractToTarget' | 'followTarget';
  private targetMesh: THREE.Object3D | undefined;
  private targetPosition: THREE.Vector3 | undefined;
  private is3DModel: boolean;
  private value: number;

  constructor(options: FloatingEffectOptions) {
    this.id = options.id;
    this.camera = options.camera;
    this.onComplete = options.onComplete;
    this.startTime = performance.now();
    this.opacity = 1;
    this.yOffset = 0;
    this.effectType = options.effectType;
    this.animationType = options.animationType;
    this.targetMesh = options.targetMesh;
    this.targetPosition = options.targetPosition;
    this.is3DModel = options.is3DModel || false;
    this.value = options.value;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(options.position);

    this.loadAssets(this.effectType, this.value, this.is3DModel);
  }

  private getAssetPath(effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score', is3DModel: boolean): string {
    if (is3DModel) {
      switch (effectType) {
        case 'coin':
          return '/models/coin.glb';
        case 'Bottle':
          return '/models/Bottle.glb'; // Assuming you have a Bottle.glb
        default:
          return '';
      }
    } else {
      switch (effectType) {
        case 'coin':
          return '/coin-front.png';
        case 'Bottle':
          return '/Bottle.png'; // Placeholder, need to confirm actual Bottle asset path
        case 'item':
          return '/item.png'; // Placeholder, need to confirm actual item asset path
        default:
          return '';
      }
    }
  }

  private createTextTexture(text: string, value: number): THREE.CanvasTexture | null {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    const fontSize = 64;
    context.font = `${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const textMetrics = context.measureText(text);
    canvas.width = textMetrics.width + 20; // Add some padding
    canvas.height = fontSize + 20;

    context.font = `${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = value > 0 ? 'green' : 'red';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    return new THREE.CanvasTexture(canvas);
  }

  private loadAssets(effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score', value: number, is3DModel: boolean) {
    const assetPath = this.getAssetPath(effectType, is3DModel);

    if (is3DModel && assetPath) {
      const loader = new GLTFLoader();
      loader.load(assetPath, (gltf) => {
        this.iconMesh = gltf.scene;
        this.iconMesh.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
        this.iconMesh.position.set(0, 0.2, 0); // Adjust position relative to text
        this.mesh.add(this.iconMesh);
      });
    } else if (assetPath) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(assetPath, (texture) => {
        const iconMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: this.opacity, side: THREE.DoubleSide });
        this.iconMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), iconMaterial);
        this.iconMesh.position.set(0, 0.2, 0); // Adjust position relative to text
        this.mesh.add(this.iconMesh);
      });
    }

    const text = value > 0 ? `+${value}` : `${value}`;
    const textTexture = this.createTextTexture(text, value);
    if (textTexture) {
      const textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, opacity: this.opacity, side: THREE.DoubleSide });
      this.textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(textTexture.image.width / 200, textTexture.image.height / 200),
        textMaterial
      );
      this.mesh.add(this.textMesh);
    }
  }

  public update() {
    const elapsed = performance.now() - this.startTime;
    const duration = 1500; // milliseconds for animation

    if (elapsed < duration) {
      const progress = elapsed / duration;
      this.opacity = 1 - progress; // Fade out

      if (this.animationType === 'floatUp') {
        this.yOffset = 0.5 * progress; // Float up by 0.5 units
        this.mesh.position.y = this.mesh.position.y + this.yOffset;
      } else if (this.animationType === 'attractToTarget' && this.targetPosition) {
        this.mesh.position.lerp(this.targetPosition, 0.05); // Smoothly move towards target
      } else if (this.animationType === 'followTarget' && this.targetMesh) {
        // Position relative to the target mesh (e.g., above the dog's head)
        const Y_OFFSET = 1.5; // Adjust as needed
        this.mesh.position.copy(this.targetMesh.position).add(new THREE.Vector3(0, Y_OFFSET, 0));
      }

      if (this.iconMesh) {
        this.iconMesh.traverse((object: THREE.Object3D) => {
          if (object instanceof THREE.Mesh) {
            const material = object.material;
            if (material instanceof THREE.MeshBasicMaterial) {
              material.opacity = this.opacity;
            } else if (Array.isArray(material)) {
              material.forEach(m => {
                if (m instanceof THREE.MeshBasicMaterial) m.opacity = this.opacity;
              });
            }
          }
        });
      }
      if (this.textMesh && this.textMesh.material instanceof THREE.MeshBasicMaterial) {
        this.textMesh.material.opacity = this.opacity;
      }
    } else {
      this.onComplete(this.id); // Animation complete, trigger cleanup
    }

    // Make the effect always face the camera
    this.mesh.lookAt(this.camera.position);
  }

  public dispose() {
    if (this.iconMesh) {
      this.iconMesh.traverse((object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          }
        }
      });
      if (this.iconMesh.parent) { // Ensure it has a parent before removing
        this.iconMesh.parent.remove(this.iconMesh);
      }
    }
    if (this.textMesh) {
      this.textMesh.geometry.dispose();
      if (this.textMesh.material instanceof THREE.MeshBasicMaterial) {
        this.textMesh.material.map?.dispose();
        this.textMesh.material.dispose();
      }
      this.mesh.remove(this.textMesh);
    }
    this.mesh.clear();
  }
}

export default FloatingEffect;

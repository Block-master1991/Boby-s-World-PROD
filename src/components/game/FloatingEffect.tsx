import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

interface FloatingEffectOptions {
  position: THREE.Vector3;
  effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score';
  value: number;
  camera: THREE.Camera;
  onComplete: (id: string) => void;
  id: string;
  animationType: 'floatUp' | 'attractToTarget' | 'followTarget';
  targetMesh?: THREE.Object3D | undefined;
  targetPosition?: THREE.Vector3 | undefined;
  is3DModel?: boolean | undefined;
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
  // Removed debugLight property as it's no longer needed for self-illumination

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
          return '/models/Water-bottle.glb'; // Corrected path for Bottle model
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
        this.iconMesh.scale.set(1, 1, 1); // Increased scale for visibility
        this.iconMesh.position.set(0.5, 0, 0); // Position to the right of the text
        this.mesh.add(this.iconMesh);

        // Make the coin model self-illuminated
        this.iconMesh.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            const { material } = object;
            if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
              // Copy the material's base color to its emissive property
              material.emissive.copy(material.color);
              material.emissiveIntensity = 0.5; // Adjust intensity as needed
              material.needsUpdate = true;
              material.metalness = 1.0; // Set metalness to 1 for a metallic look
            }
          }
        });
      });
    } else if (assetPath) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(assetPath, (texture) => {
        const iconMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: this.opacity, side: THREE.DoubleSide });
        this.iconMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), iconMaterial);
        this.iconMesh.position.set(0.2, 0, 0); // Position to the right of the text
        this.mesh.add(this.iconMesh);
      });
    }

    // If the value is an integer, display it without decimal places. Otherwise, display with decimals.
    const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(3);
    const text = value > 0 ? `+${formattedValue}` : `${formattedValue}`;
    const textTexture = this.createTextTexture(text, value);
    if (textTexture) {
      const textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, opacity: this.opacity, side: THREE.DoubleSide });
      this.textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(textTexture.image.width / 200, textTexture.image.height / 200),
        textMaterial
      );
      this.textMesh.position.set(-0.2, 0, 0); // Position to the left of the coin
      this.mesh.add(this.textMesh);
    }
  }

  private updateAnimationState(progress: number) {
    this.opacity = 1 - progress;
    if (this.animationType === 'floatUp') {
      this.yOffset = 0.5 * progress;
      this.mesh.position.y += this.yOffset;
    } else if (this.animationType === 'attractToTarget' && this.targetPosition) {
      this.mesh.position.lerp(this.targetPosition, 0.05);
    } else if (this.animationType === 'followTarget' && this.targetMesh) {
      const Y_OFFSET = 1.5;
      this.mesh.position.copy(this.targetMesh.position).add(new THREE.Vector3(0, Y_OFFSET, 0));
    }
  }

  private updateMaterialOpacity() {
    if (this.iconMesh) {
      this.iconMesh.traverse((object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh) {
          const { material } = object;
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
  }

  public update() {
    const elapsed = performance.now() - this.startTime;
    const duration = 1500;

    if (elapsed < duration) {
      this.updateAnimationState(elapsed / duration);
      this.updateMaterialOpacity();
    } else {
      this.onComplete(this.id);
    }

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

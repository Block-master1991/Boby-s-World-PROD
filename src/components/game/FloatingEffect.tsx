import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface FloatingEffectOptions {
  position: THREE.Vector3;
  effectType: "coin" | "Bottle" | "item" | "penalty" | "score";
  value: number;
  camera: THREE.Camera;
  onComplete: (id: string) => void;
  id: string;
  animationType: "floatUp" | "attractToTarget" | "followTarget";
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
  private effectType: "coin" | "Bottle" | "item" | "penalty" | "score";
  private animationType: "floatUp" | "attractToTarget" | "followTarget";
  private targetMesh: THREE.Object3D | undefined;
  private targetPosition: THREE.Vector3 | undefined;

  // Static cache for shared resources
  private static cache = {
    models: new Map<string, THREE.Group>(),
    textures: new Map<string, THREE.Texture>(),
    textTextures: new Map<string, THREE.CanvasTexture>(),
  };

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

    // params is3DModel and value are consumed in constructor, no need to store as unused properties
    // or if needed later, suppression is valid but better to use them or remove them.
    // They are used in loadAssets, so just passing them is enough.

    this.mesh = new THREE.Group();
    this.mesh.position.copy(options.position);

    // Initial load
    this.loadAssets(this.effectType, options.value, options.is3DModel || false);
  }

  private getAssetPath(
    effectType: "coin" | "Bottle" | "item" | "penalty" | "score",
    is3DModel: boolean
  ): string {
    if (is3DModel) {
      switch (effectType) {
        case "coin":
          return "/models/coin.glb";
        case "Bottle":
          return "/models/Water-bottle.glb";
        default:
          return "";
      }
    } else {
      switch (effectType) {
        case "coin":
          return "/coin-front.png";
        case "Bottle":
          return "/Bottle.png";
        case "item":
          return "/item.png";
        default:
          return "";
      }
    }
  }

  private getCachedTextTexture(text: string, value: number): THREE.CanvasTexture | null {
    const key = `${text}_${value > 0 ? "pos" : "neg"}`;
    if (FloatingEffect.cache.textTextures.has(key)) {
      return FloatingEffect.cache.textTextures.get(key)!;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    const fontSize = 64;
    context.font = `${fontSize}px Arial`;
    const textMetrics = context.measureText(text);
    canvas.width = textMetrics.width + 20;
    canvas.height = fontSize + 20;

    context.font = `${fontSize}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = value > 0 ? "green" : "red";
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    FloatingEffect.cache.textTextures.set(key, texture);
    return texture;
  }

  private loadAssets(
    effectType: "coin" | "Bottle" | "item" | "penalty" | "score",
    value: number,
    is3DModel: boolean
  ) {
    const assetPath = this.getAssetPath(effectType, is3DModel);

    // 1. Load Icon/Model
    if (is3DModel && assetPath) {
      if (FloatingEffect.cache.models.has(assetPath)) {
        const cached = FloatingEffect.cache.models.get(assetPath)!;
        // IMPORTANT: Clone the group AND materials so opacity changes don't affect other instances
        const instance = cached.clone();
        this.cloneMaterials(instance);
        this.setupModel(instance);
      } else {
        const loader = new GLTFLoader();
        loader.load(assetPath, gltf => {
          const model = gltf.scene;
          // Pre-process model base properties
          model.traverse(object => {
            if ((object as THREE.Mesh).isMesh) {
              const mesh = object as THREE.Mesh;
              const { material } = mesh;
              if (
                material instanceof THREE.MeshStandardMaterial ||
                material instanceof THREE.MeshPhysicalMaterial
              ) {
                material.emissive.copy(material.color);
                material.emissiveIntensity = 0.5;
                material.metalness = 1.0;
              }
            }
          });
          FloatingEffect.cache.models.set(assetPath, model);

          // For the first instance, we also need to clone to be safe and consistent
          const instance = model.clone();
          this.cloneMaterials(instance);
          this.setupModel(instance);
        });
      }
    } else if (assetPath) {
      this.loadTextureIcon(assetPath);
    }

    // 2. Load Text
    const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(3);
    const text = value > 0 ? `+${formattedValue}` : `${formattedValue}`;

    const textTexture = this.getCachedTextTexture(text, value);
    if (textTexture) {
      const textMaterial = new THREE.MeshBasicMaterial({
        map: textTexture,
        transparent: true,
        opacity: this.opacity,
        side: THREE.DoubleSide,
      });

      this.textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(textTexture.image.width / 200, textTexture.image.height / 200),
        textMaterial
      );
      this.textMesh.position.set(-0.2, 0, 0);
      this.mesh.add(this.textMesh);
    }
  }

  // Helper to deep clone materials for an object hierarchy
  private cloneMaterials(object: THREE.Object3D) {
    object.traverse(node => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(m => m.clone());
          } else {
            mesh.material = mesh.material.clone();
          }
        }
      }
    });
  }

  private loadTextureIcon(assetPath: string) {
    if (FloatingEffect.cache.textures.has(assetPath)) {
      this.createIconMesh(FloatingEffect.cache.textures.get(assetPath)!);
    } else {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(assetPath, texture => {
        FloatingEffect.cache.textures.set(assetPath, texture);
        this.createIconMesh(texture);
      });
    }
  }

  private createIconMesh(texture: THREE.Texture) {
    const iconMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: this.opacity,
      side: THREE.DoubleSide,
    });
    this.iconMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), iconMaterial);
    this.iconMesh.position.set(0.2, 0, 0);
    this.mesh.add(this.iconMesh);
  }

  private setupModel(model: THREE.Group) {
    this.iconMesh = model;
    this.iconMesh.scale.set(1, 1, 1);
    this.iconMesh.position.set(0.5, 0, 0);
    this.mesh.add(this.iconMesh);
  }

  private updateAnimationState(progress: number) {
    this.opacity = 1 - progress;
    if (this.animationType === "floatUp") {
      this.yOffset = 0.5 * progress;
      this.mesh.position.y += this.yOffset;
    } else if (this.animationType === "attractToTarget" && this.targetPosition) {
      this.mesh.position.lerp(this.targetPosition, 0.05);
    } else if (this.animationType === "followTarget" && this.targetMesh) {
      const Y_OFFSET = 1.5;
      this.mesh.position.copy(this.targetMesh.position).add(new THREE.Vector3(0, Y_OFFSET, 0));
    }
  }

  private updateMaterialOpacity() {
    if (this.iconMesh) {
      this.iconMesh.traverse((object: THREE.Object3D) => {
        if ((object as THREE.Mesh).isMesh) {
          const { material } = object as THREE.Mesh;
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
      this.iconMesh.traverse(object => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          if (mesh.material instanceof THREE.Material) {
            mesh.material.dispose();
          } else if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          }
        }
      });
      if (this.iconMesh.parent) {
        this.iconMesh.parent.remove(this.iconMesh);
      }
    }

    if (this.textMesh) {
      this.textMesh.geometry.dispose();
      if (this.textMesh.material instanceof THREE.Material) {
        this.textMesh.material.dispose();
      }
      this.mesh.remove(this.textMesh);
    }

    this.mesh.clear();
  }
}

export default FloatingEffect;

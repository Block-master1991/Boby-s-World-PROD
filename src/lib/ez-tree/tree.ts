import * as THREE from "three";
import TreeOptions from "./options";
import { loadPreset } from "./presets/index";
import { appendWindShader, applyProfessionalFade } from "./shaders/windShaderUtils"; // Import utilities
import { getBarkTexture, getLeafTexture } from "./textures";
import { TreeGenerator } from "./TreeGenerator";

export class Tree extends THREE.Group {
  public options: TreeOptions;

  private branchesMesh: THREE.Mesh;
  private leavesMesh: THREE.Mesh;

  public windStrength: { x: number; y: number; z: number };
  public windFrequency: number;
  public windScale: number;

  private generator: TreeGenerator;

  constructor(options: TreeOptions = new TreeOptions()) {
    super();
    this.name = "Tree";
    this.branchesMesh = new THREE.Mesh();
    this.leavesMesh = new THREE.Mesh();
    this.add(this.branchesMesh);
    this.add(this.leavesMesh);
    this.options = options;

    this.windStrength = options.windStrength;
    this.windFrequency = options.windFrequency;
    this.windScale = options.windScale;

    this.generator = new TreeGenerator(this.options);
  }

  update(elapsedTime: number): void {
    const updateMaterialShader = (material: THREE.Material | THREE.Material[]) => {
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((mat: THREE.Material) => {
        // Safe check for shader userData using known type or generic Record
        const { userData } = mat;
        if (userData && userData["shader"]) {
          const shader = userData["shader"] as { uniforms: { uTime: { value: number } } };
          if (shader.uniforms && shader.uniforms.uTime) {
            shader.uniforms.uTime.value = elapsedTime;
          }
        }
      });
    };

    updateMaterialShader(this.leavesMesh.material);
    updateMaterialShader(this.branchesMesh.material);
  }

  loadPreset(name: string): void {
    const json = loadPreset(name);
    this.loadFromJson(json);
  }

  loadFromJson(json: TreeOptions): void {
    this.options.copy(json);
    this.generate();
  }

  generate(): void {
    // Regenerate geometry using the generator
    this.generator = new TreeGenerator(this.options);
    this.generator.generate();

    this.createBranchesGeometry();
    this.createLeavesGeometry();
  }

  private createBranchesGeometry(): void {
    const geometry = new THREE.BufferGeometry();
    const { verts, normals, uvs, indices } = this.generator.branches;

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      name: "branches",
      flatShading: this.options.bark.flatShading,
      color: new THREE.Color(this.options.bark.tint),
    });

    if (this.options.bark.textured) {
      const { type, textureScale } = this.options.bark;
      mat.aoMap = getBarkTexture(type, "ao", textureScale);
      mat.map = getBarkTexture(type, "color", textureScale);
      mat.normalMap = getBarkTexture(type, "normal", textureScale);
      mat.roughnessMap = getBarkTexture(type, "roughness", textureScale);
    }

    applyProfessionalFade(mat);
    this.updateMesh(this.branchesMesh, geometry, mat);
  }

  private updateMesh(
    mesh: THREE.Mesh,
    geometry: THREE.BufferGeometry,
    material: THREE.Material
  ): void {
    mesh.geometry.dispose();
    const currentMat = mesh.material;
    if (currentMat) {
      if (Array.isArray(currentMat)) {
        currentMat.forEach(m => m.dispose());
      } else {
        currentMat.dispose();
      }
    }
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  private createLeavesGeometry(): void {
    const geometry = new THREE.BufferGeometry();
    const { verts, uvs, indices } = this.generator.leaves;

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      name: "leaves",
      map: getLeafTexture(this.options.leaves.type),
      color: new THREE.Color(this.options.leaves.tint),
      side: THREE.DoubleSide,
      alphaTest: this.options.leaves.alphaTest,
      dithering: true,
    });

    // Apply wind shader with integrated fade to leaves
    appendWindShader(mat, {
      ...this.options,
      instanced: false,
      enableFade: true,
    });
    this.updateMesh(this.leavesMesh, geometry, mat);
  }

  get vertexCount(): number {
    return (this.generator.branches.verts.length + this.generator.leaves.verts.length) / 3;
  }

  get triangleCount(): number {
    return (this.generator.branches.indices.length + this.generator.leaves.indices.length) / 3;
  }
}

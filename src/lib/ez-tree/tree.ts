import * as THREE from 'three';
import RNG from './rng';
import { Branch } from './branch';
import { Billboard, TreeType } from './enums';
import TreeOptions from './options';
import { loadPreset } from './presets/index';
import { getBarkTexture, getLeafTexture } from './textures';
import { appendWindShader, applyProfessionalFade } from './shaders/windShaderUtils'; // Import utilities
import { TreesOptions } from './environment/trees'; // Import TreesOptions for wind parameters
import { GrassOptions } from './environment/grass'; // Import GrassOptions for wind parameters

interface BranchGeometryData {
  verts: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  windFactor: number[]; // Not used in original, but kept for completeness if needed
}

interface LeafGeometryData {
  verts: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
}

interface SectionData {
  origin: THREE.Vector3;
  orientation: THREE.Euler;
  radius: number;
}

export class Tree extends THREE.Group {
  public rng!: RNG;
  public options: TreeOptions;
  public branchQueue: Branch[] = [];

  private branchesMesh: THREE.Mesh;
  private leavesMesh: THREE.Mesh;

  public windStrength: { x: number; y: number; z: number };
  public windFrequency: number;
  public windScale: number;

  private branches: BranchGeometryData = {
    verts: [],
    normals: [],
    indices: [],
    uvs: [],
    windFactor: []
  };

  private leaves: LeafGeometryData = {
    verts: [],
    normals: [],
    indices: [],
    uvs: [],
  };

  constructor(options: TreeOptions = new TreeOptions()) {
    super();
    this.name = 'Tree';
    this.branchesMesh = new THREE.Mesh();
    this.leavesMesh = new THREE.Mesh();
    this.add(this.branchesMesh);
    this.add(this.leavesMesh);
    this.options = options;

    this.windStrength = options.windStrength;
    this.windFrequency = options.windFrequency;
    this.windScale = options.windScale;
  }

  update(elapsedTime: number): void {
    const updateMaterialShader = (material: THREE.Material | THREE.Material[]) => {
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((mat: THREE.Material) => {
        if ((mat as THREE.MeshPhongMaterial).userData?.shader) {
          const shaderUniforms = ((mat as THREE.MeshPhongMaterial).userData.shader as { uniforms: { uTime: { value: number } } }).uniforms;
          shaderUniforms.uTime.value = elapsedTime;
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
    // Clean up old geometry
    this.branches = {
      verts: [],
      normals: [],
      indices: [],
      uvs: [],
      windFactor: []
    };

    this.leaves = {
      verts: [],
      normals: [],
      indices: [],
      uvs: [],
    };

    this.rng = new RNG(this.options.seed);

    // Create the trunk of the tree first
    this.branchQueue.push(
      new Branch(
        new THREE.Vector3(),
        new THREE.Euler(),
        this.options.branch.length[0],
        this.options.branch.radius[0],
        0,
        this.options.branch.sections[0],
        this.options.branch.segments[0],
      ),
    );

    while (this.branchQueue.length > 0) {
      const branch = this.branchQueue.shift();
      if (branch) {
        this.generateBranch(branch);
      }
    }

    this.createBranchesGeometry();
    this.createLeavesGeometry();
  }

  private generateBranch(branch: Branch): void {
    const indexOffset = this.branches.verts.length / 3;

    const sectionOrientation = branch.orientation.clone();
    const sectionOrigin = branch.origin.clone();
    const sectionLength =
      branch.length /
      branch.sectionCount /
      (this.options.type === TreeType.Deciduous ? this.options.branch.levels - 1 : 1);

    const sections: SectionData[] = [];

    for (let i = 0; i <= branch.sectionCount; i++) {
      let sectionRadius = branch.radius;

      if (
        i === branch.sectionCount &&
        branch.level === this.options.branch.levels
      ) {
        sectionRadius = 0.001;
      } else if (this.options.type === TreeType.Deciduous) {
        sectionRadius *=
          1 - this.options.branch.taper[branch.level] * (i / branch.sectionCount);
      } else if (this.options.type === TreeType.Evergreen) {
        sectionRadius *= 1 - (i / branch.sectionCount);
      }

      let first: { vertex: THREE.Vector3; normal: THREE.Vector3; uv: THREE.Vector2 } | undefined;
      for (let j = 0; j < branch.segmentCount; j++) {
        const angle = (2.0 * Math.PI * j) / branch.segmentCount;

        const vertex = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(sectionRadius)
          .applyEuler(sectionOrientation)
          .add(sectionOrigin);

        const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
          .applyEuler(sectionOrientation)
          .normalize();

        const uv = new THREE.Vector2(
          j / branch.segmentCount,
          (i % 2 === 0) ? 0 : 1,
        );

        this.branches.verts.push(...Object.values(vertex));
        this.branches.normals.push(...Object.values(normal));
        this.branches.uvs.push(...Object.values(uv));

        if (j === 0) {
          first = { vertex, normal, uv };
        }
      }

      if (first) {
        this.branches.verts.push(...Object.values(first.vertex));
        this.branches.normals.push(...Object.values(first.normal));
        this.branches.uvs.push(1, first.uv.y);
      }


      sections.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: sectionRadius,
      });

      sectionOrigin.add(
        new THREE.Vector3(0, sectionLength, 0).applyEuler(sectionOrientation),
      );

      const gnarliness =
        Math.max(1, 1 / Math.sqrt(sectionRadius)) *
        this.options.branch.gnarliness[branch.level];

      sectionOrientation.x += this.rng.random(gnarliness, -gnarliness);
      sectionOrientation.z += this.rng.random(gnarliness, -gnarliness);

      const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation);

      const qTwist = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.options.branch.twist[branch.level],
      );

      const qForce = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().copy(this.options.branch.force.direction),
      );

      qSection.multiply(qTwist);
      qSection.rotateTowards(
        qForce,
        this.options.branch.force.strength / sectionRadius,
      );

      sectionOrientation.setFromQuaternion(qSection);
    }

    this.generateBranchIndices(indexOffset, branch);

    if (this.options.type === TreeType.Deciduous) {
      const lastSection = sections[sections.length - 1];

      if (branch.level < this.options.branch.levels) {
        this.branchQueue.push(
          new Branch(
            lastSection.origin,
            lastSection.orientation,
            this.options.branch.length[branch.level + 1],
            lastSection.radius,
            branch.level + 1,
            branch.sectionCount,
            branch.segmentCount,
          ),
        );
      } else {
        this.generateLeaf(lastSection.origin, lastSection.orientation);
      }
    }

    if (branch.level === this.options.branch.levels) {
      this.generateLeaves(sections);
    } else if (branch.level < this.options.branch.levels) {
      this.generateChildBranches(
        this.options.branch.children[branch.level],
        branch.level + 1,
        sections);
    }
  }

  private generateChildBranches(count: number, level: number, sections: SectionData[]): void {
    const radialOffset = this.rng.random();

    for (let i = 0; i < count; i++) {
      const childBranchStart = this.rng.random(1.0, this.options.branch.start[level]);

      const sectionIndex = Math.floor(childBranchStart * (sections.length - 1));
      let sectionB: SectionData;
      const sectionA = sections[sectionIndex];
      if (sectionIndex === sections.length - 1) {
        sectionB = sectionA;
      } else {
        sectionB = sections[sectionIndex + 1];
      }

      const alpha =
        (childBranchStart - sectionIndex / (sections.length - 1)) /
        (1 / (sections.length - 1));

      const childBranchOrigin = new THREE.Vector3().lerpVectors(
        sectionA.origin,
        sectionB.origin,
        alpha,
      );

      const childBranchRadius =
        this.options.branch.radius[level] *
        ((1 - alpha) * sectionA.radius + alpha * sectionB.radius);

      const qA = new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB = new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation = new THREE.Euler().setFromQuaternion(
        qB.slerp(qA, alpha),
      );

      const radialAngle = 2.0 * Math.PI * (radialOffset + i / count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        this.options.branch.angle[level] / (180 / Math.PI),
      );
      const q2 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        radialAngle,
      );
      const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);


      const childBranchOrientation = new THREE.Euler().setFromQuaternion(
        q3.multiply(q2.multiply(q1)),
      );

      const childBranchLength =
        this.options.branch.length[level] *
        (this.options.type === TreeType.Evergreen
          ? 1.0 - childBranchStart
          : 1.0);

      this.branchQueue.push(
        new Branch(
          childBranchOrigin,
          childBranchOrientation,
          childBranchLength,
          childBranchRadius,
          level,
          this.options.branch.sections[level],
          this.options.branch.segments[level],
        ),
      );
    }
  }

  private generateLeaves(sections: SectionData[]): void {
    const radialOffset = this.rng.random();

    for (let i = 0; i < this.options.leaves.count; i++) {
      const leafStart = this.rng.random(1.0, this.options.leaves.start);

      const sectionIndex = Math.floor(leafStart * (sections.length - 1));
      let sectionB: SectionData;
      const sectionA = sections[sectionIndex];
      if (sectionIndex === sections.length - 1) {
        sectionB = sectionA;
      } else {
        sectionB = sections[sectionIndex + 1];
      }

      const alpha =
        (leafStart - sectionIndex / (sections.length - 1)) /
        (1 / (sections.length - 1));

      const leafOrigin = new THREE.Vector3().lerpVectors(
        sectionA.origin,
        sectionB.origin,
        alpha,
      );

      const qA = new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB = new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation = new THREE.Euler().setFromQuaternion(
        qB.slerp(qA, alpha),
      );

      const radialAngle = 2.0 * Math.PI * (radialOffset + i / this.options.leaves.count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        this.options.leaves.angle / (180 / Math.PI),
      );
      const q2 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        radialAngle,
      );
      const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);

      const leafOrientation = new THREE.Euler().setFromQuaternion(
        q3.multiply(q2.multiply(q1)),
      );

      this.generateLeaf(leafOrigin, leafOrientation);
    }
  }

  private generateLeaf(origin: THREE.Vector3, orientation: THREE.Euler): void {
    let i = this.leaves.verts.length / 3;

    const leafSize =
      this.options.leaves.size *
      (1 +
        this.rng.random(
          this.options.leaves.sizeVariance,
          -this.options.leaves.sizeVariance,
        ));

    const W = leafSize;
    const L = leafSize;

    const createLeaf = (rotation: number) => {
      const v = [
        new THREE.Vector3(-W / 2, L, 0),
        new THREE.Vector3(-W / 2, 0, 0),
        new THREE.Vector3(W / 2, 0, 0),
        new THREE.Vector3(W / 2, L, 0),
      ].map((vec) =>
        vec
          .applyEuler(new THREE.Euler(0, rotation, 0))
          .applyEuler(orientation)
          .add(origin),
      );

      this.leaves.verts.push(
        v[0].x, v[0].y, v[0].z,
        v[1].x, v[1].y, v[1].z,
        v[2].x, v[2].y, v[2].z,
        v[3].x, v[3].y, v[3].z,
      );

      const n = new THREE.Vector3(0, 0, 1).applyEuler(orientation);
      this.leaves.normals.push(
        n.x, n.y, n.z,
        n.x, n.y, n.z,
        n.x, n.y, n.z,
        n.x, n.y, n.z,
      );
      this.leaves.uvs.push(0, 1, 0, 0, 1, 0, 1, 1);
      this.leaves.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
      i += 4;
    };

    createLeaf(0);
    if (this.options.leaves.billboard === Billboard.Double) {
      createLeaf(Math.PI / 2);
    }
  }

  private generateBranchIndices(indexOffset: number, branch: Branch): void {
    let v1, v2, v3, v4;
    const N = branch.segmentCount + 1;
    for (let i = 0; i < branch.sectionCount; i++) {
      for (let j = 0; j < branch.segmentCount; j++) {
        v1 = indexOffset + i * N + j;
        v2 = indexOffset + i * N + (j + 1);
        v3 = v1 + N;
        v4 = v2 + N;
        this.branches.indices.push(v1, v3, v2, v2, v3, v4);
      }
    }
  }

  private createBranchesGeometry(): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.branches.verts), 3),
    );
    g.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(this.branches.normals), 3),
    );
    g.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(this.branches.uvs), 2),
    );
    g.setIndex(
      new THREE.BufferAttribute(new Uint16Array(this.branches.indices), 1),
    );
    g.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      name: 'branches',
      flatShading: this.options.bark.flatShading,
      color: new THREE.Color(this.options.bark.tint),
    });

    if (this.options.bark.textured) {
      mat.aoMap = getBarkTexture(this.options.bark.type, 'ao', this.options.bark.textureScale);
      mat.map = getBarkTexture(this.options.bark.type, 'color', this.options.bark.textureScale);
      mat.normalMap = getBarkTexture(this.options.bark.type, 'normal', this.options.bark.textureScale);
      mat.roughnessMap = getBarkTexture(this.options.bark.type, 'roughness', this.options.bark.textureScale);
    }

    // Apply professional colorless fade to branches
    applyProfessionalFade(mat);

    this.branchesMesh.geometry.dispose();
    (this.branchesMesh.material as THREE.Material).dispose();

    this.branchesMesh.geometry = g;
    this.branchesMesh.material = mat;
    this.branchesMesh.castShadow = true;
    this.branchesMesh.receiveShadow = true;
  }

  private createLeavesGeometry(): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.leaves.verts), 3),
    );
    g.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(this.leaves.uvs), 2),
    );
    g.setIndex(
      new THREE.BufferAttribute(new Uint16Array(this.leaves.indices), 1),
    );
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      name: 'leaves',
      map: getLeafTexture(this.options.leaves.type),
      color: new THREE.Color(this.options.leaves.tint),
      side: THREE.DoubleSide,
      alphaTest: this.options.leaves.alphaTest,
      dithering: true
    });

    // Apply wind shader with integrated fade to leaves
    appendWindShader(mat, this.options as unknown as GrassOptions, false, true);

    this.leavesMesh.geometry.dispose();
    (this.leavesMesh.material as THREE.Material).dispose();

    this.leavesMesh.geometry = g;
    this.leavesMesh.material = mat;

    this.leavesMesh.castShadow = true;
    this.leavesMesh.receiveShadow = true;
  }

  get vertexCount(): number {
    return (this.branches.verts.length + this.leaves.verts.length) / 3;
  }

  get triangleCount(): number {
    return (this.branches.indices.length + this.leaves.indices.length) / 3;
  }
}

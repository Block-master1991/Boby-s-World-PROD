import * as THREE from "three";
import type { Branch } from "../branch";
import { TreeType } from "../enums";
import type TreeOptions from "../options";
import type RNG from "../rng";
import type { BranchGeometryData, SectionData, VertexData } from "../types";

export class BranchGenerator {
  constructor(
    private options: TreeOptions,
    private rng: RNG,
    private branchesData: BranchGeometryData
  ) {}

  generateBranch(branch: Branch): SectionData[] {
    const sectionOrientation = branch.orientation.clone();
    const sectionOrigin = branch.origin.clone();

    const levelsDenom =
      this.options.type === TreeType.Deciduous ? this.options.branch.levels - 1 : 1;
    const safeLevelsDenom = levelsDenom === 0 ? 1 : levelsDenom;

    const sectionLength = branch.length / branch.sectionCount / safeLevelsDenom;

    const sections: SectionData[] = [];

    for (let i = 0; i <= branch.sectionCount; i++) {
      const sectionRadius = this.calculateSectionRadius(branch, i);
      this.generateSegmentVertices({
        branch,
        radius: sectionRadius,
        origin: sectionOrigin,
        orientation: sectionOrientation,
        sectionIndex: i,
      });

      sections.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: sectionRadius,
      });

      this.advanceSection(sectionOrigin, sectionLength, sectionOrientation);
      this.perturbOrientation(sectionOrientation, sectionRadius, branch.level);
    }

    return sections;
  }

  private calculateSectionRadius(branch: Branch, index: number): number {
    let sectionRadius = branch.radius;

    if (index === branch.sectionCount && branch.level === this.options.branch.levels) {
      sectionRadius = 0.001;
    } else if (this.options.type === TreeType.Deciduous) {
      const taper = this.options.branch.taper?.[branch.level] ?? 0.5; // Safe default
      sectionRadius *= 1 - taper * (index / branch.sectionCount);
    } else if (this.options.type === TreeType.Evergreen) {
      sectionRadius *= 1 - index / branch.sectionCount;
    }

    return sectionRadius;
  }

  private generateSegmentVertices(params: {
    branch: Branch;
    radius: number;
    origin: THREE.Vector3;
    orientation: THREE.Euler;
    sectionIndex: number;
  }): void {
    const { branch, radius, origin, orientation, sectionIndex } = params;

    let first: VertexData | undefined;

    for (let j = 0; j < branch.segmentCount; j++) {
      const angle = (2.0 * Math.PI * j) / branch.segmentCount;

      const vertex = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
        .multiplyScalar(radius)
        .applyEuler(orientation)
        .add(origin);

      const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
        .applyEuler(orientation)
        .normalize();

      const uv = new THREE.Vector2(j / branch.segmentCount, sectionIndex % 2 === 0 ? 0 : 1);

      this.branchesData.verts.push(vertex.x, vertex.y, vertex.z);
      this.branchesData.normals.push(normal.x, normal.y, normal.z);
      this.branchesData.uvs.push(uv.x, uv.y);

      if (j === 0) {
        first = { vertex, normal, uv };
      }
    }

    if (first) {
      this.branchesData.verts.push(first.vertex.x, first.vertex.y, first.vertex.z);
      this.branchesData.normals.push(first.normal.x, first.normal.y, first.normal.z);
      this.branchesData.uvs.push(1, first.uv.y);
    }
  }

  private advanceSection(origin: THREE.Vector3, length: number, orientation: THREE.Euler): void {
    origin.add(new THREE.Vector3(0, length, 0).applyEuler(orientation));
  }

  private perturbOrientation(orientation: THREE.Euler, radius: number, level: number): void {
    const gnarliness =
      Math.max(1, 1 / Math.sqrt(radius)) * (this.options.branch.gnarliness?.[level] ?? 0);

    orientation.x += this.rng.random(gnarliness, -gnarliness);
    orientation.z += this.rng.random(gnarliness, -gnarliness);

    const qSection = new THREE.Quaternion().setFromEuler(orientation);

    const twist = this.options.branch.twist?.[level] ?? 0;
    const qTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);

    const qForce = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().copy(this.options.branch.force.direction)
    );

    qSection.multiply(qTwist);
    qSection.rotateTowards(qForce, this.options.branch.force.strength / radius);

    orientation.setFromQuaternion(qSection);
  }

  public generateBranchIndices(indexOffset: number, branch: Branch): void {
    let v1, v2, v3, v4;
    const N = branch.segmentCount + 1;
    for (let i = 0; i < branch.sectionCount; i++) {
      for (let j = 0; j < branch.segmentCount; j++) {
        v1 = indexOffset + i * N + j;
        v2 = indexOffset + i * N + (j + 1);
        v3 = v1 + N;
        v4 = v2 + N;
        this.branchesData.indices.push(v1, v3, v2, v2, v3, v4);
      }
    }
  }
}

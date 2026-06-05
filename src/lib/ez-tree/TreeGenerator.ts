import * as THREE from "three";
import { Branch } from "./branch";
import { TreeType } from "./enums";
import { BranchGenerator } from "./generators/BranchGenerator";
import { LeafGenerator } from "./generators/LeafGenerator";
import type TreeOptions from "./options";
import RNG from "./rng";
import type { BranchGeometryData, LeafGeometryData, SectionData } from "./types";

export class TreeGenerator {
  public rng!: RNG;
  public branches: BranchGeometryData = {
    verts: [],
    normals: [],
    indices: [],
    uvs: [],
    windFactor: [],
  };

  public leaves: LeafGeometryData = {
    verts: [],
    normals: [],
    indices: [],
    uvs: [],
  };

  private branchQueue: Branch[] = [];
  private options: TreeOptions;

  private branchGenerator!: BranchGenerator;
  private leafGenerator!: LeafGenerator;

  constructor(options: TreeOptions) {
    this.options = options;
  }

  generate(): void {
    this.initializeData();
    this.createTrunk();
    this.processQueue();
  }

  private initializeData(): void {
    this.branches = {
      verts: [],
      normals: [],
      indices: [],
      uvs: [],
      windFactor: [],
    };

    this.leaves = {
      verts: [],
      normals: [],
      indices: [],
      uvs: [],
    };

    this.rng = new RNG(this.options.seed);
    this.branchQueue = [];

    // Initialize sub-generators
    this.branchGenerator = new BranchGenerator(this.options, this.rng, this.branches);
    this.leafGenerator = new LeafGenerator(this.options, this.rng, this.leaves);
  }

  private createTrunk(): void {
    this.branchQueue.push(
      new Branch({
        origin: new THREE.Vector3(),
        orientation: new THREE.Euler(),
        length: this.options.branch.length[0] ?? 10,
        radius: this.options.branch.radius[0] ?? 1,
        level: 0,
        sectionCount: this.options.branch.sections[0] ?? 6,
        segmentCount: this.options.branch.segments[0] ?? 8,
      })
    );
  }

  private processQueue(): void {
    while (this.branchQueue.length > 0) {
      const branch = this.branchQueue.shift();
      if (branch) {
        this.processBranch(branch);
      }
    }
  }

  private processBranch(branch: Branch): void {
    const indexOffset = this.branches.verts.length / 3;

    // Use BranchGenerator to generate sections and geometry
    const sections = this.branchGenerator.generateBranch(branch);

    // Generate indices
    this.branchGenerator.generateBranchIndices(indexOffset, branch);

    // Continue recursion
    this.handleRecursiveGrowth(branch, sections);
  }

  private handleRecursiveGrowth(branch: Branch, sections: SectionData[]): void {
    if (this.options.type === TreeType.Deciduous) {
      const lastSection = sections[sections.length - 1];

      if (lastSection) {
        if (branch.level < this.options.branch.levels) {
          const nextLength = this.options.branch.length[branch.level + 1] ?? 1;
          this.branchQueue.push(
            new Branch({
              origin: lastSection.origin,
              orientation: lastSection.orientation,
              length: nextLength,
              radius: lastSection.radius,
              level: branch.level + 1,
              sectionCount: branch.sectionCount,
              segmentCount: branch.segmentCount,
            })
          );
        } else {
          this.leafGenerator.generateLeaf(lastSection.origin, lastSection.orientation);
        }
      }
    }

    if (branch.level === this.options.branch.levels) {
      this.generateLeavesFromSections(sections);
    } else if (branch.level < this.options.branch.levels) {
      this.generateChildBranches(
        this.options.branch.children[branch.level] ?? 0,
        branch.level + 1,
        sections
      );
    }
  }

  private generateChildBranches(count: number, level: number, sections: SectionData[]): void {
    if (sections.length < 2 || count <= 0) return;

    for (let i = 0; i < count; i++) {
      this.createChildBranch(i, count, level, sections);
    }
  }

  private createChildBranch(
    index: number,
    count: number,
    level: number,
    sections: SectionData[]
  ): void {
    const radialOffset = this.rng.random();
    const startFactorLimit = this.options.branch.start[level] ?? 1;
    const childBranchStart = this.rng.random(1.0, startFactorLimit);

    // Interpolate position on parent branch
    const interpolation = this.interpolateSection(sections, childBranchStart);
    if (!interpolation) return;

    const { origin, radius, orientation: parentOrientation } = interpolation;

    // Calculate new orientation
    const radialAngle = 2.0 * Math.PI * (radialOffset + index / count);
    const angle = (this.options.branch.angle[level] ?? 45) / (180 / Math.PI);

    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);
    const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);

    const childBranchOrientation = new THREE.Euler().setFromQuaternion(
      q3.multiply(q2.multiply(q1))
    );

    // Determine length
    const lengthBase = this.options.branch.length[level] ?? 1;
    const childBranchLength =
      lengthBase * (this.options.type === TreeType.Evergreen ? 1.0 - childBranchStart : 1.0);

    this.branchQueue.push(
      new Branch({
        origin,
        orientation: childBranchOrientation,
        length: childBranchLength,
        radius,
        level,
        sectionCount: this.options.branch.sections[level] ?? 5,
        segmentCount: this.options.branch.segments[level] ?? 6,
      })
    );
  }

  private generateLeavesFromSections(sections: SectionData[]): void {
    if (sections.length < 2) return;
    const count = this.options.leaves.count ?? 0;

    for (let i = 0; i < count; i++) {
      this.createLeafOnBranch(i, count, sections);
    }
  }

  private createLeafOnBranch(index: number, count: number, sections: SectionData[]): void {
    const radialOffset = this.rng.random();
    const startFactor = this.options.leaves.start ?? 0;
    const leafStart = this.rng.random(1.0, startFactor);

    const interpolation = this.interpolateSection(sections, leafStart);
    if (!interpolation) return;

    const { origin, orientation: parentOrientation } = interpolation;

    const radialAngle = 2.0 * Math.PI * (radialOffset + index / count);
    const angle = (this.options.leaves.angle ?? 0) / (180 / Math.PI);

    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radialAngle);
    const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);

    const leafOrientation = new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1)));

    this.leafGenerator.generateLeaf(origin, leafOrientation);
  }

  private interpolateSection(
    sections: SectionData[],
    t: number
  ): { origin: THREE.Vector3; radius: number; orientation: THREE.Euler } | null {
    const maxIndex = sections.length - 1;
    const virtualIndex = t * maxIndex;
    const indexA = Math.floor(virtualIndex);
    const indexB = Math.min(indexA + 1, maxIndex);

    const sectionA = sections[indexA];
    const sectionB = sections[indexB];

    if (!sectionA || !sectionB) return null;

    const alpha = virtualIndex - indexA;

    const origin = new THREE.Vector3().lerpVectors(sectionA.origin, sectionB.origin, alpha);
    const radius = THREE.MathUtils.lerp(sectionA.radius, sectionB.radius, alpha);

    const qA = new THREE.Quaternion().setFromEuler(sectionA.orientation);
    const qB = new THREE.Quaternion().setFromEuler(sectionB.orientation);
    const orientation = new THREE.Euler().setFromQuaternion(qB.slerp(qA, alpha));

    return { origin, radius, orientation };
  }
}

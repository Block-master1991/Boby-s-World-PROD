import * as THREE from "three";
import { Billboard } from "../enums";
import type TreeOptions from "../options";
import type RNG from "../rng";
import type { LeafGeometryData } from "../types";

export class LeafGenerator {
  constructor(
    private options: TreeOptions,
    private rng: RNG,
    private leavesData: LeafGeometryData
  ) {}

  generateLeaf(origin: THREE.Vector3, orientation: THREE.Euler): void {
    let index = this.leavesData.verts.length / 3;

    const leafSizeVariable = this.options.leaves.sizeVariance ?? 0;
    const leafSize =
      this.options.leaves.size * (1 + this.rng.random(leafSizeVariable, -leafSizeVariable));

    const W = leafSize;
    const L = leafSize;

    this.createLeafGeometry({
      width: W,
      length: L,
      origin,
      orientation,
      rotation: 0,
      startIndex: index,
    });

    if (this.options.leaves.billboard === Billboard.Double) {
      // Recalculate index for next leaf plane
      index = this.leavesData.verts.length / 3;
      this.createLeafGeometry({
        width: W,
        length: L,
        origin,
        orientation,
        rotation: Math.PI / 2,
        startIndex: index,
      });
    }
  }

  private createLeafGeometry(params: {
    width: number;
    length: number;
    origin: THREE.Vector3;
    orientation: THREE.Euler;
    rotation: number;
    startIndex: number;
  }): void {
    const { width, length, origin, orientation, rotation, startIndex } = params;

    const v = [
      new THREE.Vector3(-width / 2, length, 0),
      new THREE.Vector3(-width / 2, 0, 0),
      new THREE.Vector3(width / 2, 0, 0),
      new THREE.Vector3(width / 2, length, 0),
    ].map(vec =>
      vec
        .applyEuler(new THREE.Euler(0, rotation, 0))
        .applyEuler(orientation)
        .add(origin)
    );

    // Safe array destructuring
    const [v0, v1, v2, v3] = v;

    if (v0 && v1 && v2 && v3) {
      this.leavesData.verts.push(
        v0.x,
        v0.y,
        v0.z,
        v1.x,
        v1.y,
        v1.z,
        v2.x,
        v2.y,
        v2.z,
        v3.x,
        v3.y,
        v3.z
      );

      const n = new THREE.Vector3(0, 0, 1).applyEuler(orientation);
      this.leavesData.normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);

      this.leavesData.uvs.push(0, 1, 0, 0, 1, 0, 1, 1);

      this.leavesData.indices.push(
        startIndex,
        startIndex + 1,
        startIndex + 2,
        startIndex,
        startIndex + 2,
        startIndex + 3
      );
    }
  }
}

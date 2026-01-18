import * as THREE from 'three';

export interface BranchOptions {
  origin?: THREE.Vector3;
  orientation?: THREE.Euler;
  length?: number;
  radius?: number;
  level?: number;
  sectionCount?: number;
  segmentCount?: number;
}

export class Branch {
  public origin: THREE.Vector3;
  public orientation: THREE.Euler;
  public length: number;
  public radius: number;
  public level: number;
  public sectionCount: number;
  public segmentCount: number;

  /**
   * Generates a new branch
   * @param {BranchOptions} options The options for the branch
   */
  constructor(options: BranchOptions = {}) {
    const {
      origin = new THREE.Vector3(),
      orientation = new THREE.Euler(),
      length = 0,
      radius = 0,
      level = 0,
      sectionCount = 0,
      segmentCount = 0,
    } = options;

    this.origin = origin.clone();
    this.orientation = orientation.clone();
    this.length = length;
    this.radius = radius;
    this.level = level;
    this.sectionCount = sectionCount;
    this.segmentCount = segmentCount;
  }
}

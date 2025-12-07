import * as THREE from 'three';

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
   * @param {THREE.Vector3} origin The starting point of the branch
   * @param {THREE.Euler} orientation The starting orientation of the branch
   * @param {number} length The length of the branch
   * @param {number} radius The radius of the branch at its starting point
   */
  constructor(
    origin: THREE.Vector3 = new THREE.Vector3(),
    orientation: THREE.Euler = new THREE.Euler(),
    length: number = 0,
    radius: number = 0,
    level: number = 0,
    sectionCount: number = 0,
    segmentCount: number = 0,
  ) {
    this.origin = origin.clone();
    this.orientation = orientation.clone();
    this.length = length;
    this.radius = radius;
    this.level = level;
    this.sectionCount = sectionCount;
    this.segmentCount = segmentCount;
  }
}

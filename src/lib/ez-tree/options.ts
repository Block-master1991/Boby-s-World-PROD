import { BarkType, Billboard, LeafType, TreeType } from './enums';

interface BarkOptions {
  type: BarkType;
  tint: number;
  flatShading: boolean;
  textured: boolean;
  textureScale: { x: number; y: number };
}

interface BranchLevelOptions {
  [key: number]: number;
}

interface BranchForceOptions {
  direction: { x: number; y: number; z: number };
  strength: number;
}

interface BranchOptions {
  levels: number;
  angle: BranchLevelOptions;
  children: BranchLevelOptions;
  force: BranchForceOptions;
  gnarliness: BranchLevelOptions;
  length: BranchLevelOptions;
  radius: BranchLevelOptions;
  sections: BranchLevelOptions;
  segments: BranchLevelOptions;
  start: BranchLevelOptions;
  taper: BranchLevelOptions;
  twist: BranchLevelOptions;
}

interface LeavesOptions {
  type: LeafType;
  billboard: Billboard;
  angle: number;
  count: number;
  start: number;
  size: number;
  sizeVariance: number;
  tint: number;
  alphaTest: number;
}

export default class TreeOptions {
  public seed: number;
  public type: TreeType;
  public bark: BarkOptions;
  public branch: BranchOptions;
  public leaves: LeavesOptions;
  public windStrength: { x: number; y: number; z: number };
  public windFrequency: number;
  public windScale: number;
  
  // Index signature to allow string indexing
  [key: string]: number | TreeType | BarkOptions | BranchOptions | LeavesOptions | object | { x: number; y: number; z: number };

  constructor() {
    this.seed = 0;
    this.type = TreeType.Deciduous;

    this.windStrength = { x: 0.1, y: 0, z: 0.1 }; // Greatly reduced wind strength for trees
    this.windFrequency = 0.1; // Greatly reduced wind frequency for trees
    this.windScale = 70; // Default wind scale for trees

    this.bark = {
      type: BarkType.Oak,
      tint: 0xffffff,
      flatShading: false,
      textured: true,
      textureScale: { x: 1, y: 1 },
    };

    this.branch = {
      levels: 3,
      angle: {
        1: 70,
        2: 60,
        3: 60,
      },
      children: {
        0: 7,
        1: 7,
        2: 5,
      },
      force: {
        direction: { x: 0, y: 1, z: 0 },
        strength: 0.01,
      },
      gnarliness: {
        0: 0.15,
        1: 0.2,
        2: 0.3,
        3: 0.02,
      },
      length: {
        0: 15,
        1: 15,
        2: 8,
        3: 0.8,
      },
      radius: {
        0: 1.2,
        1: 0.6,
        2: 0.6,
        3: 0.6,
      },
      sections: {
        0: 12,
        1: 10,
        2: 8,
        3: 6,
      },
      segments: {
        0: 8,
        1: 6,
        2: 4,
        3: 3,
      },
      start: {
        1: 0.4,
        2: 0.3,
        3: 0.3,
      },
      taper: {
        0: 0.7,
        1: 0.7,
        2: 0.7,
        3: 0.7,
      },
      twist: {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
    };

    this.leaves = {
      type: LeafType.Oak,
      billboard: Billboard.Double,
      angle: 10,
      count: 1,
      start: 0,
      size: 2.0,
      sizeVariance: 0.5,
      tint: 0xffffff,
      alphaTest: 0.5,
    };
  }

  /**
   * Copies the values from source into this object
   * @param {TreeOptions} source 
   */
  copy(source: TreeOptions): void {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key) && Object.prototype.hasOwnProperty.call(this, key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          // Recursively copy for nested objects
          // Ensure the target property is an object before attempting to copy into it
          if (typeof this[key] === 'object' && this[key] !== null) {
            Object.assign(this[key], source[key]);
          } else {
            // If target property is not an object, just assign the source object
            this[key] = source[key];
          }
        } else {
          // For primitive values or arrays, directly assign
          this[key] = source[key];
        }
      }
    }
  }
}

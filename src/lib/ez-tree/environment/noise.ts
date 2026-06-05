import * as THREE from "three";

/**
 * Standard mod-289 function used in Simplex noise.
 */
function mod3(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    v.x - Math.floor(v.x / 289.0) * 289.0,
    v.y - Math.floor(v.y / 289.0) * 289.0,
    v.z - Math.floor(v.z / 289.0) * 289.0
  );
}

/**
 * Permutation function for Simplex noise hashing.
 */
function permute3(v: THREE.Vector3): THREE.Vector3 {
  return mod3(
    new THREE.Vector3((v.x * 34.0 + 1.0) * v.x, (v.y * 34.0 + 1.0) * v.y, (v.z * 34.0 + 1.0) * v.z)
  );
}

// Constant vector used in Simplex 2D calculations
const C = new THREE.Vector4(
  0.211324865405187, // (3.0-Math.sqrt(3.0))/6.0
  0.366025403784439, // 0.5*(Math.sqrt(3.0)-1.0)
  -0.577350269189626, // -1.0 + 2.0 * C.x
  0.024390243902439 // 1.0 / 41.0
);

/**
 * Prepares the Simplex grid coordinates and displacements.
 */
function prepareGrid(v: THREE.Vector2) {
  const i = new THREE.Vector2(
    Math.floor(v.x + C.y * (v.x + v.y)),
    Math.floor(v.y + C.y * (v.x + v.y))
  );

  const x0 = new THREE.Vector2(v.x - i.x + C.x * (i.x + i.y), v.y - i.y + C.x * (i.x + i.y));

  const i1 = new THREE.Vector2(x0.x > x0.y ? 1.0 : 0.0, x0.x > x0.y ? 0.0 : 1.0);

  const x12 = new THREE.Vector4(x0.x + C.x - i1.x, x0.y + C.x - i1.y, x0.x + C.z, x0.y + C.z);

  return { i, x0, i1, x12 };
}

/**
 * Computes permutation hashes for the three vertices of the simplex.
 */
function computeHashes(i: THREE.Vector2, i1: THREE.Vector2): THREE.Vector3 {
  const iMod = new THREE.Vector2(
    i.x - Math.floor(i.x * (1.0 / 289.0)) * 289.0,
    i.y - Math.floor(i.y * (1.0 / 289.0)) * 289.0
  );

  let p = new THREE.Vector3(iMod.y, iMod.y + i1.y, iMod.y + 1.0);

  p = permute3(p);
  p = permute3(new THREE.Vector3(p.x + iMod.x, p.y + iMod.x + i1.x, p.z + iMod.x + 1.0));

  return p;
}

/**
 * Calculates the final weighted noise contribution from all vertices.
 */
function calculateFinalNoise(p: THREE.Vector3, x0: THREE.Vector2, x12: THREE.Vector4): number {
  // Weights for three vertices
  let m = new THREE.Vector3(
    Math.max(0.0, 0.5 - x0.dot(x0)),
    Math.max(0.0, 0.5 - (x12.x * x12.x + x12.y * x12.y)),
    Math.max(0.0, 0.5 - (x12.z * x12.z + x12.w * x12.w))
  );
  m = new THREE.Vector3(m.x * m.x * m.x * m.x, m.y * m.y * m.y * m.y, m.z * m.z * m.z * m.z);

  // Gradients
  const x = new THREE.Vector3(
    2.0 * (p.x * C.w - Math.floor(p.x * C.w)) - 1.0,
    2.0 * (p.y * C.w - Math.floor(p.y * C.w)) - 1.0,
    2.0 * (p.z * C.w - Math.floor(p.z * C.w)) - 1.0
  );

  const h = new THREE.Vector3(Math.abs(x.x) - 0.5, Math.abs(x.y) - 0.5, Math.abs(x.z) - 0.5);
  const ox = new THREE.Vector3(Math.floor(x.x + 0.5), Math.floor(x.y + 0.5), Math.floor(x.z + 0.5));
  const a0 = new THREE.Vector3(x.x - ox.x, x.y - ox.y, x.z - ox.z);

  // Normalization and final summation
  const mFinal = new THREE.Vector3(
    m.x * (1.79284291400159 - 0.85373472095314 * (a0.x * a0.x + h.x * h.x)),
    m.y * (1.79284291400159 - 0.85373472095314 * (a0.y * a0.y + h.y * h.y)),
    m.z * (1.79284291400159 - 0.85373472095314 * (a0.z * a0.z + h.z * h.z))
  );

  const g = new THREE.Vector3(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w
  );

  return 130.0 * mFinal.dot(g);
}

/**
 * 2D Simplex Noise Implementation.
 */
export function simplex2d(v: THREE.Vector2): number {
  const { i, x0, i1, x12 } = prepareGrid(v);
  const p = computeHashes(i, i1);
  return calculateFinalNoise(p, x0, x12);
}

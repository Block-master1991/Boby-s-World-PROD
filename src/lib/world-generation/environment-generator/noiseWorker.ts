/**
 * Lightweight Simplex 2D Noise for Web Workers
 * No THREE.js dependency — uses plain math instead of THREE.Vector2/3/4
 *
 * This is an EXACT port of noise.ts — same algorithm, same results,
 * but without the THREE.Vector2/3/4 object allocations.
 */

/**
 * Standard mod-289 function used in Simplex noise.
 */
function mod3(vx: number, vy: number, vz: number): [number, number, number] {
  return [
    vx - Math.floor(vx / 289.0) * 289.0,
    vy - Math.floor(vy / 289.0) * 289.0,
    vz - Math.floor(vz / 289.0) * 289.0,
  ];
}

/**
 * Permutation function for Simplex noise hashing.
 */
function permute3(vx: number, vy: number, vz: number): [number, number, number] {
  return mod3(
    (vx * 34.0 + 1.0) * vx,
    (vy * 34.0 + 1.0) * vy,
    (vz * 34.0 + 1.0) * vz
  );
}

// Constant vector used in Simplex 2D calculations (same as noise.ts)
const C_X = 0.211324865405187; // (3.0 - Math.sqrt(3.0)) / 6.0
const C_Y = 0.366025403784439; // 0.5 * (Math.sqrt(3.0) - 1.0)
const C_Z = -0.577350269189626; // -1.0 + 2.0 * C_X
const C_W = 0.024390243902439; // 1.0 / 41.0

/**
 * 2D Simplex Noise — exact port of noise.ts without THREE.js
 */
export function simplex2dWorker(x: number, y: number): number {
  // --- prepareGrid ---
  const i_x = Math.floor(x + C_Y * (x + y));
  const i_y = Math.floor(y + C_Y * (x + y));

  const x0_x = x - i_x + C_X * (i_x + i_y);
  const x0_y = y - i_y + C_X * (i_x + i_y);

  const i1_x = x0_x > x0_y ? 1.0 : 0.0;
  const i1_y = x0_x > x0_y ? 0.0 : 1.0;

  const x12_x = x0_x + C_X - i1_x;
  const x12_y = x0_y + C_X - i1_y;
  const x12_z = x0_x + C_Z;
  const x12_w = x0_y + C_Z;

  // --- computeHashes ---
  const iMod_x = i_x - Math.floor(i_x * (1.0 / 289.0)) * 289.0;
  const iMod_y = i_y - Math.floor(i_y * (1.0 / 289.0)) * 289.0;

  let p_x = iMod_y;
  let p_y = iMod_y + i1_y;
  let p_z = iMod_y + 1.0;

  [p_x, p_y, p_z] = permute3(p_x, p_y, p_z);

  [p_x, p_y, p_z] = permute3(p_x + iMod_x, p_y + iMod_x + i1_x, p_z + iMod_x + 1.0);

  // --- calculateFinalNoise ---
  // Weights for three vertices
  let m_x = Math.max(0.0, 0.5 - (x0_x * x0_x + x0_y * x0_y));
  let m_y = Math.max(0.0, 0.5 - (x12_x * x12_x + x12_y * x12_y));
  let m_z = Math.max(0.0, 0.5 - (x12_z * x12_z + x12_w * x12_w));
  m_x = m_x * m_x * m_x * m_x;
  m_y = m_y * m_y * m_y * m_y;
  m_z = m_z * m_z * m_z * m_z;

  // Gradients
  const gx = 2.0 * (p_x * C_W - Math.floor(p_x * C_W)) - 1.0;
  const gy = 2.0 * (p_y * C_W - Math.floor(p_y * C_W)) - 1.0;
  const gz = 2.0 * (p_z * C_W - Math.floor(p_z * C_W)) - 1.0;

  const hx = Math.abs(gx) - 0.5;
  const hy = Math.abs(gy) - 0.5;
  const hz = Math.abs(gz) - 0.5;

  const ox_x = Math.floor(gx + 0.5);
  const ox_y = Math.floor(gy + 0.5);
  const ox_z = Math.floor(gz + 0.5);

  const a0_x = gx - ox_x;
  const a0_y = gy - ox_y;
  const a0_z = gz - ox_z;

  // Normalization and final summation
  const mFinal_x = m_x * (1.79284291400159 - 0.85373472095314 * (a0_x * a0_x + hx * hx));
  const mFinal_y = m_y * (1.79284291400159 - 0.85373472095314 * (a0_y * a0_y + hy * hy));
  const mFinal_z = m_z * (1.79284291400159 - 0.85373472095314 * (a0_z * a0_z + hz * hz));

  const gDot_x = a0_x * x0_x + hx * x0_y;
  const gDot_y = a0_y * x12_x + hy * x12_y;
  const gDot_z = a0_z * x12_z + hz * x12_w;

  return 130.0 * (mFinal_x * gDot_x + mFinal_y * gDot_y + mFinal_z * gDot_z);
}

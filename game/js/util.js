// util.js — small math and deterministic-random helpers shared by every module.
// Nothing here touches the network or the DOM; it is pure arithmetic.

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Seeded PRNG (mulberry32) so the island, clouds and ring layout are identical
// on every load and in every screenshot.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 2D value noise: a hash of integer lattice points, bilinearly
// interpolated with a smooth curve. Two octaves give hills plus fine detail.
function latticeHash(ix, iz, seed) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 974634211)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function makeNoise2D(seed) {
  function noise(x, z, scale) {
    const gx = x / scale;
    const gz = z / scale;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = latticeHash(ix, iz, seed);
    const b = latticeHash(ix + 1, iz, seed);
    const c = latticeHash(ix, iz + 1, seed);
    const d = latticeHash(ix + 1, iz + 1, seed);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
  }
  return noise;
}

// Angle helpers: keep headings in (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function angleDiff(a, b) {
  return wrapAngle(a - b);
}

// Format helpers for the HUD readouts.
export function pad3(n) {
  return String(Math.max(0, Math.round(n))).padStart(3, '0');
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

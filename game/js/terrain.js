// terrain.js — the island: a procedural heightmap, its colours, the airfield
// runway and the ring course. One island, one airfield, one fixed course, so
// every flight and every screenshot shows the same recognisable place.
//
// World units are metres. The island is a disc of radius ~3000 m centred on
// (0, 0); sea level is height 0. The runway sits on a flattened strip near
// (0, 1600) and runs north-south.

import { clamp, lerp, makeNoise2D, mulberry32, smoothstep } from './util.js';

export const ISLAND_RADIUS = 3000;
export const SEA_LEVEL = 0;

// Runway: centre (0, 1600), 600 m long along Z, 44 m wide, heading north.
export const RUNWAY = {
  x: 0,
  z: 1600,
  length: 600,
  width: 44,
  heading: Math.PI, // approach from the south, flying toward -Z
  touchdownZ: 1780,
};

const noise = makeNoise2D(1337);
const detailNoise = makeNoise2D(9021);

// Distance from (x, z) to the runway rectangle, used to flatten the airfield.
export function runwayDistance(x, z) {
  const dx = Math.abs(x - RUNWAY.x) - RUNWAY.width / 2;
  const dz = Math.abs(z - RUNWAY.z) - RUNWAY.length / 2;
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z) / ISLAND_RADIUS;
  const mask = smoothstep(1.0, 0.45, r);
  if (mask <= 0) return -8;
  const hills = noise(x, z, 520);
  const detail = detailNoise(x, z, 170);
  // A ridged mountain spine across the north half of the island.
  const ridgeNoise = noise(x + 900, z - 700, 260);
  const ridge = 1 - Math.abs(2 * ridgeNoise - 1);
  let h = 6 + hills * 95 + detail * 42 + Math.pow(ridge, 3) * 150;
  h *= mask;
  // Flatten the airfield so the runway sits on level ground (10 here, minus
  // the 8 m sea-level offset below, leaves the strip 2 m above the sea).
  const dRun = runwayDistance(x, z);
  h = lerp(h, 10, smoothstep(140, 45, dRun));
  // Departure corridor: a valley opening north from the runway, so the
  // climb-out after takeoff never meets a mountain wall head-on.
  const corridor = smoothstep(420, 260, Math.abs(x)) * smoothstep(750, 1150, z);
  if (corridor > 0) h = lerp(h, Math.min(h, 110), corridor);
  return h - 8;
}

// Flat-shaded terrain colour for a quad at height h with slope s (0..1).
// Returns [r, g, b]; the renderer darkens it by the slope for relief.
export function terrainColour(h, slope) {
  const shade = 1 - clamp(slope * 0.9, 0, 0.45);
  let r, g, b;
  if (h < 0.5) {
    // Sea: one calm blue, so the quad grid never reads as tiles.
    r = 26; g = 104; b = 178;
  } else if (h < 7) {
    r = 214; g = 196; b = 138; // sand beach
  } else if (h < 95) {
    r = 86; g = 148; b = 74; // lowland grass
  } else if (h < 175) {
    r = 62; g = 118; b = 62; // forested hills
  } else if (h < 235) {
    r = 118; g = 106; b = 96; // bare rock
  } else {
    r = 238; g = 240; b = 244; // snow caps
  }
  return [Math.round(r * shade), Math.round(g * shade), Math.round(b * shade)];
}

// The ring course: eight gates in order, then the runway. Altitudes are
// metres above sea level and clear the terrain beneath each gate.
export const RINGS = [
  { x: 320, y: 215, z: 950, radius: 20 },
  { x: -520, y: 300, z: 320, radius: 20 },
  { x: -1250, y: 320, z: -620, radius: 20 },
  { x: -420, y: 330, z: -1520, radius: 20 },
  { x: 620, y: 330, z: -1420, radius: 20 },
  { x: 1420, y: 240, z: -420, radius: 20 },
  { x: 1180, y: 165, z: 720, radius: 20 },
  { x: 420, y: 260, z: 1420, radius: 20 },
];

// Clouds: fixed puffs drifting slowly east, drawn as billboards.
export function makeClouds(count) {
  const rand = mulberry32(4242);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const puffs = [];
    const n = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < n; p++) {
      puffs.push({
        dx: (rand() - 0.5) * 160,
        dy: (rand() - 0.5) * 14,
        dz: (rand() - 0.5) * 60,
        r: 34 + rand() * 46,
      });
    }
    clouds.push({
      x: (rand() - 0.5) * 6200,
      y: 300 + rand() * 160,
      z: (rand() - 0.5) * 6200,
      puffs,
      drift: 2 + rand() * 3,
    });
  }
  return clouds;
}

// A few low buildings beside the runway so the airfield reads as a place.
export const AIRFIELD_BUILDINGS = [
  { x: -70, z: 1480, w: 36, d: 26, h: 14, colour: '#c94f43' }, // hangar, red roof
  { x: -72, z: 1560, w: 22, d: 18, h: 9, colour: '#e8e2d4' }, // tower base
  { x: 78, z: 1620, w: 30, d: 20, h: 8, colour: '#7d8a99' }, // fuel depot
];

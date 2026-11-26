// render.js — the chase camera and the whole 3D view, drawn on a 2D canvas
// with a pinhole projection: sky, sun, clouds, the island mesh, the runway,
// the rings and the plane itself, all procedural, no images.

import { clamp, lerp, smoothstep } from './util.js';
import { AIRFIELD_BUILDINGS, RINGS, RUNWAY, heightAt, makeClouds, terrainColour } from './terrain.js';

const GRID_N = 60; // terrain grid vertices per side (60x60 = 3600 quads)
const GRID_SPAN = 6200; // metres covered by the grid
const VIEW_DIST = 2900;

function shade(rgb, factor) {
  const r = Math.round(rgb[0] * factor);
  const g = Math.round(rgb[1] * factor);
  const b = Math.round(rgb[2] * factor);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.clouds = makeClouds(34);
    this.time = 0;
    this.snap = false;
    this.camPos = [0, 60, 2100];
    this.camFwd = [0, 0, -1];
    this.camRight = [1, 0, 0];
    this.camUp = [0, 1, 0];
    this.buildTerrainMesh();
  }

  buildTerrainMesh() {
    const step = GRID_SPAN / (GRID_N - 1);
    const half = GRID_SPAN / 2;
    this.gridStep = step;
    this.gridHalf = half;
    this.heights = new Float32Array(GRID_N * GRID_N);
    for (let j = 0; j < GRID_N; j++) {
      for (let i = 0; i < GRID_N; i++) {
        const x = -half + i * step;
        const z = -half + j * step;
        this.heights[j * GRID_N + i] = heightAt(x, z);
      }
    }
    // One quad per grid cell, with a precomputed flat colour.
    this.quads = [];
    for (let j = 0; j < GRID_N - 1; j++) {
      for (let i = 0; i < GRID_N - 1; i++) {
        const x0 = -half + i * step;
        const z0 = -half + j * step;
        const h00 = this.heights[j * GRID_N + i];
        const h10 = this.heights[j * GRID_N + i + 1];
        const h01 = this.heights[(j + 1) * GRID_N + i];
        const h11 = this.heights[(j + 1) * GRID_N + i + 1];
        const h = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.max(
          Math.abs(h10 - h00), Math.abs(h01 - h00),
          Math.abs(h11 - h10), Math.abs(h11 - h01),
        ) / step;
        const cx = x0 + step / 2;
        const cz = z0 + step / 2;
        this.quads.push({
          pts: [[x0, h00, z0], [x0 + step, h10, z0], [x0 + step, h11, z0 + step], [x0, h01, z0 + step]],
          cx, cz, h,
          colour: terrainColour(h, slope),
        });
      }
    }
  }

  // Chase camera: behind and above the plane, looking ahead of it, banking
  // gently with the plane so the view never fights the pilot. In screenshot
  // mode the camera snaps to its ideal spot on the first frame, so the
  // captured frame never depends on how many frames ran before it.
  updateCamera(plane, dt) {
    const { fwd } = plane.basis();
    const want = [
      plane.x - fwd[0] * 26,
      plane.y - fwd[1] * 26 + 7.5,
      plane.z - fwd[2] * 26,
    ];
    const ground = heightAt(want[0], want[2]) + 4;
    if (want[1] < ground) want[1] = ground;
    if (this.snap) {
      this.camPos = [want[0], want[1], want[2]];
      this.snap = false;
    }
    const k = Math.min(1, 5 * dt);
    this.camPos[0] += (want[0] - this.camPos[0]) * k;
    this.camPos[1] += (want[1] - this.camPos[1]) * k;
    this.camPos[2] += (want[2] - this.camPos[2]) * k;

    const target = [
      plane.x + fwd[0] * 42,
      plane.y + fwd[1] * 42 + 1,
      plane.z + fwd[2] * 42,
    ];
    let f = [
      target[0] - this.camPos[0],
      target[1] - this.camPos[1],
      target[2] - this.camPos[2],
    ];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    // Right = forward crossed with world-up: (-fz, 0, fx), normalised.
    let r = [-f[2], 0, f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r = [r[0] / rl, r[1] / rl, r[2] / rl];
    let u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    // Roll the camera with the plane: the plane's positive roll is a right
    // bank, so the camera rotates the opposite way in its own basis.
    const roll = -plane.roll * 0.45;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr];
    const u2 = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];
    this.camFwd = f;
    this.camRight = r2;
    this.camUp = u2;
    this.focal = (this.canvas.height / 2) / Math.tan((62 * Math.PI / 180) / 2);
  }

  project(p) {
    const dx = p[0] - this.camPos[0];
    const dy = p[1] - this.camPos[1];
    const dz = p[2] - this.camPos[2];
    const x = dx * this.camRight[0] + dy * this.camRight[1] + dz * this.camRight[2];
    const y = dx * this.camUp[0] + dy * this.camUp[1] + dz * this.camUp[2];
    const z = dx * this.camFwd[0] + dy * this.camFwd[1] + dz * this.camFwd[2];
    if (z < 2) return null;
    const w = this.canvas.width;
    const h = this.canvas.height;
    return [w / 2 + (x / z) * this.focal, h / 2 - (y / z) * this.focal, z];
  }

  drawSky(plane) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // The horizon tilts with the plane's roll and sits with its pitch.
    const horizonY = h * 0.52 - plane.pitch * this.focal * 0.9;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2f7fd0');
    sky.addColorStop(0.45, '#7db8e8');
    sky.addColorStop(0.62, '#cfe8f7');
    sky.addColorStop(0.63, '#e8f2f0');
    sky.addColorStop(1, '#5d7d5a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun, low in the west, with a soft glow.
    const sunDir = [-0.62, 0.34, -0.42];
    const sunFar = [
      this.camPos[0] + sunDir[0] * 6000,
      this.camPos[1] + sunDir[1] * 6000,
      this.camPos[2] + sunDir[2] * 6000,
    ];
    const s = this.project(sunFar);
    if (s) {
      const glow = ctx.createRadialGradient(s[0], s[1], 4, s[0], s[1], 130);
      glow.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 232, 150, 0.55)');
      glow.addColorStop(1, 'rgba(255, 232, 150, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s[0], s[1], 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8d8';
      ctx.beginPath();
      ctx.arc(s[0], s[1], 26, 0, Math.PI * 2);
      ctx.fill();
    }
    this.horizonY = horizonY;
  }

  drawClouds(dt) {
    const ctx = this.ctx;
    this.time += dt;
    for (const cloud of this.clouds) {
      const cx = cloud.x + this.time * cloud.drift;
      const wrappedX = ((cx + 3200) % 6400 + 6400) % 6400 - 3200;
      const p = this.project([wrappedX, cloud.y, cloud.z]);
      if (!p || p[2] > 4200) continue;
      const scale = this.focal / p[2];
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      for (const puff of cloud.puffs) {
        const px = p[0] + puff.dx * scale;
        const py = p[1] - puff.dy * scale;
        const pr = Math.max(2, puff.r * scale);
        ctx.beginPath();
        ctx.ellipse(px, py, pr * 1.6, pr * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTerrain() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cam = this.camPos;
    const fwd = this.camFwd;
    // Painter's order: far quads first. Depth is the distance along the
    // camera forward axis; quads behind or beyond view distance are skipped.
    const visible = [];
    for (let i = 0; i < this.quads.length; i++) {
      const q = this.quads[i];
      const dx = q.cx - cam[0];
      const dy = q.h - cam[1];
      const dz = q.cz - cam[2];
      const depth = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
      if (depth < 8 || depth > VIEW_DIST) continue;
      visible.push([depth, i]);
    }
    visible.sort((a, b) => b[0] - a[0]);
    for (const entry of visible) {
      const q = this.quads[entry[1]];
      const s0 = this.project(q.pts[0]);
      if (!s0) continue;
      const s1 = this.project(q.pts[1]);
      const s2 = this.project(q.pts[2]);
      const s3 = this.project(q.pts[3]);
      if (!s1 || !s2 || !s3) continue;
      if (Math.max(s0[0], s1[0], s2[0], s3[0]) < -40) continue;
      if (Math.min(s0[0], s1[0], s2[0], s3[0]) > w + 40) continue;
      if (Math.max(s0[1], s1[1], s2[1], s3[1]) < -40) continue;
      if (Math.min(s0[1], s1[1], s2[1], s3[1]) > h + 40) continue;
      // Distance haze: far quads fade toward the sky colour.
      const haze = smoothstep(1400, VIEW_DIST, entry[0]) * 0.55;
      ctx.fillStyle = haze > 0.01
        ? shade([
          lerp(q.colour[0], 178, haze),
          lerp(q.colour[1], 205, haze),
          lerp(q.colour[2], 228, haze),
        ], 1)
        : 'rgb(' + q.colour[0] + ',' + q.colour[1] + ',' + q.colour[2] + ')';
      ctx.beginPath();
      ctx.moveTo(s0[0], s0[1]);
      ctx.lineTo(s1[0], s1[1]);
      ctx.lineTo(s2[0], s2[1]);
      ctx.lineTo(s3[0], s3[1]);
      ctx.closePath();
      ctx.fill();
      // A hairline stroke in the same colour hides the seam between
      // neighbouring quads, so the sea and fields read as one surface.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawRunwayAndBuildings() {
    const ctx = this.ctx;
    const hw = RUNWAY.width / 2;
    const hl = RUNWAY.length / 2;
    const z0 = RUNWAY.z - hl;
    const z1 = RUNWAY.z + hl;
    const gy = 2.6;
    const corners = [
      [RUNWAY.x - hw, gy, z0], [RUNWAY.x + hw, gy, z0],
      [RUNWAY.x + hw, gy, z1], [RUNWAY.x - hw, gy, z1],
    ];
    const sp = corners.map((c) => this.project(c));
    if (sp.every(Boolean)) {
      ctx.fillStyle = '#3a3f45';
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      ctx.lineTo(sp[1][0], sp[1][1]);
      ctx.lineTo(sp[2][0], sp[2][1]);
      ctx.lineTo(sp[3][0], sp[3][1]);
      ctx.closePath();
      ctx.fill();
      // Centreline dashes.
      ctx.fillStyle = '#f2f2ea';
      for (let dz = -260; dz <= 260; dz += 60) {
        const a = this.project([RUNWAY.x - 1.2, gy + 0.15, RUNWAY.z + dz]);
        const b = this.project([RUNWAY.x + 1.2, gy + 0.15, RUNWAY.z + dz]);
        const c = this.project([RUNWAY.x + 1.2, gy + 0.15, RUNWAY.z + dz + 26]);
        const d = this.project([RUNWAY.x - 1.2, gy + 0.15, RUNWAY.z + dz + 26]);
        if (a && b && c && d) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.lineTo(c[0], c[1]);
          ctx.lineTo(d[0], d[1]);
          ctx.closePath();
          ctx.fill();
        }
      }
      // Threshold bars at both ends.
      for (const tz of [z0 + 14, z1 - 14]) {
        const a = this.project([RUNWAY.x - hw + 4, gy + 0.15, tz]);
        const b = this.project([RUNWAY.x + hw - 4, gy + 0.15, tz]);
        const c = this.project([RUNWAY.x + hw - 4, gy + 0.15, tz + 6]);
        const d = this.project([RUNWAY.x - hw + 4, gy + 0.15, tz + 6]);
        if (a && b && c && d) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.lineTo(c[0], c[1]);
          ctx.lineTo(d[0], d[1]);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Airfield buildings: simple shaded boxes.
    for (const b of AIRFIELD_BUILDINGS) {
      const gy2 = heightAt(b.x, b.z);
      const base = [
        [b.x - b.w / 2, gy2, b.z - b.d / 2], [b.x + b.w / 2, gy2, b.z - b.d / 2],
        [b.x + b.w / 2, gy2, b.z + b.d / 2], [b.x - b.w / 2, gy2, b.z + b.d / 2],
      ];
      const top = base.map((p) => [p[0], gy2 + b.h, p[2]]);
      const sb = base.map((p) => this.project(p));
      const st = top.map((p) => this.project(p));
      if (sb.some((p) => !p) || st.some((p) => !p)) continue;
      ctx.fillStyle = '#8d97a3';
      ctx.beginPath();
      ctx.moveTo(st[0][0], st[0][1]);
      ctx.lineTo(st[1][0], st[1][1]);
      ctx.lineTo(st[2][0], st[2][1]);
      ctx.lineTo(st[3][0], st[3][1]);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = b.colour;
      ctx.beginPath();
      ctx.moveTo(st[2][0], st[2][1]);
      ctx.lineTo(st[3][0], st[3][1]);
      ctx.lineTo(sb[3][0], sb[3][1]);
      ctx.lineTo(sb[2][0], sb[2][1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRings(nextRing) {
    const ctx = this.ctx;
    for (let i = 0; i < RINGS.length; i++) {
      const ring = RINGS[i];
      const isNext = i === nextRing;
      const isDone = i < nextRing;
      if (isDone) continue;
      const c = this.project([ring.x, ring.y, ring.z]);
      if (!c) continue;
      const r = (ring.radius * this.focal) / c[2];
      if (r < 2 || r > 900) continue;
      // A faint guide line from the ring down to the ground.
      const g = this.project([ring.x, heightAt(ring.x, ring.z) + 1, ring.z]);
      if (g) {
        ctx.strokeStyle = isNext ? 'rgba(255, 200, 60, 0.35)' : 'rgba(120, 220, 255, 0.18)';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.lineTo(g[0], g[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // The ring itself: glowing double circle with chevrons.
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.strokeStyle = isNext ? '#ffcf3d' : 'rgba(110, 220, 255, 0.85)';
      ctx.shadowColor = isNext ? '#ffae00' : '#38b6ff';
      ctx.shadowBlur = isNext ? 26 : 12;
      ctx.beginPath();
      ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = isNext ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(c[0], c[1], r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      if (isNext) {
        ctx.fillStyle = '#ffcf3d';
        ctx.font = 'bold ' + Math.max(13, r * 0.28) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', c[0], c[1] - r - 12);
      }
    }
  }

  // The plane, built from flat shaded polygons in its own local frame:
  // x right, y up, z forward. The chase camera sits behind it, so it is
  // always in frame with the world ahead.
  drawPlane(plane) {
    const ctx = this.ctx;
    const { fwd, right, up } = plane.basis();
    const toWorld = (p) => [
      plane.x + right[0] * p[0] + up[0] * p[1] + fwd[0] * p[2],
      plane.y + right[1] * p[0] + up[1] * p[1] + fwd[1] * p[2],
      plane.z + right[2] * p[0] + up[2] * p[1] + fwd[2] * p[2],
    ];
    const poly = (pts, colour) => {
      const sp = pts.map((p) => this.project(toWorld(p)));
      if (sp.some((p) => !p)) return;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    const white = '#f4f6f8';
    const red = '#d63a2f';
    const dark = '#22303c';
    // Fuselage: top, left and right flanks, tapering to the tail.
    poly([[-0.85, 0.55, 6.8], [0.85, 0.55, 6.8], [0.6, 0.7, -5.8], [-0.6, 0.7, -5.8]], white);
    poly([[-0.85, 0.55, 6.8], [-0.6, 0.7, -5.8], [-0.55, -0.35, -5.8], [-0.8, -0.5, 6.8]], '#dfe6ea');
    poly([[0.85, 0.55, 6.8], [0.8, -0.5, 6.8], [0.55, -0.35, -5.8], [0.6, 0.7, -5.8]], '#e8edef');
    poly([[-0.8, -0.5, 6.8], [0.8, -0.5, 6.8], [0.55, -0.35, -5.8], [-0.55, -0.35, -5.8]], '#c9d2d8');
    // Red cheatline along the fuselage.
    poly([[-0.86, 0.28, 6.6], [-0.62, 0.32, -5.6], [-0.62, 0.05, -5.6], [-0.86, 0.02, 6.6]], red);
    poly([[0.86, 0.28, 6.6], [0.86, 0.02, 6.6], [0.62, 0.05, -5.6], [0.62, 0.32, -5.6]], red);
    // Canopy: dark glass over the cockpit.
    poly([[-0.62, 0.62, 3.4], [0.62, 0.62, 3.4], [0.5, 0.95, 0.4], [-0.5, 0.95, 0.4]], '#16283a');
    poly([[-0.62, 0.62, 3.4], [-0.5, 0.95, 0.4], [-0.5, 0.95, 0.4], [-0.62, 0.62, 3.4]], '#1d3a52');
    // Main wings, with red tips.
    poly([[-8.2, 0.28, 1.4], [-0.9, 0.42, 1.6], [-0.9, 0.42, -0.6], [-8.2, 0.28, -0.4]], white);
    poly([[0.9, 0.42, 1.6], [8.2, 0.28, 1.4], [8.2, 0.28, -0.4], [0.9, 0.42, -0.6]], white);
    poly([[-8.2, 0.28, 1.4], [-6.4, 0.3, 1.35], [-6.4, 0.3, -0.35], [-8.2, 0.28, -0.4]], red);
    poly([[6.4, 0.3, 1.35], [8.2, 0.28, 1.4], [8.2, 0.28, -0.4], [6.4, 0.3, -0.35]], red);
    // Tailplane and fin.
    poly([[-2.7, 0.55, -4.6], [-0.6, 0.62, -4.4], [-0.6, 0.62, -5.8], [-2.7, 0.55, -5.6]], white);
    poly([[0.6, 0.62, -4.4], [2.7, 0.55, -4.6], [2.7, 0.55, -5.6], [0.6, 0.62, -5.8]], white);
    poly([[-0.08, 0.6, -4.2], [0.08, 0.6, -4.2], [0.08, 2.3, -5.7], [-0.08, 2.3, -5.7]], red);
    // Landing gear when down.
    if (plane.gear) {
      poly([[-0.7, -0.5, 2.6], [-0.55, -0.5, 2.6], [-0.55, -1.7, 2.6], [-0.7, -1.7, 2.6]], dark);
      poly([[0.55, -0.5, 2.6], [0.7, -0.5, 2.6], [0.7, -1.7, 2.6], [0.55, -1.7, 2.6]], dark);
      poly([[-0.7, -0.5, -3.4], [-0.55, -0.5, -3.4], [-0.55, -1.5, -3.4], [-0.7, -1.5, -3.4]], dark);
    }
    // Propeller: a translucent spinning disc at the nose.
    const propC = this.project(toWorld([0, 0.1, 7.0]));
    if (propC) {
      const pr = (2.6 * this.focal) / propC[2];
      const a = plane.propAngle;
      ctx.save();
      ctx.translate(propC[0], propC[1]);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(40, 50, 60, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 0.16, pr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#2b3640';
      ctx.beginPath();
      ctx.arc(propC[0], propC[1], Math.max(2, pr * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    // Navigation lights: red left, green right, blinking with time.
    if (Math.floor(this.time * 2) % 2 === 0) {
      for (const [lx, colour] of [[-8.2, '#ff3b30'], [8.2, '#35e08a']]) {
        const lp = this.project(toWorld([lx, 0.3, 0.8]));
        if (lp) {
          ctx.fillStyle = colour;
          ctx.shadowColor = colour;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(lp[0], lp[1], 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  render(plane, nextRing, dt) {
    this.updateCamera(plane, dt);
    this.drawSky(plane);
    this.drawClouds(dt);
    this.drawTerrain();
    this.drawRunwayAndBuildings();
    this.drawRings(nextRing);
    this.drawPlane(plane);
  }
}

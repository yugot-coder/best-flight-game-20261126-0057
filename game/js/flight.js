// flight.js — the flight model: an arcade plane with throttle, bank, pitch,
// flaps and gear. It is forgiving enough to be fun and strict enough that
// throttle and turn discipline matter: overspeed in a dive, stall slow, and
// a landing only counts with gear down, flaps out and a gentle descent.

import { angleDiff, clamp, lerp } from './util.js';
import { heightAt } from './terrain.js';

export const MAX_SPEED = 96; // m/s, about 187 kt
export const STALL_SPEED = 26; // m/s, below this the wing stops flying
export const CRUISE_SPEED = 62;

export class Plane {
  constructor() {
    this.reset();
  }

  reset() {
    // Parked on the runway threshold, facing north down the strip: 550 m
    // of asphalt ahead, so a full-throttle takeoff roll stays on the
    // runway until the wheels leave the ground.
    this.x = 0;
    this.y = 3.2;
    this.z = 1850;
    this.heading = Math.PI; // forward = (sin, 0, cos) -> (0, 0, -1): north
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.flaps = false;
    this.gear = true;
    this.fuel = 100;
    this.engineOn = true;
    this.verticalSpeed = 0;
    this.groundSpeed = 0;
    this.onGround = true;
    this.propAngle = 0;
  }

  // Unit vectors of the plane's own frame.
  basis() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const ch = Math.cos(this.heading);
    const sh = Math.sin(this.heading);
    // Forward after yaw then pitch.
    const fwd = [sh * cp, sp, ch * cp];
    const right0 = [ch, 0, -sh];
    const up1 = [-sh * sp, cp, -ch * sp];
    // Roll: positive roll banks RIGHT, so the up vector tilts toward +right.
    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);
    const right = [
      right0[0] * cr - up1[0] * sr,
      right0[1] * cr - up1[1] * sr,
      right0[2] * cr - up1[2] * sr,
    ];
    const up = [
      up1[0] * cr + right0[0] * sr,
      up1[1] * cr + right0[1] * sr,
      up1[2] * cr + right0[2] * sr,
    ];
    return { fwd, right, up };
  }

  // input: { pitch: -1..1 (pull up positive), roll: -1..1, throttle: -1..1 }
  update(dt, input) {
    const prevY = this.y;

    // Throttle: W/S keys or the mouse wheel; eases toward its target.
    const targetThrottle = clamp(this.throttle + input.throttle * dt * 0.9, 0, 1);
    this.throttle = targetThrottle;
    if (this.fuel <= 0) this.engineOn = false;

    // Speed chases the throttle setting; flaps add drag, dives add speed.
    const top = MAX_SPEED * (this.flaps ? 0.72 : 1);
    const targetSpeed = this.engineOn ? this.throttle * top : 0;
    const diveBonus = Math.max(0, -Math.sin(this.pitch)) * 26;
    this.speed += ((targetSpeed + diveBonus - this.speed) * 0.55) * dt;
    this.speed = clamp(this.speed, 0, MAX_SPEED + 30);

    // Pitch: elevator authority grows with airspeed; a strong elevator lets
    // the pilot pull out of a dive quickly, which matters near terrain.
    // The nose drops by itself when slow, so a stall is something you feel.
    const authority = clamp(this.speed / 45, 0.25, 1);
    this.pitch += input.pitch * 1.3 * authority * dt;
    const stallDrop = this.speed < STALL_SPEED ? (STALL_SPEED - this.speed) * 0.012 : 0;
    this.pitch -= stallDrop * dt;
    this.pitch = clamp(this.pitch, -0.62, 0.5);

    // Roll: bank toward the stick, then ease back toward level flight.
    const targetRoll = input.roll * 1.05;
    this.roll += (targetRoll - this.roll) * Math.min(1, 3.2 * dt);
    // A banked wing turns the plane: positive roll banks right and turns
    // right, so the heading grows with the bank.
    this.heading += Math.sin(this.roll) * clamp(this.speed / 55, 0, 1.6) * 0.85 * dt;

    // Fly forward along the nose; slow flight sinks.
    const { fwd } = this.basis();
    let vx = fwd[0] * this.speed;
    let vy = fwd[1] * this.speed;
    let vz = fwd[2] * this.speed;
    if (this.speed < STALL_SPEED) {
      vy -= (STALL_SPEED - this.speed) * 0.55;
    }
    this.x += vx * dt;
    this.y += vy * dt;
    this.z += vz * dt;
    this.verticalSpeed = (this.y - prevY) / Math.max(dt, 0.001);
    this.groundSpeed = Math.hypot(vx, vz);

    // Fuel: thirsty at full throttle, sipping at idle.
    if (this.engineOn && this.speed > 1) {
      this.fuel = Math.max(0, this.fuel - (0.22 + this.throttle * 0.5) * dt);
    }

    // Ground contact.
    const ground = heightAt(this.x, this.z);
    this.onGround = this.y <= ground + 1.6;
    if (this.onGround) {
      this.y = ground + 1.6;
      // Rolling drag: gentle under power so the engine can accelerate the
      // plane for takeoff, strong at idle so a landing rollout stops.
      const drag = this.throttle > 0.05 ? 4 : 22;
      this.speed = Math.max(0, this.speed - drag * dt);
      this.pitch = lerp(this.pitch, 0, Math.min(1, 4 * dt));
      this.roll = lerp(this.roll, 0, Math.min(1, 4 * dt));
    }
    this.groundHeight = ground;
    this.propAngle += (this.engineOn ? 14 + this.throttle * 26 : 0.5) * dt;
  }

  // True if the plane is in a state that counts as a safe landing here.
  landingQuality() {
    const descent = -this.verticalSpeed;
    if (!this.onGround) return null;
    if (!this.gear) return { ok: false, why: 'gear up' };
    if (this.speed > 52) return { ok: false, why: 'too fast' };
    if (descent > 7) return { ok: false, why: 'too hard' };
    if (Math.abs(angleDiff(this.heading, Math.PI)) > 0.35) return { ok: false, why: 'not aligned' };
    return { ok: true, why: 'smooth touchdown' };
  }
}

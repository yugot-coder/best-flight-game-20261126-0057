// game.js — the game itself: state machine, keyboard + mouse input, the
// ring mission, scoring, crashes and landings, and the fixed screenshot
// poses (?shot=1..4) that freeze a good-looking frame for the dossier.
//
// Flow: menu -> flying (8 rings in order, then land on the runway) ->
// complete, or crashed at any point. R restarts, P / Esc pauses.

import { clamp } from './util.js';
import { Plane, STALL_SPEED } from './flight.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { RINGS, RUNWAY, heightAt } from './terrain.js';

export const RING_POINTS = 100;
export const LANDING_POINTS = 500;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.plane = new Plane();
    this.renderer = new Renderer(canvas);
    this.hud = new Hud(canvas);
    this.audio = new AudioEngine();
    this.state = 'menu';
    this.score = 0;
    this.elapsed = 0;
    this.nextRing = 0;
    this.message = '';
    this.messageSub = '';
    this.messageUntil = 0;
    this.endReason = '';
    this.endScore = 0;
    this.refuelled = false;
    this.warnedFuel = false;
    this.keys = {};
    this.mouse = { x: 0, y: 0, active: false };
    this.shotMode = null;
    this.frozen = false;
    this.lastTime = 0;
    this.resize();
    this.bindInput();
    this.parseShot();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  parseShot() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return;
    this.shotMode = Number(shot) || 1;
    this.state = 'flying';
    this.frozen = false;
    const p = this.plane;
    if (this.shotMode === 1) {
      // Mid-course: high over the central ridge, chasing the second ring.
      p.x = 200; p.y = 380; p.z = 1000;
      p.heading = Math.PI + 0.81; p.pitch = -0.03; p.roll = -0.15;
      p.speed = 70; p.throttle = 0.72; p.gear = false; p.fuel = 82;
      this.nextRing = 1; this.score = 100; this.elapsed = 41;
    } else if (this.shotMode === 2) {
      // Low pass toward ring 7, hills and sea on either side.
      p.x = 1560; p.y = 210; p.z = 1150;
      p.heading = Math.PI + 0.7; p.pitch = 0.02; p.roll = 0.18;
      p.speed = 76; p.throttle = 0.78; p.gear = false; p.fuel = 64;
      this.nextRing = 6; this.score = 600; this.elapsed = 150;
    } else if (this.shotMode === 3) {
      // Final approach: runway centred ahead, gear down, flaps out.
      p.x = 12; p.y = 46; p.z = 2380;
      p.heading = Math.PI; p.pitch = -0.06; p.roll = 0.02;
      p.speed = 44; p.throttle = 0.34; p.gear = true; p.flaps = true; p.fuel = 38;
      this.nextRing = 8; this.score = 800; this.elapsed = 214;
    } else {
      // High over the island: the whole course, sea and peaks in view,
      // heading for ring 7 so it sits in frame ahead.
      p.x = 1500; p.y = 420; p.z = 1900;
      p.heading = Math.PI + 0.27; p.pitch = -0.1; p.roll = -0.2;
      p.speed = 80; p.throttle = 0.8; p.gear = false; p.fuel = 71;
      this.nextRing = 6; this.score = 600; this.elapsed = 168;
    }
    this.message = this.nextRing < 8 ? 'RING ' + (this.nextRing + 1) + ' OF 8' : 'FINAL APPROACH — LAND ON THE RUNWAY';
    this.messageSub = this.nextRing < 8 ? 'Fly through the gold ring' : 'Gear down, flaps out, gentle descent';
    this.messageUntil = Infinity;
    // Snap the chase camera to its ideal spot at once: the frozen frame
    // must not depend on how many frames the browser ran before the shot.
    this.renderer.snap = true;
    // Settle the chase camera for a few frames, then freeze the frame.
    this.shotSettle = 0;
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Enter' && this.state === 'menu') this.startFlight();
      if ((e.key === 'r' || e.key === 'R') && (this.state === 'crashed' || this.state === 'complete' || this.state === 'landed')) this.restart();
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && this.state === 'flying') this.state = 'paused';
      else if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && this.state === 'paused') this.state = 'flying';
      if ((e.key === 'g' || e.key === 'G') && this.state === 'flying') this.plane.gear = !this.plane.gear;
      if ((e.key === 'f' || e.key === 'F') && this.state === 'flying') this.plane.flaps = !this.plane.flaps;
      if (e.key === 'm' || e.key === 'M') this.audio.muted = !this.audio.muted;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX / this.w - 0.5;
      this.mouse.y = e.clientY / this.h - 0.5;
      this.mouse.active = true;
    });
    window.addEventListener('mousedown', () => {
      this.audio.start();
      if (this.state === 'menu') this.startFlight();
    });
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'flying') return;
      this.plane.throttle = clamp(this.plane.throttle - Math.sign(e.deltaY) * 0.06, 0, 1);
    }, { passive: true });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'flying') this.state = 'paused';
    });
  }

  startFlight() {
    this.audio.start();
    this.state = 'flying';
    this.showMessage('TAKE OFF — FULL THROTTLE, THEN PULL UP', 'Fly through the rings in order, then land on the runway', 6);
  }

  restart() {
    this.plane = new Plane();
    this.score = 0;
    this.elapsed = 0;
    this.nextRing = 0;
    this.endReason = '';
    this.refuelled = false;
    this.warnedFuel = false;
    this.state = 'flying';
    this.showMessage('TAKE OFF — FULL THROTTLE, THEN PULL UP', 'Fly through the rings in order, then land on the runway', 6);
  }

  showMessage(text, sub, seconds) {
    this.message = text;
    this.messageSub = sub || '';
    this.messageUntil = this.elapsed + (seconds || 4);
  }

  readInput() {
    const k = this.keys;
    let pitch = 0;
    let roll = 0;
    if (k['arrowup']) pitch += 1;
    if (k['arrowdown']) pitch -= 1;
    if (k['arrowleft']) roll -= 1;
    if (k['arrowright']) roll += 1;
    if (k['a']) roll -= 1;
    if (k['d']) roll += 1;
    // Mouse steers like a stick when no arrow key is held.
    if (this.mouse.active && pitch === 0 && roll === 0) {
      roll = clamp(this.mouse.x * 2.4, -1, 1);
      pitch = clamp(-this.mouse.y * 2.2, -1, 1);
    }
    let throttle = 0;
    if (k['w']) throttle += 1;
    if (k['s']) throttle -= 1;
    return { pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), throttle };
  }

  checkRings() {
    if (this.nextRing >= RINGS.length) return;
    const ring = RINGS[this.nextRing];
    const p = this.plane;
    const dx = p.x - ring.x;
    const dy = p.y - ring.y;
    const dz = p.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ring.radius + 6) {
      this.nextRing++;
      const timeBonus = Math.max(0, 60 - Math.floor(this.elapsed));
      const gained = RING_POINTS + Math.floor(timeBonus / 2);
      this.score += gained;
      this.audio.ring();
      if (this.nextRing >= RINGS.length) {
        this.showMessage('ALL RINGS CLEAR — LAND ON THE RUNWAY', 'Gear down (G), flaps out (F), slow and gentle', 8);
      } else {
        this.showMessage('RING ' + this.nextRing + ' CLEAR  +' + gained, 'Next ring is gold — follow the guide line', 3);
      }
    }
  }

  checkGround() {
    const p = this.plane;
    if (!p.onGround) return;
    const ground = heightAt(p.x, p.z);
    const onRunway = Math.abs(p.x - RUNWAY.x) < RUNWAY.width / 2 + 6
      && Math.abs(p.z - RUNWAY.z) < RUNWAY.length / 2 + 6
      && ground < 5;
    if (onRunway) {
      if (this.nextRing < RINGS.length) {
        // Landed early: allowed, but the mission is not done — refuel and go.
        if (p.speed < 5 && !this.refuelled) {
          this.refuelled = true;
          p.fuel = 100;
          p.engineOn = true;
          this.showMessage('REFUELLED ON THE RUNWAY', 'Full throttle and take off again', 5);
        }
        return;
      }
      const quality = p.landingQuality();
      if (quality && quality.ok && p.speed < 30) {
        this.finishLanding();
      } else if (quality && !quality.ok && p.speed > 20) {
        this.crash('Landing failed: ' + quality.why);
      }
      return;
    }
    // Any other ground contact is a crash, unless barely moving on the beach.
    if (p.speed > 12 || p.y - ground > 2.2) {
      this.crash(p.y <= 0.6 ? 'Ditched in the sea' : 'Crashed into the terrain');
    }
  }

  crash(reason) {
    if (this.state !== 'flying') return;
    this.state = 'crashed';
    this.endReason = reason;
    this.endScore = this.score;
    this.audio.crash();
  }

  finishLanding() {
    this.state = 'complete';
    const fuelBonus = Math.round(this.plane.fuel * 2);
    const timeBonus = Math.max(0, 600 - Math.floor(this.elapsed)) * 2;
    this.score += LANDING_POINTS + fuelBonus + timeBonus;
    this.endScore = this.score;
    this.endReason = 'Landed safely — landing +' + LANDING_POINTS
      + ', fuel bonus +' + fuelBonus + ', time bonus +' + timeBonus;
    this.audio.land();
  }

  update(dt) {
    if (this.state !== 'flying' || this.frozen) return;
    this.elapsed += dt;
    const input = this.readInput();
    this.plane.update(dt, input);
    this.audio.setFlight(this.plane.throttle, this.plane.speed, this.plane.engineOn && this.plane.speed > 1);
    if (this.elapsed > this.messageUntil) {
      this.message = '';
      this.messageSub = '';
    }
    this.checkRings();
    this.checkGround();
    // Out of the world: turn back with a warning instead of flying forever.
    if (Math.hypot(this.plane.x, this.plane.z) > 4200) {
      this.showMessage('TURN BACK — YOU ARE LEAVING THE ISLAND', 'The course is over the island', 3);
    }
    // Fuel warnings.
    if (this.plane.fuel < 20 && this.plane.fuel > 0 && !this.warnedFuel) {
      this.warnedFuel = true;
      this.audio.warning();
    }
    if (this.plane.fuel <= 0) this.warnedFuel = false;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.renderer.render(this.plane, this.nextRing, 1 / 60);
    if (this.state === 'menu') {
      this.hud.drawScreen(
        'SKYLINE ISLAND RUN',
        [
          'Fly the red-and-white Islander over a living island: sea, beaches,',
          'forested hills and snow peaks. Thread all 8 rings, then bring her',
          'home onto the runway — gear down, flaps out, gentle as you like.',
          '',
          'W / S or wheel — throttle      Arrows or mouse — pitch & bank',
          'G — landing gear      F — flaps      P — pause      M — mute',
          'Fuel burns with throttle. A stall drops the nose. Mind the mountains.',
        ],
        'Click or press Enter to fly',
      );
      return;
    }
    this.hud.draw(this.plane, this);
    if (this.state === 'paused') {
      this.hud.drawScreen('PAUSED', ['The Islander waits on the wind.'], 'Press P or Esc to keep flying');
    } else if (this.state === 'crashed') {
      this.hud.drawScreen(
        'CRASHED',
        [this.endReason, '', 'Score ' + this.endScore + '   •   Rings ' + this.nextRing + ' / 8   •   Time ' + this.formatTime()],
        'Press R to fly again',
      );
    } else if (this.state === 'complete') {
      this.hud.drawScreen(
        'MISSION COMPLETE',
        [this.endReason, '', 'Final score ' + this.endScore + '   •   Time ' + this.formatTime()],
        'Press R to fly it again, faster',
      );
    }
  }

  formatTime() {
    const m = Math.floor(this.elapsed / 60);
    const s = Math.floor(this.elapsed % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    if (this.shotMode) {
      // Screenshot pose: run a short fixed settle, then freeze the frame
      // so the capture is stable and identical every time.
      if (this.shotSettle < 40) {
        this.update(1 / 60);
        this.shotSettle++;
      } else {
        this.frozen = true;
      }
    } else {
      this.update(dt);
    }
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  start() {
    requestAnimationFrame((t) => {
      this.lastTime = t;
      this.frame(t);
    });
  }
}

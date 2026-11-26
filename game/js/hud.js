// hud.js — the lit instruments and screens, drawn on the same canvas over
// the 3D view: compass tape, airspeed, altitude, attitude indicator,
// throttle, fuel, score, timer and the menu / pause / end screens.

import { clamp, formatClock, pad3 } from './util.js';

function compassLabel(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // Heading in degrees, 0 = north (-Z), clockwise.
  headingDeg(plane) {
    let deg = (-plane.heading * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  drawCompass(plane) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const deg = this.headingDeg(plane);
    const cx = w / 2;
    const y = 34;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
    ctx.beginPath();
    ctx.roundRect(cx - 210, 8, 420, 52, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Ticks every 15 degrees across a 120-degree window.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let off = -60; off <= 60; off += 5) {
      const d = Math.round(((deg + off) % 360 + 360) % 360);
      const x = cx + (off / 60) * 165;
      const major = d % 30 === 0;
      ctx.strokeStyle = major ? '#cfeeff' : 'rgba(207, 238, 255, 0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y - (major ? 12 : 7));
      ctx.lineTo(x, y + (major ? 12 : 7));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#eaf7ff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(d % 90 === 0 ? compassLabel(d) : String(d).padStart(3, '0'), x, y + 22);
      }
    }
    // Centre caret + digital readout at the panel's right end, clear of
    // the message box below the compass.
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(cx, y - 20);
    ctx.lineTo(cx - 7, y - 30);
    ctx.lineTo(cx + 7, y - 30);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(pad3(deg) + '°', cx + 202, y);
    ctx.textAlign = 'center';
    ctx.restore();
  }

  drawSpeedAlt(plane) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const knots = Math.round(plane.speed * 1.944);
    const feet = Math.round(plane.y * 3.281);
    const panel = (x, label, value, unit, sub) => {
      ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
      ctx.beginPath();
      ctx.roundRect(x, h - 108, 128, 84, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140, 220, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#9fd8ff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 12, h - 88);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(value, x + 12, h - 56);
      ctx.fillStyle = '#9fd8ff';
      ctx.font = '12px sans-serif';
      ctx.fillText(unit, x + 12, h - 36);
      if (sub) {
        ctx.fillStyle = sub.startsWith('-') ? '#ffb3a0' : '#b8f0c0';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(sub, x + 116, h - 36);
        ctx.textAlign = 'left';
      }
    };
    const vsi = plane.verticalSpeed * 196.85; // ft/min
    panel(18, 'AIRSPEED', String(knots), 'KT', plane.onGround ? 'GND' : '');
    panel(w - 146, 'ALTITUDE', String(feet), 'FT', (vsi >= 0 ? '+' : '') + Math.round(vsi) + ' FPM');
  }

  drawAttitude(plane) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h - 92;
    const r = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.roll);
    const pitchPx = clamp(plane.pitch, -0.5, 0.5) * 130;
    ctx.fillStyle = '#3d8fd1';
    ctx.fillRect(-r - 4, -r - 4 - pitchPx, r * 2 + 8, r + 4 + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r - 4, -pitchPx, r * 2 + 8, r + 4 + pitchPx);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, -pitchPx);
    ctx.lineTo(r, -pitchPx);
    ctx.stroke();
    ctx.restore();
    // Fixed wings marker and bezel.
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.lineTo(cx + 26, cy + 4);
    ctx.lineTo(cx + 8, cy + 4);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 8, cy + 4);
    ctx.lineTo(cx - 26, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 14);
  }

  drawBars(plane, game) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Throttle bar, bottom left.
    ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
    ctx.beginPath();
    ctx.roundRect(18, h - 152, 128, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ff9a3d';
    ctx.fillRect(26, h - 140, 112 * clamp(plane.throttle, 0, 1), 10);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THR ' + Math.round(plane.throttle * 100) + '%', 26, h - 122);
    // Fuel bar, bottom right.
    ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
    ctx.beginPath();
    ctx.roundRect(w - 146, h - 152, 128, 34, 8);
    ctx.fill();
    const low = plane.fuel < 20;
    ctx.fillStyle = low ? '#ff5a4a' : '#59d67c';
    ctx.fillRect(w - 138, h - 140, 112 * clamp(plane.fuel / 100, 0, 1), 10);
    ctx.fillStyle = low ? '#ffb3a0' : '#eaf7ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('FUEL ' + Math.round(plane.fuel) + '%', w - 138, h - 122);
    // Score / timer / rings, top left.
    ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
    ctx.beginPath();
    ctx.roundRect(18, 8, 210, 76, 10);
    ctx.fill();
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE  ' + game.score, 30, 32);
    ctx.fillText('TIME  ' + formatClock(game.elapsed), 30, 54);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('RINGS  ' + game.nextRing + ' / 8', 30, 76);
    // Flaps / gear lamps, top right.
    const lamp = (x, label, on, colour) => {
      ctx.fillStyle = on ? colour : 'rgba(120, 140, 155, 0.5)';
      ctx.beginPath();
      ctx.arc(x, 26, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eaf7ff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(label, x + 12, 30);
    };
    ctx.textAlign = 'left';
    lamp(w - 200, 'GEAR', plane.gear, '#59d67c');
    lamp(w - 110, 'FLAPS', plane.flaps, '#59d67c');
    ctx.fillStyle = plane.engineOn ? '#9fd8ff' : '#ff5a4a';
    ctx.fillText(plane.engineOn ? 'ENG ON' : 'ENG OUT', w - 200, 52);
  }

  drawReticle() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2 - 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 13, cy);
    ctx.moveTo(cx + 13, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy - 13);
    ctx.moveTo(cx, cy + 13);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
  }

  drawMessage(text, sub) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8, 20, 32, 0.66)';
    const tw = ctx.measureText(text).width;
    ctx.beginPath();
    ctx.roundRect(w / 2 - tw / 2 - 26, 76, tw + 52, 46, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(text, w / 2, 106);
    if (sub) {
      ctx.fillStyle = '#eaf7ff';
      ctx.font = '14px sans-serif';
      ctx.fillText(sub, w / 2, 126);
    }
  }

  drawWarning(text) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const blink = Math.floor(Date.now() / 350) % 2 === 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = blink ? '#ff5a4a' : '#ffb3a0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(text, w / 2, 150);
  }

  // Full-screen overlay used by menu, pause, crash and mission-complete.
  drawScreen(title, lines, footer) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = 'rgba(6, 16, 28, 0.62)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 52px sans-serif';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 12;
    ctx.fillText(title, w / 2, h / 2 - 110);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, h / 2 - 62 + i * 30);
    });
    if (footer) {
      ctx.fillStyle = '#9fd8ff';
      ctx.font = 'bold 17px sans-serif';
      // Sit below the last instruction line, never on top of it.
      ctx.fillText(footer, w / 2, h / 2 - 62 + lines.length * 30 + 34);
    }
  }

  draw(plane, game) {
    this.drawCompass(plane);
    this.drawSpeedAlt(plane);
    this.drawAttitude(plane);
    this.drawBars(plane, game);
    this.drawReticle();
    if (game.message) this.drawMessage(game.message, game.messageSub);
    if (plane.fuel < 20 && plane.fuel > 0 && game.state === 'flying') {
      this.drawWarning('LOW FUEL — LAND OR GLIDE HOME');
    }
    if (plane.fuel <= 0 && game.state === 'flying') {
      this.drawWarning('FUEL EMPTY — ENGINE OUT, GLIDE TO THE RUNWAY');
    }
    if (plane.speed < 30 && !plane.onGround && game.state === 'flying') {
      this.drawWarning('STALL — PUSH THE NOSE DOWN, ADD THROTTLE');
    }
  }
}

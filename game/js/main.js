// main.js — boot: one canvas, one game, one animation loop. No libraries,
// no network, no build step: this file is the whole entry point.

import { Game } from './game.js';

const canvas = document.getElementById('game');
if (!canvas || !canvas.getContext) {
  const fallback = document.getElementById('fallback');
  if (fallback) fallback.hidden = false;
  throw new Error('Skyline Island Run needs a canvas-capable browser');
}

const game = new Game(canvas);
game.start();

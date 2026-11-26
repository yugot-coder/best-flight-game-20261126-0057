// Skyline Island Run — hand-in program for the best-flight-game bounty.
// Node 22, standard library only: no install, no build step, no network.
//
// The game is this repository's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library and
// no network request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-game.ts, copied from the kit unchanged).
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from the kit's reference/gate.json): only
// text_max_bytes shapes the bytes; the others refuse an entry the scorer
// would refuse (more than 4 screenshots or one over 256 KiB; more than 993
// files in game/ or 48 MiB of game files in all, or a path under game/ over
// 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error('main.ts: ' + message);
}

function checkGameEntry() {
  const indexPath = join(here, 'game', 'index.html');
  if (!existsSync(indexPath)) fail('game/index.html is missing');
  if (statSync(indexPath).size > 1048576) fail('game/index.html is over 1 MiB');
}

function checkScreenshots() {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) fail('screenshots/ is missing');
  const names = readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > 4) {
    fail('screenshots/ must hold 3 or 4 images, found ' + names.length);
  }
  for (const name of names) {
    const size = statSync(join(dir, name)).size;
    if (size > 262144) fail('screenshot ' + name + ' is over 256 KiB');
    if (!/\.(png|jpe?g)$/i.test(name)) fail('screenshot ' + name + ' is not a PNG or JPEG');
  }
  return names;
}

checkGameEntry();
const shotNames = checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_OPTIONS));

// Verify the hand-in landed: the dossier must exist, be non-empty and stay
// under the scorer's 1.5 MiB cap, so a silent short write cannot pass here.
function reportHandin(outDir, shotNames) {
  const dossierPath = join(outDir, 'dossier.json');
  const dossierBytes = statSync(dossierPath).size;
  if (dossierBytes === 0) fail('dossier.json was written empty');
  if (dossierBytes > 1572864) fail('dossier.json is over the 1.5 MiB cap');
  console.log(
    'Skyline Island Run handed in: game/ + ' + shotNames.length
    + ' screenshots (' + shotNames.join(', ') + ') + dossier.json ('
    + dossierBytes + ' bytes) -> ' + outDir,
  );
}

reportHandin(out, shotNames);

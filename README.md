# Skyline Island Run

![Repo size](https://img.shields.io/github/repo-size/yugot-coder/best-flight-game-20261126-0057)
![Last commit](https://img.shields.io/github/last-commit/yugot-coder/best-flight-game-20261126-0057)
![License](https://img.shields.io/github/license/yugot-coder/best-flight-game-20261126-0057)

A complete, original flight game for the
[make.fun best flight game bounty](https://make.fun/?ref=za0zfbxx).
Fly the red-and-white Islander over a living procedural island — sea,
beaches, forested hills and snow peaks — thread all 8 glowing rings, then
bring her home onto the runway: gear down, flaps out, gentle as you like.

## Play

Open `game/index.html` in a desktop browser. No build step, no network,
no assets to download: every pixel is procedural canvas art and every sound
is synthesised WebAudio.

| Control | What it does |
|---|---|
| W / S or mouse wheel | Throttle |
| Arrow keys or mouse | Pitch & bank (the mouse steers like a stick) |
| G | Landing gear |
| F | Flaps |
| P / Esc | Pause |
| M | Mute |
| R | Fly again after a crash or a landing |

## The mission

- **8 rings** in order, gold ring first — each one is worth 100 points plus a time bonus.
- **Fuel** burns with throttle. Run dry and the engine quits; glide home.
- **Stall**: fly slower than ~50 kt and the nose drops by itself.
- **Landing** only counts on the runway, gear down, slow, aligned and gentle. Land early and you refuel and take off again.
- **Crash** into terrain or ditch in the sea and the sortie is over.

## What is inside

- `game/js/terrain.js` — the island heightmap, the airfield, the ring course
- `game/js/flight.js` — the arcade flight model (throttle, bank, pitch, flaps, gear)
- `game/js/render.js` — the chase camera and the whole 3D view on a 2D canvas
- `game/js/hud.js` — lit instruments: compass tape, airspeed, altitude, attitude indicator
- `game/js/audio.js` — engine hum, wind, ring chimes, all synthesised
- `game/js/game.js` — state machine, missions, scoring, screenshot poses
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

## Screenshots

`screenshots/` holds four real renders of the game's own code, taken in
headless Chromium with `?shot=1..4` (mid-course ring chase, low beach pass,
final approach, high over the island).

## License

MIT — see [LICENSE](LICENSE).

# Architecture

The game is one classic (non-module) script inside `index.html`, organized into
sections in source order: constants, `SFX`, `Particle`, terrain helpers,
`LEVELS`, `Lem`, and `Game`. Everything is plain ES2017+; there is no build step.

## Coordinate system & terrain model

- World is `W=1600 × H=400` pixels; the viewport shows `VW=800 × VH=400` and
  scrolls horizontally (`scrollX`).
- Terrain is dual-represented, and the two must be kept in sync:
  - `Game.terrainData` — `Uint8Array(W*H)`, the **collision truth**:
    `0` air, `1` diggable earth, `2` indestructible steel.
  - `terrainCanvas` — offscreen canvas holding the **visual** terrain, blitted
    to the main canvas each frame.
  - `removeTerrain(x,y)` only removes type `1` (steel survives everything) and
    clears the canvas pixel; `addTerrain(x,y,r,g,b)` sets type `1` and paints.
- A lemming's `(x, y)` is its feet. "Standing" means `(x,y)` is air and
  `(x,y+1)` is solid.

## Level format

Each entry in `LEVELS` is declarative:

```js
{ name, total, need, rate, time,           // counts, release rate, seconds
  skills: {abilityIndex: count},            // 0..7 = Climber..Miner
  entrance: {x,y}, exit: {x,y},
  generate(px, td) { ... } }                // px: ImageData RGBA, td: terrainData
```

`generate` paints into a fresh `ImageData` and the collision array using the
terrain helpers (`tFill` earth, `tSteel` steel, `tGrass` decoration, `tNoise`
dithering). Bulk generation goes through ImageData pixel arrays, never
per-pixel `fillRect` (that was a 4fps mistake once — see claudepad).

**Design constraints** (violating these makes levels unwinnable):
- `MAX_FALL=62` — any possible continuous fall, including through dug shafts,
  must stay under 62px or lemmings splat. The standard pattern is 30px-thick
  earth layers with 25px gaps (55px falls).
- Side containment (steel walls) prevents walk-off deaths; steel floors stop
  digging and catch final falls.
- Holes dug at the same x in stacked layers chain into one long fall — stagger
  them.

## Simulation

`Lem` is a dumb state record; all behavior lives in `Game.updateLemming`, a
state machine over `S = {WALK, FALL, CLIMB, FLOAT, BUILD, BASH, DIG, MINE,
BLOCK, SPLAT, EXIT, DEAD}` with one `doXxx` method per state.

Walking uses a footing scan (`STEP_SCAN`): at the next column it looks for an
air-over-solid transition from −6 (step up) to +3 (step down), **nearest the
current height first** — scanning top-down instead would teleport lemmings up
through bridges built overhead. No transition + a tall solid column means turn
around (or start climbing). Larger drops switch to FALL, which accumulates
`fallDist` and splats past `MAX_FALL` on landing.

Each `update()` tick (60/s, 3× in fast mode): decrement timer, maybe release a
lemming (entrance latches shut while `nuking`), arm one nuke bomber, run every
lemming's state, check exit proximity (walkers only), cull out-of-bounds, then
end the level when time runs out or when no active lemmings remain and either
all were released or a nuke is in progress.

## Rendering

`loop()` runs on `requestAnimationFrame` with a 16ms accumulator so game speed
is monitor-independent. Per frame: cached sky canvas → terrain canvas slice →
entrance/exit → procedurally drawn lemming sprites (`drawLemming`, a pile of
`fillRect`s per state) → particles → minimap. The minimap redraws terrain into
a pre-allocated `ImageData` each frame and overlays lemming dots, viewport box,
and entrance/exit markers; clicking it jumps the viewport.

Audio is a tiny WebAudio synth (`SFX.play(type)`) — oscillators and noise
buffers, no samples. `sfx.init()` must be called from a user gesture (browser
autoplay policy), so every input handler calls it.

UI state outside the canvas (header counters, timer, skill counts, button
states) is plain DOM updated by `updateHeader`/`updateSkillUI`. Level unlocks
persist to `localStorage` under `lemmings.unlocked`.

## Tests

`tests/run-tests.mjs` (plain Node, no deps) extracts the script from
`index.html`, evaluates it in a `vm` sandbox with stub `document`/canvas/
`localStorage`/`requestAnimationFrame`, and drives `game.update()` directly —
rendering is stubbed to no-ops, simulation runs for real. Coverage includes a
scripted solve of level 1 (asserting zero splats and all 10 saved), per-skill
physics scenarios on hand-built terrain, steel invulnerability, nuke flow,
timer display, and persistence. Add a test alongside any physics or rules
change; hand-built terrain via the `fill()` helper keeps scenarios
deterministic (level generators sprinkle random grass, so prefer blank
terrain for precise assertions).

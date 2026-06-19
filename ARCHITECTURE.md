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
    clears the canvas pixel; `addTerrain(x,y,r,g,b)` paints diggable earth
    (type `1`) but never over steel — so a builder's bricks lay on top of steel
    without ever turning it diggable.
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

The nuke is instant and irreversible, so the input layer guards it behind a
confirming second press: `requestNuke()` arms (`nukeArmed`) on the first `N`/
button press and only calls the real `startNuke()` on the second; `Esc` or
right-click (`cancelNukeArm()`) disarms a pending nuke. `startNuke()` itself is
unconditional, which keeps it the single point the simulation tests drive.

## Rendering

`loop()` runs on `requestAnimationFrame`; `stepSim(dt)` advances the simulation
in fixed 60 Hz ticks (3× in fast mode) from the real time elapsed, so game speed
is independent of the display's refresh rate — below 60fps it runs multiple
ticks per frame to keep up, and it clamps long gaps (e.g. a backgrounded tab
whose rAF callbacks were suppressed) so it never tries to catch up thousands of
ticks at once. Per frame: cached sky canvas → terrain canvas slice →
entrance/exit → procedurally drawn lemming sprites (`drawLemming`, a pile of
`fillRect`s per state) → particles → minimap. The minimap redraws terrain into
a pre-allocated `ImageData` each frame and overlays lemming dots, viewport box,
and entrance/exit markers; clicking it jumps the viewport. The viewport also
scrolls from the mouse at a screen edge and from held arrow / `A`-`D` keys —
`handleScroll()` (called once per frame from `loop()`) applies both, reading a
`scrollKeys` set that the keydown/keyup handlers maintain (a window `blur`
clears it so a key held across a tab switch can't scroll forever).

Audio is a tiny WebAudio synth (`SFX.play(type)`) — oscillators and noise
buffers, no samples. `sfx.init()` must be called from a user gesture (browser
autoplay policy), so every input handler calls it.

UI state outside the canvas (header counters, timer, skill counts, button
states) is plain DOM updated by `updateHeader`/`updateSkillUI`. Two pieces of
progress persist to `localStorage`: level unlocks under `lemmings.unlocked`, and
the best save count per level under `lemmings.best` (a JSON `{levelIndex: saved}`
map). `endLevel` calls `recordBest`, which only ever raises a level's best (a
worse replay can't lower it) and rewrites the JSON; both the level-select and
results screens read `bestScores` to show the target/`NEW BEST!`. Loads of either
key are wrapped in `try/catch` and range-validated, so corrupt storage is ignored
rather than fatal.

The page is laid out so the `#game-wrapper` fills the viewport up to a 960px cap
(`width:100%;max-width:960px`); the canvas is a replaced element at a fixed 2:1
ratio, so it scales with the wrapper. Below ~768px the toolbar's flex row wraps
and the ability bar takes its own full-width row (`flex-basis:100%`) to stay a
tidy grid instead of being squeezed; a second breakpoint reflows the header.
Nothing is clipped down to ~320px.

## Tests

`tests/run-tests.mjs` (plain Node, no deps) extracts the script from
`index.html`, evaluates it in a `vm` sandbox with stub `document`/canvas/
`localStorage`/`requestAnimationFrame`, and drives `game.update()` directly —
rendering is stubbed to no-ops, simulation runs for real. Coverage falls into
two layers:

- **Solvability** — every shipped level is played end-to-end by a small scripted
  bot that executes its intended solution and asserts the result. Levels 1–4
  assert that at least `need` lemmings are saved (level 1 additionally asserts
  zero splats and all 10 saved); level 5 "The Gauntlet" asserts that one lemming
  can *traverse* the full chain (bash → build → mine → climb → float) to the
  exit, proving the route connects. These bots only read player-visible state
  and act through `assignAbility`/`releaseRate`, so they double as living
  documentation of each solution — and they catch any physics or geometry change
  that silently makes a level unwinnable. A separate config sanity check asserts
  every level is internally consistent (need ≤ total, open entrance, in-bounds
  exit, some skills).
- **Mechanics** — a physics scenario for each of the eight skills on hand-built
  terrain, steel invulnerability against both destructive skills and builders, a
  blocker dropped when its footing is dug out, nuke flow (including the
  arm/confirm/cancel gate), the fixed-timestep loop (`stepSim`), held-key
  viewport scrolling, ability auto-deselect, timer display, and persistence —
  level unlocks plus per-level best scores (only-improves, the results and
  level-select readouts, and corrupt-store tolerance).

Add a test alongside any physics or rules change; hand-built terrain via the
`fill()` helper keeps scenarios deterministic (level generators sprinkle random
grass, so prefer blank terrain for precise assertions — the level bots instead
use position/state tolerances that absorb the 1px grass jitter).

# Lemmings

A browser tribute to the classic Lemmings, implemented as a single self-contained
HTML file with zero dependencies — no build step, no assets, no network calls
(apart from one Google Font). Terrain, sprites, particles, and sound effects are
all generated procedurally at runtime.

## Play

Open `index.html` directly in a browser, or serve it locally:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

> Note: Chrome suppresses `requestAnimationFrame` for background tabs, so the
> game only runs while its tab is focused.

## How to play

Guide lemmings from the entrance hatch to the exit. They walk mindlessly,
turn at walls, and die from long falls (>62px). Select an ability, then click
a lemming to assign it. Save at least the required number before time runs out.

| Ability | Effect |
|---|---|
| Climber | Climbs vertical walls (permanent) |
| Floater | Survives any fall (permanent) |
| Bomber | Explodes after 5 seconds, blasting a crater |
| Blocker | Stands still and turns others around |
| Builder | Builds a 12-step diagonal bridge |
| Basher | Digs horizontally |
| Digger | Digs straight down |
| Miner | Digs diagonally down |

Steel (grey, riveted) is indestructible — bashers, diggers, miners and bombers
all stop at it.

### Controls

| Input | Action |
|---|---|
| Click ability, then click lemming | Assign ability |
| Right-click | Deselect ability |
| `1`–`8` | Select ability |
| `P` / `Space` | Pause |
| `F` | Fast-forward (3×) |
| `N` | Nuke (arms every lemming as a bomber) |
| `R` | Restart the current level |
| `M` | Mute |
| `-` / `=` | Release rate down / up |
| Mouse at screen edge, or click minimap | Scroll |

Five levels, unlocked in order; progress persists in `localStorage`.

## Tests

A zero-dependency test suite drives the game logic headlessly (Node `vm` with
DOM stubs). Scripted bots play every level's intended solution end-to-end —
proving each level is actually winnable (level 5's gauntlet is verified
traversable) — alongside per-skill physics scenarios and UI/persistence checks:

```sh
node tests/run-tests.mjs   # Node 18+
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the engine works internally.

## Repository layout

- `index.html` — the entire game
- `tests/run-tests.mjs` — headless test suite
- `reference/Lemmings.ts/` — third-party TypeScript Lemmings remake
  ([Tobias Wirth's Lemmings.ts](https://github.com/tomsoftware/Lemmings.ts), MIT-style;
  see its own LICENSE), kept for behavioral reference only — not used by the game

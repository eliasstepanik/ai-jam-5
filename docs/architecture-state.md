---
type: architecture
title: Last Ember – State Architecture (1/3) – Principles, Top Level, Meta, Player
description: Exact TypeScript State type for Last Ember part 1 – storage principles, encoding decisions, top-level shape, meta group and player group with default and unit for every field.
tags: [project, ai-jam-5, architecture, last-ember, state]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – State Architecture (1/3)

Part 1 of 3. Continues in [[architecture-state-2]] (world, entities, fx, rng, ui, settings, best, debug, `init()`) and [[architecture-state-3]] (`migrate`, version policy, what is NOT in State, budgets, checks). Hub: [[architecture]]. Product spec (governs gameplay): [[last-ember-design]]. Randomness: [[architecture-determinism]]. Score and storage: [[architecture-scoring-and-save]]. Non-State resources: [[architecture-resources]].

Every value marked **DEFAULT (architect)** is an architect decision, not a spec decision. Change it freely, but say why in the PR.

## 1. Host contract (from the code, governs)

Source: repo `src/main.ts`, `src/merge.ts`, `src/check.ts`, `AGENTS.md`.

| Fact | Consequence for State |
|---|---|
| `update(s, input, dt)` runs at fixed `dt = 1/60` | all timers are seconds (`number`) decremented by `dt`; step counters are integers |
| `mergeState(mod, old)` = `mod.migrate(old)` if exported, else `{ ...init(), ...old }` (shallow) | Last Ember **exports `migrate`** because State has nested groups (see [[architecture-state-3]]) |
| `migrate` runs on EVERY hot swap and every `main.ts` re-run | `migrate` must be idempotent and fill defaults only |
| Dev key `R` calls `game.init()` | `init()` must return a complete, valid State (title screen) with no side effects |
| `Input` = `{ keys:Set, pressed:Set, mouse:{x,y,down}, clicks:[] }`, CSS px | `Input` is never stored in State (it holds `Set`s) |
| `render(ctx, s, w, h)` | render only READS State. It never writes a State field |
| AGENTS.md: no game state in module-level variables | anything that must survive a swap lives in State; module-level data is only constants or derived caches that can be rebuilt from State ([[architecture-resources]]) |

## 2. Storage principles (binding)

1. **JSON-only values.** State holds `number`, `string`, `boolean`, `null`, plain objects and arrays. Never `undefined` (use `null` or a sentinel), `NaN`, `Infinity`, `Map`, `Set`, typed arrays, class instances, functions, `Image`, canvas or audio objects. Test: `JSON.parse(JSON.stringify(s))` deep-equals `s` ([[architecture-state-3]] §7).
2. **Unions, not enums.** Every id is a string-literal union (`erasableSyntaxOnly`).
3. **Units.** World positions are world px (float). Tile coordinates are integers `tx`, `ty`. Tile index `i = ty * w + tx`. Angles are radians, `0` = +x (right), positive = clockwise on screen (canvas y points down), so `Math.atan2(dy, dx)` gives them directly. Timers are seconds, counting DOWN to 0 unless the field says "elapsed".
4. **Entity positions are centres.** `x`, `y` of the player, monsters, pickups and rocks are the centre in world px. Tile `(tx, ty)` covers `[tx*32, tx*32+32)`; its centre is `tx*32+16`.
5. **One primary owner per field, plus listed co-writers.** Each field has one PRIMARY owner; any other writer must be listed as a co-writer in [[architecture-state-3]] §6 (R-126, [[architecture-rulings-3]] §5). An unlisted writer is a bug. Derived values are functions, not fields, unless the table says "stored mirror".
6. **No `Input` in State, no `w`/`h` in State.** Camera-to-mouse conversion needs the viewport size (see Open question Q1 in [[architecture-state-3]]).

## 3. Tile size and map size

| Constant | Value | Status |
|---|---|---|
| `TILE` | `32` world px | DEFAULT (architect), shared vocabulary |
| `MAP_W` | `320` tiles (10 240 px) | owner decision 2026-10-18 ([[architecture-scale-and-economy]] §2.2) |
| `MAP_H` | `240` tiles (7 680 px) | owner decision 2026-10-18 ([[architecture-scale-and-economy]] §2.2) |
| tiles per map | `76 800` | – |

Rationale: see [[architecture-scale-and-economy]] §1–2 (macro layout, entrance-to-Beacon path band `beaconDist` 510–690 tiles).

## 4. Tile grid encoding decision

Options for 76 800 tiles under a SHALLOW merge, hot swaps and a JSON round trip:

| Option | JSON safe | Hot-swap safe | Cost | Verdict |
|---|---|---|---|---|
| `number[]` of 76 800 entries in State | yes | yes | about 160 KB JSON; mutable, so any system can corrupt it | rejected: no need to mutate tiles |
| `Uint8Array` in State | **no** (becomes `{"0":..}`) | yes | fast | rejected |
| Regenerate from `meta.seed` on every swap, keep nothing | yes | **no**: editing the generator during a run moves walls under the player | free | rejected |
| **Immutable `string`, one char per tile, generated once at run start** | yes | yes: a generator edit takes effect on the next run, never mid-run | 76 800 chars about 77 KB; read via `charCodeAt(i)`, O(1) | **CHOSEN** |

Decision (DEFAULT, architect):

- `world.tiles: string` is written ONCE by `startRun()` and never changed during a run. Nothing in Last Ember alters base tiles: veins are entities sitting on wall tiles, rocks are entities, the Beacon is a point.
- All MUTATIONS are small entity lists or bitsets in State: `veins[]` (mined veins are removed), `rocks[]` (landed rocks block tiles), `world.explored` (bitset as `number[]`).
- HEAVY DERIVED data (solid `Uint8Array` = tiles + landed rocks, path-distance fields, zone map, decor, light sprites) lives OUTSIDE State in a memo cache keyed by `world.tilesHash` and `world.solidSig`. It is rebuilt on demand after a swap ([[architecture-state-3]] §5, [[architecture-resources]]).

Tile alphabet (`TileCh`):

| Char | Meaning | Solid | Notes |
|---|---|---|---|
| `#` | rock wall | yes | veins attach to wall tiles that touch a floor tile |
| `.` | open floor | no | main cave |
| `,` | side-room / dark-chamber floor | no | plants spawn here; ambient is darker |

Entrance and Beacon are points in `world`, not tile chars. Off-map reads return `#`.

## 5. Shared id types

File: `src/core/types.ts` (types only, no runtime code).

```ts
export type MonsterKind = 'lurker' | 'stalker' | 'devourer'
export type MineralId = 'sodium' | 'copper' | 'strontium'
export type FlameKind = 'none' | MineralId // 'none' = plain orange flame
export type PickupKind = 'resin' | 'plant'
export type Phase = 'descent' | 'escape'
export type Screen = 'title' | 'help' | 'playing' | 'paused' | 'dead' | 'won'
export type Zone = 1 | 2 | 3 | 4
export type TileCh = '#' | '.' | ','
export type ParryGrade = 'none' | 'perfect' | 'good' | 'poor'
export type TilePt = { tx: number; ty: number }
export const MINERALS: readonly MineralId[] = ['sodium', 'copper', 'strontium'] // hotbar order 1,2,3
```

`MINERALS` is the only runtime value in the file; keep it in `src/core/state.ts` if a types-only file is preferred. The spec's AI example `'plain' | 'sodium' | ...` maps to `FlameKind` with `'none'` = plain; renderer and AI compare `player.activeMineral` directly.

## 6. Top-level State

```ts
export type State = {
  version: number           // STATE_VERSION at creation; see [[architecture-state-3]] §2
  meta: Meta                // run identity, screen, phase, clocks
  player: Player            // everything about the player
  world: World              // immutable cave + explored bitset + cache keys
  monsters: Monster[]       // live shades
  pickups: Pickup[]         // resin and plants still on the floor
  veins: Vein[]             // unmined mineral veins
  rocks: Rock[]             // escape-phase falling rocks (telegraphed or landed)
  director: Director        // spawn and quake timers
  cam: Cam                  // smoothed camera centre
  fx: Fx                    // short gameplay-driven visual timers + event queue
  rng: Rng                  // PRNG stream states
  ui: Ui                    // menus, help page, toasts, storage flag
  settings: Settings        // mirror of persisted settings
  best: Best | null         // mirror of persisted personal best
  result: RunResult | null  // filled when a run ends; drives the end screen
  debug: Debug              // dev-only switches
}
export const STATE_VERSION = 1
```

## 7. `meta`

```ts
export type Meta = {
  seed: number      // uint32 run seed; 0 on the title screen before the first run
  seedText: string  // seed as typed/shown/shared; '' before the first run
  screen: Screen    // current screen
  phase: Phase      // descent until the Beacon is lit, then escape
  time: number      // s, total simulated time since init() on any screen (cosmetic clocks only)
  steps: number     // int, update steps spent in screen 'playing' this run (run clock)
  zone: Zone        // zone of the player's current tile (stored mirror, written by trackDepth)
  runId: number     // int, +1 per started run; 0 = no run yet
  nextId: number    // int, next entity id (monsters, pickups, veins, rocks share it)
}
```

| Field | Default in `init()` | Unit / meaning |
|---|---|---|
| `seed` | `0` | uint32 |
| `seedText` | `''` | display string, max 32 chars ([[architecture-determinism]] §5) |
| `screen` | `'title'` | – |
| `phase` | `'descent'` | – |
| `time` | `0` | s, `+= dt` every update on every screen |
| `steps` | `0` | int, `+= 1` only while `screen === 'playing'`; run seconds = `steps / 60` |
| `zone` | `1` | 1..4 |
| `runId` | `0` | int |
| `nextId` | `1` | int; id `0` is never used |

Run time is ALWAYS `steps / 60`, never wall clock ([[architecture-scoring-and-save]] §3).

## 8. `player`

```ts
export type Player = {
  x: number; y: number       // world px, centre
  vx: number; vy: number     // px/s, last applied velocity
  facing: number             // rad, aim direction toward the mouse (world space)
  hp: number                 // int pips, 0..hpMax
  hpMax: number              // int, 5
  energy: number             // flame units 0..energyMax; flame is OUT when energy <= 0
  energyMax: number          // flame units, 100
  activeMineral: FlameKind   // current flame colour/effect
  selected: MineralId        // hotbar cursor (which mineral the toss key throws)
  minerals: Record<MineralId, number> // pieces carried, int 0..3 each
  swing: Swing
  parry: Parry
  roll: Roll
  mining: Mining
  beaconHold: number         // s held on the Beacon, 0..BEACON_HOLD (5); reset when released
  hurtT: number              // s of post-hit invulnerability left
  hitFlash: number           // s of red flash left (cosmetic, driven by update)
  stats: Stats
}
export type Swing = {
  active: boolean   // true while the arc can hit
  t: number         // s ELAPSED since swing start, 0..SWING_ACTIVE
  dir: number       // rad, locked aim at swing start
  cooldown: number  // s until next swing allowed
}
export type Parry = {
  lastGrade: ParryGrade // grade of the last parry attempt that touched a lunging shade
  lastDelta: number     // s, swing-contact time minus the shade's perfect moment (signed; <0 = early)
  lastAt: number        // meta.steps of that parry; -1 = never
  energyLost: number    // flame units lost by that parry (0 for perfect)
}
export type Roll = {
  t: number        // s of roll movement left (0 = not rolling)
  cooldown: number // s until next roll allowed
  dirX: number     // unit vector of the roll
  dirY: number
  invuln: number   // s of roll i-frames left
}
export type Mining = {
  targetTile: number // tile index of the vein being mined; -1 = none
  progress: number   // s accumulated, 0..MINE_TIME (2); reset on move or target change
}
export type Stats = {
  mineralsUsed: number    // int, pieces TOSSED into the flame (score input)
  mineralsMined: number   // int, pieces picked from veins
  kills: number           // int, shades killed (parried or died at the flame)
  parries: number         // int, successful parries of any grade
  perfectParries: number  // int
  damageTaken: number     // int, HP pips lost
  energyLostToHits: number // flame units lost to shade hits and imperfect parries
  resinUsed: number       // int
  plantsEaten: number     // int
  maxPathDist: number     // tiles, max entrance path distance ever stood on
  maxDepth: number        // int 0..40, depth metric of maxPathDist (stored mirror)
  deepestZone: Zone       // stored mirror of maxDepth, see trackDepth
}
```

`flameOut` decision: **derived, not stored.** `export const flameOut = (p: Player): boolean => p.energy <= 0`. A stored flag could disagree with `energy`; deriving costs one compare. Resin "relights" by setting `energy` above 0.

| Field | Default (title screen) | Set by `startRun()` |
|---|---|---|
| `x`, `y` | `0`, `0` | entrance tile centre |
| `vx`, `vy` | `0`, `0` | `0`, `0` |
| `facing` | `0` | `Math.PI / 2` (facing into the cave, down) |
| `hp` / `hpMax` | `5` / `5` | `hpMax = T.player.hpMax` (5), `hp = hpMax` |
| `energy` / `energyMax` | `100` / `100` | `energyMax = T.flame.energyMax` (100), `energy = energyMax` |
| `activeMineral` | `'none'` | `'none'` |
| `selected` | `'sodium'` | `'sodium'` |
| `minerals` | `{ sodium: 0, copper: 0, strontium: 0 }` | same |
| `swing` | `{ active: false, t: 0, dir: 0, cooldown: 0 }` | same |
| `parry` | `{ lastGrade: 'none', lastDelta: 0, lastAt: -1, energyLost: 0 }` | same |
| `roll` | `{ t: 0, cooldown: 0, dirX: 1, dirY: 0, invuln: 0 }` | same |
| `mining` | `{ targetTile: -1, progress: 0 }` | same |
| `beaconHold`, `hurtT`, `hitFlash` | `0` | `0` |
| `stats` | all counters `0`, `deepestZone: 1` | same |

**Max values (R-146):** `initPlayer()` sets `energyMax` from `T.flame.energyMax` and `hpMax` from `T.player.hpMax` at every run start. Every system then reads the State values `p.energyMax` / `p.hpMax` (resin cap, radius curve, gauge, plant heal), never the `T` keys. A live tune of either key applies from the NEXT run; the current run keeps its stored max, so the two never disagree inside one run.

Constants referenced above live in `src/core/tuning.ts` (module constants, hot-tunable, never in State): `SWING_ACTIVE = 0.15` s, `SWING_COOLDOWN = 0.5` s (spec start value), `ROLL_TIME = 0.3` s, `ROLL_COOLDOWN = 1.5` s (spec start value), `ROLL_INVULN = 0.3` s, `MINE_TIME = 2` s (spec), `BEACON_HOLD = 5` s (spec ASSUMPTION), `HURT_INVULN = 0.8` s, `HIT_FLASH = 0.25` s, `MINERAL_CAP = 3` (spec). All except the spec values are DEFAULT (architect).

Escape rule recorded for the state model: in phase `escape` the torch is not used, so `energy` no longer burns and every shade hit costs 1 HP pip ([[last-ember-design]], Phase 2: "no torch and no parry").

## Related

- [[architecture]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-resources]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[index]]
- [[vite-canvas-hmr-state-preservation]]

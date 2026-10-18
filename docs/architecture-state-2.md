---
type: architecture
title: Last Ember – State Architecture (2/3) – World, Entities, FX, RNG, UI, init()
description: Exact TypeScript State type for Last Ember part 2 – world (immutable tile string, explored bitset, cache keys), monsters, pickups, veins, rocks, director, camera, fx event queue, rng, ui, settings, best, result, debug and the complete init() and startRun() contract.
tags: [project, ai-jam-5, architecture, last-ember, state]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – State Architecture (2/3)

Part 2 of 3. Previous: [[architecture-state]] (principles, encoding, top level, `meta`, `player`). Next: [[architecture-state-3]] (`migrate`, versions, what is NOT in State). Hub: [[architecture]]. Spec: [[last-ember-design]].

## 1. `world`

```ts
export type World = {
  w: number             // tiles, MAP_W = 320
  h: number             // tiles, MAP_H = 240
  tiles: string         // length w*h, one TileCh per tile, row-major; IMMUTABLE during a run; '' on title
  tilesHash: number     // uint32 FNV-1a of tiles; cache key for derived data; 0 on title
  entrance: TilePt      // spawn tile and win tile
  exit: TilePt          // win tile; always equal to entrance (spec: reaching the entrance = win)
  beacon: TilePt        // Beacon tile = floor tile with the largest path distance from entrance
  beaconDist: number    // tiles, path distance entrance->beacon on the rock-free map (> 0)
  beaconLit: boolean    // true once the hold completes; phase switches to 'escape' in the same step
  explored: number[]    // bitset, ceil(w*h/32) = 2 400 int32 words; bit i set = tile i seen
  solidSig: number      // int, +1 each time a rock lands; cache key for solid grid + escape path field
}
```

| Field | Default (`init()`) | After `startRun()` |
|---|---|---|
| `w`, `h` | `320`, `240` | `320`, `240` |
| `tiles` | `''` | generated string, length 76 800 |
| `tilesHash` | `0` | `fnv1a(tiles)` |
| `entrance`, `exit`, `beacon` | `{ tx: 0, ty: 0 }` | generated |
| `beaconDist` | `1` (never 0, it is a divisor) | BFS result |
| `beaconLit` | `false` | `false` |
| `explored` | `[]` | `new Array(Math.ceil(w * h / 32)).fill(0)` (2 400 words) |
| `solidSig` | `0` | `0` |

Bitset helpers (`src/world/explored.ts`): `isExplored(e, i) = (e[i >> 5] >>> (i & 31)) & 1`, `markExplored(e, i) { e[i >> 5] |= 1 << (i & 31) }`. Words are signed int32 after `|=`; that is fine for JSON. Exploration: each step, tiles whose centre is within the current light radius and in line of sight on the tile grid (Bresenham, 1 ray per tile in the light circle) are marked. ponytail: per-step tile LOS is O(r²), r ≤ about 10 tiles, so ≤ 320 rays/step; cache per tile if it ever shows in a profile.

**Zone map: not stored.** Zone of a tile is derived from the path-distance field (outside State, [[architecture-resources]]): `zoneOf(dist) = min(4, 1 + floor(depthOf(dist) / 10))` with `depthOf(dist) = floor(40 * min(dist, beaconDist) / beaconDist)`. So zone 1 = first quarter of the path to the Beacon, zone 4 = last quarter. Unreachable tiles have dist `-1` and zone 1. Full definition of depth: [[architecture-scoring-and-save]] §1.

**Decor: not stored.** Stalagmites, cracks, crystals are rebuilt from `hashSeed(meta.seed, 'decor')` and `tiles`; they do not affect gameplay.

## 2. `monsters[]`

```ts
export type MonsterAi =
  | 'ring'      // hold the ring at the light edge (lurker orbit, devourer approach)
  | 'stalk'     // stalker: move to the arc behind the player
  | 'windup'    // telegraph: eyes glow, standing still, aiDur = telegraph length
  | 'lunge'     // dash along lungeDir; parryable; contact = hit
  | 'recover'   // after a missed lunge: slide back to the ring
  | 'stunned'   // pushed back (devourer hit by a good parry, or roll bump); no attack
  | 'dying'     // death animation timer; no collision; removed when aiT >= aiDur
export type Monster = {
  id: number           // unique, from meta.nextId
  kind: MonsterKind
  x: number; y: number // world px, centre
  vx: number; vy: number // px/s
  hp: number           // int, 1 for all kinds (a parry or a flame hit kills); kept for tuning
  ai: MonsterAi
  aiT: number          // s ELAPSED in the current ai state
  aiDur: number        // s planned length of the current ai state (0 = open-ended)
  beat: number         // int, 0-based beat INDEX during windup (default 0); beat COUNT is T.monsters[kind].beats (R-130)
  ringAngle: number    // rad, preferred angle around the player
  ringRadius: number   // px, current preferred distance from the player
  orbitDir: number     // +1 or -1, orbit direction
  lungeDir: number     // rad, locked at windup start (aim at the player at that moment)
  lungeCd: number      // s until this shade may start another windup
  stunned: number      // s of stun left (mirrors ai 'stunned'; 0 otherwise)
  seen: boolean        // true while inside the light this step (draw full body vs eyes only)
}
```

Spawn defaults (`spawnMonster(s, kind, x, y)` in `src/entities/monster.ts`): `vx = vy = 0`, `hp = 1`, `ai = 'ring'` (`'stalk'` for stalker), `aiT = 0`, `aiDur = 0`, `beat = 0`, `ringAngle = atan2(y - p.y, x - p.x)`, `ringRadius = lightRadius(s) + RING_MARGIN[kind]`, `orbitDir = gameplay rng < 0.5 ? -1 : 1`, `lungeDir = 0`, `lungeCd = LUNGE_CD_START[kind]`, `stunned = 0`, `seen = false`.

**Telegraph progress: derived, not stored:** `telegraph(m) = m.ai === 'windup' ? clamp(m.aiT / m.aiDur, 0, 1) : 0`. **Target: implicit.** The only target is the player; no `target` field (YAGNI, there are no allies). **Parry timing reference:** the perfect moment is lunge time `T.monsters[kind].contactS` (= `PERFECT_AT[kind]`). It is NEVER tested with exact float equality on accumulated `aiT`; it is compared only through the signed delta `δ` with the `1e-9` epsilon of [[architecture-systems-3]] §3.1 (`|δ| <= P + 1e-9`, R-129 in [[architecture-rulings-3]]). `δ` is stored on the player in `parry.lastDelta`. Tuning numbers: [[architecture-tuning]] §6.

## 3. `pickups[]`

```ts
export type Pickup = {
  id: number
  kind: PickupKind // 'resin' | 'plant'
  x: number; y: number // world px, centre of a floor tile
  bob: number      // rad, idle bob phase (cosmetic, set once at spawn from the cave stream)
}
```

Placed once by the generator (resin: zones 1–4 along the main path and dead ends; plant: only on `,` side-room tiles). Picked up on overlap (radius 14 px) and removed from the array. A plant at full HP is NOT consumed (it cannot be stored; it stays on the floor).

## 4. `veins[]`

```ts
export type Vein = {
  id: number
  mineral: MineralId
  tile: number    // tile index of the WALL tile the vein sits in ('#')
  stand: number   // tile index of an adjacent floor tile from which it is mined
  pieces: number  // int 1..2, pieces granted on completion (capped by MINERAL_CAP)
}
```

Mining: player within 40 px of the vein face and holding the interact key accumulates `player.mining.progress`. At `MINE_TIME` the vein is removed from `veins` and `pieces` are added (`min(3, count + pieces)`). Mined veins are therefore represented by ABSENCE; no `mined` flag.

## 5. `rocks[]`

```ts
export type Rock = {
  id: number
  x: number; y: number // world px, centre of the footprint
  size: 1 | 2          // footprint side in tiles: 1×1 or 2×2
  tiles: number[]      // footprint tile indices (1 or 4 entries); all were floor when chosen
  t: number            // s of telegraph left (shadow circle); starts at ROCK_WARN = 1 (spec)
  landed: boolean      // false while the shadow shows; true = solid obstacle
  hit: boolean         // true once its landing damage check has run (ensures one hit per rock)
}
```

Only exist in phase `escape`. On landing: `landed = true`, `world.solidSig += 1`. The route-guarantee check (rock may only be chosen if the exit stays reachable from the player) runs BEFORE the rock is pushed; see the world/escape architecture. Cap: `ROCKS_MAX = 200` landed rocks (+ `pendingMax` 4 telegraphs; FINAL, [[architecture-scale-and-economy-3]] §2.1); beyond that the quake only spawns cosmetic dust. Live shades are capped by `MONSTERS_MAX = 24` ([[architecture-tuning-2]]). State cost of both caps: [[architecture-scale-and-economy-4]] §1.1.

## 6. `director`, `cam`

```ts
export type Director = {
  spawnT: number   // s until the next spawn attempt
  quakeT: number   // s until the next rock (escape only)
  alive: Record<MonsterKind, number> // int, live count per kind (stored mirror of monsters[], rebuilt each step)
}
export type Cam = {
  x: number; y: number // world px, smoothed camera centre (lerp toward player, rate 8/s)
}
```

Defaults: `director = { spawnT: 3, quakeT: 0, alive: { lurker: 0, stalker: 0, devourer: 0 } }`, `cam = { x: 0, y: 0 }`. `startRun()` snaps `cam` to the player. Camera lives in State because it is smoothed over steps and must not jump on a swap; it is written in `update`, never in `render`.

## 7. `fx` – gameplay timers and the event queue

Decision (DEFAULT, architect):

- **In State:** timers that `update` drives and that would visibly jump if lost on a swap, plus a short event queue that tells render/audio what happened.
- **Outside State:** the particle pool, sparks, dust, embers, light sprites. They are pure presentation, rebuilt from events, allowed to vanish on a swap or reset. They never feed back into gameplay. They live in `src/render/particles.ts` (module cache, [[architecture-resources]]).

**Authoritative `FxEventKind` union (28 members).** Every other file points here and must not restate the list. Base 20 plus R-082 ([[architecture-rulings-2]]) `dodge`, `windup`, `lunge`, `uiMove`, `uiConfirm`, `uiBack`, `copyLink`, plus `denied` (Beacon START GATE press below `T.beacon.minStartE`, [[architecture-systems-2]] §5, R-125 in [[architecture-rulings-3]]). Aliases, NOT members: `telegraph` = `windup`, `resin` = `relight a=1`, empty toss = `toss a=-1` (so R-082's "`denied` = `toss a=-1`" now applies to the toss case only). Additive union change, no `STATE_VERSION` bump ([[architecture-state-3]] §2).

```ts
export type FxEventKind =
  | 'swing' | 'parryPerfect' | 'parryGood' | 'parryPoor' | 'flameHit' | 'hpHit'
  | 'monsterDie' | 'flameOut' | 'relight' | 'heal' | 'mineTick' | 'mineDone'
  | 'toss' | 'shakeOff' | 'roll' | 'beaconLit' | 'rockWarn' | 'rockLand' | 'win' | 'death'
  | 'dodge' | 'windup' | 'lunge' | 'denied'                 // systems ([[architecture-systems-4]] §4)
  | 'uiMove' | 'uiConfirm' | 'uiBack' | 'copyLink'          // screens / platformStep (R-003, R-077)
export type FxEvent = {
  seq: number      // int, strictly increasing (from fx.seq)
  kind: FxEventKind
  x: number; y: number // world px
  a: number        // free scalar: angle (rad) or magnitude, kind-specific; 0 if unused
  step: number     // meta.steps when emitted
}
export type Fx = {
  shake: number      // s of screen shake left
  shakeMag: number   // px amplitude at shake start (decays linearly with shake)
  flare: number      // s of perfect-parry flare left
  beaconFlash: number // s of white-out after lighting the Beacon
  seq: number        // int, next event seq
  events: FxEvent[]  // ring of recent events, max FX_EVENTS_MAX = 32, pruned when age > 30 steps
}
```

Defaults: `{ shake: 0, shakeMag: 0, flare: 0, beaconFlash: 0, seq: 1, events: [] }`. Emit via `emit(s, kind, x, y, a = 0)` in `src/systems/fx.ts`: push, `seq += 1`, drop the oldest when longer than 32, drop events with `meta.steps - e.step > 30`. Consumers (`src/render/particles.ts`, `src/audio/sfx.ts`) keep `lastSeq` in their module cache and handle only `e.seq > lastSeq`. On a fresh module instance (`lastSeq === -1`) they set `lastSeq = max seq present` and play nothing, so a hot swap never replays sounds. This is safe when two updates run in one frame: events persist 30 steps, not one.

## 8. `rng`

```ts
export type Rng = {
  cave: number      // uint32 state of the cave stream AFTER generation (record; generation uses sub-streams)
  gameplay: number  // uint32 state of the gameplay stream; advanced only in update()
  cosmetic: number  // uint32 state of the cosmetic stream; advanced only in update() for cosmetic values
}
```

Defaults: all `0` on the title screen; `startRun()` seeds them per [[architecture-determinism]] §3. Numbers are uint32 (`>>> 0`), JSON-safe.

## 9. `ui`, `settings`, `best`, `result`, `debug`

```ts
export type Toast = { text: string; t: number } // t = s left; max 3 queued
export type Ui = {
  cursor: number       // int, selected menu item on title/dead/won/paused screens
  helpPage: number     // int, 0..HELP_PAGES-1 (3 pages: goal, parry, minerals)
  toasts: Toast[]
  storageOk: boolean   // false if localStorage threw at load or save (shown once as a toast)
  seedInput: string    // text typed into the title-screen seed field ('' = random)
  copied: number       // s left of the "link copied" label
}
export type Settings = {
  volume: number   // 0..1, master
  muted: boolean
  lastSeed: string // seedText of the last started run
  loaded: boolean  // true once loadSettings() ran this page session (prevents reload loops)
  reducedFlash: boolean // accessibility, default false ([[architecture-rulings-2]] §9)
  quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3' // render override, default 'auto'; persisted as SettingsRecord.quality (R-142)
}
export type Debug = {
  reveal: boolean       // draw the whole map lit
  god: boolean          // no damage, no energy drain
  showPaths: boolean    // overlay path-distance numbers and zone borders
  freezeAi: boolean     // monsters do not move
}
```

`Best` and `RunResult` are defined in [[architecture-scoring-and-save]] §6 (`Best`, `DEFAULT_BEST`) and §5 (`RunResult`, `DEFAULT_RESULT`). Defaults: `ui = { cursor: 0, helpPage: 0, toasts: [], storageOk: true, seedInput: '', copied: 0 }`, `settings = { volume: 0.7, muted: false, lastSeed: '', loaded: false, reducedFlash: false, quality: 'auto' }`, `best = null`, `result = null`, `debug = { reveal: false, god: false, showPaths: false, freezeAi: false }`. Debug toggles are bound to `Shift+Digit1..6` (never F-keys: F5 reloads the page), and the binding is gated by `import.meta.env.DEV` in `src/game.ts` ONLY; layers L0–L3 never read `import.meta.env` (R-132, R-133, [[architecture-monsters-ai-2]] §9).

Settings and best are **mirrors** of `localStorage`. `localStorage` itself is outside State. The first `update` with `settings.loaded === false` calls `loadSettings(s)` and `loadBest(s)` and sets `loaded = true`. This is the only lazy side effect and it is guarded by a State flag, so it runs once per page session and never on swaps (the flag survives the swap). Dev `R` reset sets it back to `false`, which re-reads storage. That is harmless.

## 10. `init()` and `startRun()`

`init()` (in `src/core/state.ts`, re-exported by `src/game.ts`) is pure and cheap: it builds the title-screen State with every default listed in these files. It does NOT generate a cave (76 800-tile generation (≈ 55 ms, chunked, [[architecture-scale-and-economy]] §4) plus BFS, and `migrate` calls `init()` on every swap).

```ts
export function init(): State {
  return {
    version: STATE_VERSION,
    meta: { seed: 0, seedText: '', screen: 'title', phase: 'descent', time: 0, steps: 0, zone: 1, runId: 0, nextId: 1 },
    player: initPlayer(),
    world: { w: MAP_W, h: MAP_H, tiles: '', tilesHash: 0, entrance: { tx: 0, ty: 0 }, exit: { tx: 0, ty: 0 },
      beacon: { tx: 0, ty: 0 }, beaconDist: 1, beaconLit: false, explored: [], solidSig: 0 },
    monsters: [], pickups: [], veins: [], rocks: [],
    director: { spawnT: 3, quakeT: 0, alive: { lurker: 0, stalker: 0, devourer: 0 } },
    cam: { x: 0, y: 0 },
    fx: { shake: 0, shakeMag: 0, flare: 0, beaconFlash: 0, seq: 1, events: [] },
    rng: { cave: 0, gameplay: 0, cosmetic: 0 },
    ui: { cursor: 0, helpPage: 0, toasts: [], storageOk: true, seedInput: '', copied: 0 },
    settings: { volume: 0.7, muted: false, lastSeed: '', loaded: false, reducedFlash: false, quality: 'auto' },
    best: null, result: null,
    debug: { reveal: false, god: false, showPaths: false, freezeAi: false },
  }
}
```

`initPlayer()` returns the "Default" column of [[architecture-state]] §8.

`startRun(s: State, seedText: string): void` (`src/core/run.ts`), called from the title/dead/won screens and on page load with `?seed=`:

1. `const seed = parseSeed(seedText)` ([[architecture-determinism]] §5); if text is empty, a random seed is drawn from `crypto.getRandomValues` (the ONLY non-injected randomness, and it runs outside the simulation).
2. `startRun` receives the finished `CaveResult` from the `ui.genPending` loop (one attempt per `update`, then `fallbackCave`; [[architecture-scale-and-economy]] §4). Assign `world` fields, `veins`, `pickups` from it; `rng.cave = cave.rngState`.
3. Reset `player = initPlayer()`, put it on the entrance centre, `facing = Math.PI / 2`.
4. Clear `monsters`, `rocks`, `result`, `fx` (keep `fx.seq`, it must keep increasing).
5. `meta`: `seed`, `seedText`, `screen = 'playing'`, `phase = 'descent'`, `steps = 0`, `zone = 1`, `runId += 1`. `nextId` continues.
6. `rng.gameplay = hashSeed(seed, 'gameplay')`, `rng.cosmetic = hashSeed(seed, 'cosmetic')`.
7. `director` back to defaults; `cam` snapped to the player; `settings.lastSeed = seedText`; mark the entrance light circle explored. `startRun` touches NO DOM (it runs under Node in `npm run check`): the `?seed=` URL write (`history.replaceState`, [[architecture-scoring-and-save]] §5) is done by `platformStep(s)` when it sees `meta.runId` change (R-030, R-077; re-confirmed by review F13 2026-10-18).

Keep `meta`, `settings`, `best`, `ui.storageOk` and `debug` across runs; everything else is reset.

## Related

- [[architecture]]
- [[architecture-state]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-resources]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[index]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-systems-2]]
- [[architecture-systems-4]]

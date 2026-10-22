---
type: architecture
title: Last Ember – Gameplay Systems (1/4) – Step Order, Screens, Runs, Intent, Movement
description: Last Ember gameplay systems part 1 – the fixed-step update order for descent and escape, the step() skeleton with hitstop, screen state machine with transitions and resets, startRun and endRun contracts, intent resolution from Input (movement vector, aim via camera and view) and player movement with circle-vs-tile collision and sliding, with formulas and worked examples.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-22T20:00:00Z
---

# Last Ember – Gameplay Systems (1/4)

Part 1 of 4. Next: [[architecture-systems-2]] (flame, pickups, mining, Beacon, minerals), [[architecture-systems-3]] (swing, parry, damage, roll), [[architecture-systems-4]] (rocks slot, phase change, escape, win/lose, score, fx, camera, State additions, checks). Values: [[architecture-tuning]], [[architecture-tuning-2]] (`T`). Monster behaviour: [[architecture-monsters-ai]], [[architecture-monsters-ai-2]]. Hub: [[architecture]]. Spec (governs): [[last-ember-design]]. State fields (governs names): [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]] §6 (field owners). Input shape: [[architecture-host-changes]] §1.

Binding for every system: mutate `State` only; randomness only via `rand(s, 'gameplay' | 'cosmetic')` ([[architecture-determinism]] §2); no DOM, no `import.meta.env` in `src/core|world|entities|systems`; `dt` is always `1/60`; string-literal unions; no semicolons, single quotes, 2-space indent; files < 300 lines.

## 1. Fixed-step order

`update(s, input, dt)` in `src/game.ts` calls `step(s, input, dt)` from `src/systems/step.ts` (R-002). Every system below runs at most once per step, in this order.

### 1.1 Phase `descent`

| # | Function (file) | Purpose |
|---|---|---|
| 0 | `stepScreens(s, input)` (`src/systems/screens.ts`, R-003; DOM effects in `src/ui/platform.ts` `platformStep`) | menus, pause, Blur; returns `true` only if `screen === 'playing'` afterwards |
| 1 | clocks + hitstop (`src/systems/step.ts`) | `meta.time += dt` always; `meta.steps += 1` while playing; hitstop skips #2–#16 |
| 2 | `resolveIntent(s, input): Intent` (`src/systems/intent.ts`) | movement vector, aim, edge actions; writes `player.facing` |
| 3 | `stepMovement(s, it, dt)` (`src/systems/movement.ts`) | accel/friction, wall collision with sliding |
| 4 | `trackDepth(s)` (`src/systems/depth.ts`), `stepExplore(s)` (`src/systems/explore.ts`) | depth/zone mirrors, explored bitset |
| 5 | `stepFlame(s, dt)` (`src/systems/flame.ts`) | burn, flame-out transition |
| 6 | `stepPickups(s)` (`src/systems/pickups.ts`) | resin, plant |
| 7 | `stepMining(s, it, dt)` (`src/systems/mining.ts`) | hold, cancel, completion |
| 8 | `stepBeacon(s, it, dt, eStart)` (`src/systems/beacon.ts`) | START GATE (`max(eStart, e) >= T.beacon.minStartE` 40, R-125, else `denied` on the press edge, no cost), hold; calls `lightBeacon(s)` on completion |
| 9 | `stepMinerals(s, it)` (`src/systems/flame.ts`) | select, toss, shake-off |
| 10 | `stepSwing(s, it, dt)` (`src/systems/combat.ts`) | start swing, buffer, timers |
| 11 | `stepDirector(s, dt)` (`src/systems/director.ts`) | spawn outside light, despawn, caps |
| 12 | `stepMonsters(s, dt)` (`src/systems/monsters.ts`) (R-004) | per-kind AI, windup, lunge movement, devourer light push |
| 13 | `resolveParries(s)` (`src/systems/combat.ts`) | swing arc vs lunging shades, grade, flame loss |
| 14 | `resolveBites(s)` (`src/systems/combat.ts`) | lunge contacts → `damagePlayer` |
| 15 | timers (`tickPlayerTimers(s, dt)` in `combat.ts`) | `hurtT`, `hitFlash` |
| 16 | `checkEnd(s)` (`src/core/run.ts`) | `hp <= 0` → `endRun(s, false)` |
| 17 | `tickFx(s, dt)` (`src/systems/fx.ts`) | fx timers, event pruning |
| 18 | `stepCamera(s, dt)` (`src/systems/camera.ts`) | lerp toward player |

### 1.2 Phase `escape`

| # | Function | Difference from descent |
|---|---|---|
| 0–1 | same | |
| 2 | `resolveIntent` | facing = movement direction; `roll` edge read; toss/shake/swing/interact ignored |
| 3 | `stepRoll(s, it, dt)` then `stepMovement` (both `movement.ts`) | sprint speed `walk × 2.0`; roll overrides velocity |
| 4 | `trackDepth` only | the cave is lit; `stepExplore` skipped |
| 5 | `stepFlame` | returns at once (no burn in escape) |
| 6 | `stepPickups` | plants only; resin ignored and left on the floor |
| 7–10 | skipped | no mining, Beacon is lit, no minerals, no swing (**spec**: no torch, no parry) |
| 11 | `stepQuake(s, dt)` (`src/systems/quake.ts`) | rocks: calls `planRockFall(...)` of [[architecture-rocks]] |
| 12 | `stepDirector` (escape table) | constant pressure, no light test |
| 13 | `stepMonsters` (escape behaviour) | no ring, constant lunges |
| 14 | `resolveBites` | every bite = 1 HP; roll i-frames dodge |
| 15 | timers | also `roll.*` cooldowns (in `stepRoll`) |
| 16 | `checkEnd` | lose on `hp <= 0`; WIN when within 1 tile of `world.exit` |
| 17–18 | same | |

Why this order: aim uses the camera from the previous step (lag ≤ 16.7 ms, [[architecture-host-changes]] §1); movement before the flame so the zone used for the burn rate is the zone the player stands in; pickups before mining so a resin under the player relights before a mining cost is charged; pickups before the Beacon so a resin picked on the press step counts toward the 40 E start gate (the gate reads `max(eStart, e)`: start-of-step energy or the post-pickup value, R-125); parry (#13) before bite (#14) so a swing that lands on the same step as the bite wins; `checkEnd` after all damage; camera last.

### 1.3 `step()` skeleton

```ts
// src/systems/step.ts (R-002)
export function step(s: State, input: Input, dt: number): void {
  s.meta.time += dt
  if (!stepScreens(s, input)) return
  s.meta.steps += 1
  if (s.fx.hitstop > 0) { s.fx.hitstop = Math.max(0, s.fx.hitstop - dt); tickFx(s, dt); return } // State addition
  const it = resolveIntent(s, input)
  const esc = s.meta.phase === 'escape'
  if (esc) stepRoll(s, it, dt)
  stepMovement(s, it, dt)
  trackDepth(s)
  if (!esc) stepExplore(s)
  const eStart = s.player.energy                  // Beacon gate snapshot before the burn (R-125); local, not State
  stepFlame(s, dt)
  stepPickups(s)
  if (!esc) { stepMining(s, it, dt); stepBeacon(s, it, dt, eStart) }
  if (!esc && s.meta.phase === 'descent') { stepMinerals(s, it); stepSwing(s, it, dt) } // phase may flip in stepBeacon
  if (s.meta.phase === 'escape') stepQuake(s, dt)
  stepDirector(s, dt)
  stepMonsters(s, dt)
  if (s.meta.phase === 'descent') resolveParries(s)
  resolveBites(s)
  tickPlayerTimers(s, dt)
  checkEnd(s)
  if (s.meta.screen !== 'playing') return
  tickFx(s, dt)
  stepCamera(s, dt)
}
```

Hitstop (perfect parry, 0.060 s = 4 steps) freezes the world but the run clock still counts (it is real playing time). Edges arriving during hitstop are lost except a click, which the swing buffer keeps (`player.swing.buffer`, [[architecture-systems-3]] §1).

Notes (A29), the code in `src/systems/step.ts` differs from the skeleton above in three places; the rulings win:

- `stepRoll`, the `eStart` snapshot, `stepMining`, `stepBeacon`, `stepMinerals` and `stepQuake` are not called yet. `step.ts` marks each spot with an index comment; B8, B1, B7 and B2 add the calls (X3, D5, D7/D8, D9, X11); see R-169 in [[architecture-rulings-3]] §8.
- Hitstop runs `tickFx` and sets the click buffer before the decrement; see R-172 in [[architecture-rulings-3]] §8 (OWNER-confirmed 2026-10-22).
- `step.ts` has no counting spy; call-order checks observe behaviour instead; see R-176 in [[architecture-rulings-3]] §8.

## 2. Screen state machine (`src/systems/screens.ts`, R-003)

Pure state machine. DOM effects (clipboard write, `?seed` read/write) run in `src/ui/platform.ts` `platformStep(s)`.

| From | Input (edge) | Guard | To | Side effects / resets |
|---|---|---|---|---|
| `title` | `Enter` or click | – | `playing` | `startRun(s, seedForTitle(s))`: first run uses `?seed=` (read once) else `ui.seedInput` else random |
| `title` | `KeyH` or click on Help | – | `help` | `ui.helpPage = 0` |
| `help` | `ArrowRight`/`ArrowLeft` | – | `help` | `helpPage = clamp(page ± 1, 0, 2)` |
| `help` | `Escape`, `Enter`, `Backspace` | – | `title` | – |
| `playing` | `Escape`, `KeyP` or `'Blur'` | – | `paused` | `ui.cursor = 0`; nothing in the world changes |
| `playing` | – | `hp <= 0` (in `checkEnd`) | `dead` | `endRun(s, false)` |
| `playing` | – | escape phase and on exit (in `checkEnd`) | `won` | `endRun(s, true)` |
| `paused` | `Escape`, `KeyP`, `Enter` | – | `playing` | – (no auto-resume on focus) |
| `paused` | `KeyQ` | – | `title` | run abandoned: no `result`, no best commit, `meta.phase` left as is (next `startRun` resets) |
| `dead`/`won` | `Enter` or click | `meta.time - result.endAt >= 0.5` | `playing` | `startRun(s, '')` = new random seed (**spec**) |
| `dead`/`won` | `KeyT` | same lockout | `playing` | `startRun(s, s.meta.seedText)` = retry seed |
| `dead`/`won` | `Escape` | same lockout | `title` | – |
| `dead`/`won`/`paused` | `KeyC` | – | same | copy link ([[architecture-determinism]] §5), `ui.copied = 2` |

Rules: only one transition per step (first matching row wins, top to bottom). `stepScreens` also ticks `ui.toasts[i].t` and `ui.copied` on every screen, loads settings/best once (`settings.loaded`, [[architecture-state-2]] §9), and returns `s.meta.screen === 'playing'`. `'Blur'` on any other screen is ignored. Game code never binds `KeyR` ([[architecture-host-changes-2]] §7).

Notes (A29), stale rows of the table above; the code follows [[architecture-ui-2]] §4 and the rulings win:

- `paused` + `Enter` does not resume: it activates the focused menu item (cursor starts on Resume, `playing` -> `paused` sets `ui.cursor = 0`); see R-175 in [[architecture-rulings-3]] §8.
- `help` returns to `ui.helpFrom`, not always to `title`; see R-175.
- `KeyC` only emits the `copyLink` fx event; `platformStep` writes `ui.copied`, `stepScreens` only counts it down (no `ui.copied = 2` here, no `ui.urlSeed`). `KeyC` acts on paused, dead and won, not on title and not on help; see R-171, R-175, R-077.
- Mouse: `stepScreens` does not write `ui.hover` from `hit()`. A click activates the item under `ui.cursor` until A30/A11 set `ui.cursor` and `ui.hover` from `hit()` before `step`; see R-170 (OWNER ruling, deferred to A30/A11) and the extra navigation and lockout rules in R-174.
- Settings and best load (`settings.loaded`) and `saveSettings` calls are not in `screens.ts` until B7 creates `core/storage.ts`; see R-168.
- `stepScreens` also runs `genStep(s)` while `ui.genPending !== ''` (see section 3 note); see R-166.

## 3. `startRun` and `endRun` (`src/core/run.ts`)

`startRun(s: State, seedText: string): void` follows [[architecture-state-2]] §10 steps 1–7 exactly. Additions made here:

- After step 2: ids for `cave.veins` then `cave.pickups` from `meta.nextId` in array order ([[architecture-determinism]] §4).
- Step 3: `player.x = entrance.tx * 32 + 16`, `player.y = entrance.ty * 32 + 16`, `facing = T.player.facingStart`.
- Step 4: also `fx.hitstop = 0` and the State additions of [[architecture-systems-4]] §6 at their defaults.
- Step 7: `director.spawnT = T.director.firstSpawnS` (3 s), `director.quakeT = 0`; mark explored: every tile whose centre is within `lightRadius(s)` (170 px) of the player with LOS.
- Calls `emit(s, 'relight', p.x, p.y)` so audio starts the flame loop.

`endRun(s: State, won: boolean): void` follows [[architecture-scoring-and-save]] §5. Order: build `ScoreInput` from `stats.maxDepth`, `won`, `floor(meta.steps / 60)`, `stats.mineralsUsed`, `won ? player.hp : 0`; `parts = computeScore(input)`; fill `RunResult` with `endAt = meta.time`; `meta.screen = won ? 'won' : 'dead'`; `emit(s, won ? 'win' : 'death', p.x, p.y)`; `commitBest(s)`. The death animation (`player_body death`) plays on the `dead` screen from `meta.time - endAt`; the world is no longer stepped.

Notes (A29), the code differs from the text above; the rulings in [[architecture-rulings-3]] §8 win:

- File: `startRun`, `endRun`, `checkEnd`, `genStep` and `runSeedText` live in `src/systems/run.ts`, not `src/core/run.ts` (R-001, R-166). Signature: `startRun(s, seedText, cave?: CaveResult)`; the third parameter is additive. Without `cave` it generates synchronously via `generateCave`; the chunked path is `genStep(s)` (one attempt per update while `ui.genPending !== ''`, `fallbackCave` at `MAX_ATTEMPTS` 8, then `startRun(s, key, cave)`). `runSeedText(raw: string): string` (sanitised seed text, else a random seed) is an extra export; see R-166.
- A fallback cave (`stats.fallback`) is logged once with `console.warn` in `startRun`; see R-167.
- The UI reset covers `ui.cursor`, `hover`, `screenAt`, `confirmT`, `denyT`, `genPending`, `genAttempt`, `toasts`, `copied`, `copyMsg`. `ui.seedInput` is kept on purpose (deviation from state-2 §10); see R-173.
- `endRun` does not call `commitBest` yet: B7 adds it with `core/storage.ts`. Until then `result.prevBest` is 0 (when `s.best` is null) and `result.isNewBest` is false; see R-168.

## 4. Intent resolution (`src/systems/intent.ts`)

```ts
export type Intent = {
  mx: number; my: number          // movement direction, unit vector or (0,0)
  moving: boolean                 // mx !== 0 || my !== 0
  aimX: number; aimY: number      // mouse in world px
  swing: boolean                  // left click edge this step (clicks.length > 0)
  roll: boolean                   // pressed 'Space'
  interact: boolean               // held 'KeyE'
  interactEdge: boolean           // pressed 'KeyE'
  toss: boolean; shake: boolean   // pressed 'KeyF' / 'KeyG'
  select: MineralId | null        // pressed Digit1..3 -> MINERALS[0..2]
}
export function resolveIntent(s: State, input: Input): Intent
```

`Intent` is a per-step local value, never stored in State (it is derived from `Input`).

Formulas:

```
ax = (D||ArrowRight) - (A||ArrowLeft); ay = (S||ArrowDown) - (W||ArrowUp)    // keys held
len = hypot(ax, ay); mx = len ? ax / len : 0; my = len ? ay / len : 0       // diagonal normalised
zoom = viewZoomCss(view.h, view.dpr)   // src/core/view.ts, same zoom as render (R-131); >= 1, so checks with view {0,0,1} get 1
aimX = cam.x + (mouse.x - view.w / 2) / zoom
aimY = cam.y + (mouse.y - view.h / 2) / zoom
descent: if hypot(aimX - p.x, aimY - p.y) >= 4 then p.facing = atan2(aimY - p.y, aimX - p.x)  // else keep
escape:  if moving then p.facing = atan2(my, mx)
```

Worked example: `view = { w: 1280, h: 720 }` → zoom 2. `cam = (2000, 1500)`, player at `(2010, 1496)`, mouse at `(900, 300)`. `aimX = 2000 + (900 − 640) / 2 = 2130`, `aimY = 1500 + (300 − 360) / 2 = 1470`. `facing = atan2(1470 − 1496, 2130 − 2010) = atan2(−26, 120) = −0.2128 rad` (−12.2°, up-right on screen).

Edge cases: keys `W` and `S` together cancel (ay = 0). `select` takes the lowest digit if several are pressed in one step. Codes are `KeyboardEvent.code`, so AZERTY users get positional WASD.

## 5. Player movement (`src/systems/movement.ts`)

```ts
export function stepMovement(s: State, it: Intent, dt: number): void
// moveCircle / isSolidTile are imported from src/world/collide.ts / src/world/grid.ts, NOT defined or re-exported here (R-012)
```

`moveCircle(s, x, y, dx, dy, r)` is shared with monsters ([[architecture-monsters-ai-2]] §4). `isSolidTile` reads the cached solid grid ([[architecture-state-3]] §5).

### 5.1 Velocity

```
if roll.t > 0: velocity set by stepRoll ([[architecture-systems-3]] §5); skip this block
maxV = phase === 'escape' ? T.player.walkPxS * T.escape.sprintMul : T.player.walkPxS     // 120 or 240
rate = it.moving ? (escape ? T.escape.accelPxS2 : T.player.accelPxS2) : T.player.frictionPxS2 * (escape ? 2 : 1)
tx = it.mx * maxV; ty = it.my * maxV
dvx = tx - vx; dvy = ty - vy; dl = hypot(dvx, dvy); k = dl > rate * dt ? rate * dt / dl : 1
vx += dvx * k; vy += dvy * k
```

Mining and the Beacon hold do not slow movement; moving cancels them ([[architecture-systems-2]] §3, §4).

### 5.2 Collision: circle vs tile grid, axis-separated (gives sliding)

```
r = T.player.radiusPx
res = moveCircle(s, p.x, p.y, vx * dt, vy * dt, r)
p.x = res.x; p.y = res.y
if res.hitX: vx = 0
if res.hitY: vy = 0
```

`moveCircle` algorithm:

1. `x += dx`. For every tile `(tx, ty)` with `tx` in `floor((x − r) / 32) .. floor((x + r) / 32)` and `ty` likewise, if solid: closest point `cx = clamp(x, tx*32, tx*32 + 32)`, `cy = clamp(y, ty*32, ty*32 + 32)`; `d = hypot(x − cx, y − cy)`; if `d < r`: if `d > 1e-6` push `x += (x − cx) / d * (r − d)` and the same for y; else (centre inside the tile) push out along −dx by `r`. Set `hitX = true` if any push had an x component.
2. `y += dy`, same resolution, `hitY`.
3. Return the position.
4. Substeps (anti-tunnelling): if `hypot(dx, dy) > 0.9 * r`, split the move into `n = ceil(hypot(dx, dy) / (0.9 * r))` equal sub-moves, each running 1–3; `hitX`/`hitY` are OR-ed. Player roll is 7 px/step < 9 px, so 1 substep; a lurker lunge at 560 px/s is 9.3 px/step > 8.1 px, so 2 substeps. Cost is negligible (≤ 24 movers).

Corner rounding falls out of the closest-point test: walking diagonally into a wall corner slides around it.

Worked example (slide): walls at tile column `tx = 32` (x 1024–1056). Player `(1013, 800)`, holding `D+S`, steady `v = (84.85, 84.85)` px/s. Step: `dx = 1.414` → `x = 1014.41`; right edge 1024.41 overlaps by 0.41 → closest point `cx = 1024`, `d = 9.59`, push `x −= 0.41` → 1014.0, `hitX` → `vx = 0`. `dy = 1.414` → `y = 801.41`, no wall. Next step `vx` re-accelerates toward 84.85 by `900/60 = 15` px/s, gets clipped again: the player slides down the wall at 84.85 px/s while pressing into it. ponytail: slide speed is the axis component, not re-projected to full speed; add projection if wall-hugging feels sticky.

### 5.3 Edge cases

- Spawn inside a rock (escape): rocks never land on the player's tiles; the rock module pushes the player out on landing ([[architecture-rocks]]).
- Escape win tile: the entrance tile is floor; nothing special in movement.
- `debug.freezeAi` does not affect the player.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-rocks]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-scale-and-economy-2]]
- [[architecture-rulings-3]]
- [[architecture-ui-2]]

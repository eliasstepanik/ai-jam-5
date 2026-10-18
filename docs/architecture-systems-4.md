---
type: architecture
title: Last Ember – Gameplay Systems (4/4) – Explore, Rocks Slot, Escape, End, Score, FX, Camera, State Additions, Checks
description: Last Ember gameplay systems part 4 – explore marking, the quake slot that calls planRockFall from the rocks architecture, escape sprint and exit marker, win and lose checks, score and result, fx emit/addShake/tickFx with event names, camera follow and shake, the complete list of State additions required, every architect DEFAULT, and the npm run check assertions for all systems.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:30:00Z
---

# Last Ember – Gameplay Systems (4/4)

Part 4 of 4. Previous: [[architecture-systems]] (order, screens, runs, intent, movement), [[architecture-systems-2]] (flame, pickups, mining, Beacon, minerals), [[architecture-systems-3]] (swing, parry, damage, roll). Values: [[architecture-tuning]], [[architecture-tuning-2]]. Monsters: [[architecture-monsters-ai]], [[architecture-monsters-ai-2]]. Rocks: [[architecture-rocks]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]].

## 1. Depth and explore

- `trackDepth(s)`: exactly as [[architecture-scoring-and-save]] §1 (owner `src/systems/depth.ts`). Runs in both phases.
- `stepExplore(s: State): void` (`src/systems/explore.ts`), descent only: `R = flameRadius(s)` ([[architecture-systems-2]] §1: `lightRadius` without the escape/`debug.reveal` branch, so it is never `LIGHT_ALL`; R-145), `rt = ceil(R / 32)`; for each tile in the square `±rt` around the player tile whose centre is within `R` and not yet explored: Bresenham LOS from the player tile; if no solid tile strictly between, `markExplored`. With `debug.reveal` on, exploring therefore runs at the normal flame radius (the memory map matches a normal run; never a 1e6-radius scan). Optimisation: skip entirely if the player tile and `floor(R)` are unchanged since the last call (needs State addition `world.exploreKey: number`, default `-1`, = `tile * 1024 + floor(R)`). Packing limit: valid only while `floor(R) < 1024`; `flameRadius` ≤ `T.flame.radiusMaxPx` × max `radiusMul` (≈ 170 × 1.3 ≈ 221) holds it, and the key stays < 76 800 × 1024 ≈ 7.9e7 (safe integer). A tuning change that pushes `flameRadius` to ≥ 1024 px must widen the multiplier. Worked: R = 131.9 → rt = 5 → 121 candidate tiles, ≈ 60 inside the circle, ≤ 6 LOS cells each = 360 grid reads.

## 2. Quake slot (`src/systems/quake.ts`) — rocks are owned by [[architecture-rocks]]

```ts
export function stepQuake(s: State, dt: number): void
```

This file only owns the CADENCE. Choosing a rock footprint, the route guarantee, landing, and pushing the player out are defined by the sibling task in [[architecture-rocks]] through `planRockFall(...)`. Contract consumed here (confirm against that file; if it differs, that file governs):

```
quakeT -= dt
for each rock with !landed: rock.t -= dt; if rock.t <= 0 and !rock.landed: land via the [[architecture-rocks]] API
if quakeT <= 0:
  quakeT = max(T.rocks.minIntervalS, randRange(s, 'gameplay', 0.75, 1.25) / rate(director.escapeT))  // T.rocks ramp, R-056
  if count(landed rocks) < T.escape.rocksMax (200) and pending < T.rocks.pendingMax (4): plan = planRockFall(...)   // null → quakeT = T.rocks.retryS
  if plan exists: push Rock { t: T.escape.rockWarnS, landed: false, hit: false, ... }, emit('rockWarn')
landing emits 'rockLand' and calls addShake(s, 'rockLand', distance scale)
```

`rate(e) = 0.6 + 1.0 × min(1, e / 80)` rocks/s (`T.rocks.rateStart/rateEnd/rampS`); `T.escape.rockIntervalS` is deleted (R-056). Cadence detail and the exact sketch: [[architecture-rocks]] §2 governs.

Rock hit on the player (shadow under the player at landing) costs 1 HP through `hurtPlayerHp(s, 'rock')` ([[architecture-systems-3]] §4.1, R-058/R-148): guard `debug.god || hurtT > 0`, no roll i-frames, `T.rocks.damageHp`, `T.hurt.*` timers. The shadow-overlap predicate lives in [[architecture-rocks]].

## 3. Escape phase specifics

- Transition: `lightBeacon(s)` ([[architecture-systems-2]] §5). No energy boost; flame frozen; light everywhere; monsters at the Beacon die; HUD swaps the light gauge for the exit arrow.
- Sprint: `stepMovement` uses `maxV = 240 px/s` always while moving (**spec**: always sprint, no stamina). Standing still is allowed (friction ×2 = 2200 px/s²).
- Facing = movement direction (sprite rotates to movement, [[architecture-assets-sprites]] §2).
- Exit marker (render only, no State): direction = from the player toward the next tile on the escape path field (cached, keyed by `solidSig`, [[architecture-state-3]] §5): among the 4 neighbours of the player tile pick the one with the lowest escape distance; arrow angle = `atan2` to that tile centre; if the exit is on screen draw a ring on it instead. This follows the CURRENT shortest route around landed rocks.
- Pickups: plants still heal; resin is ignored.
- Monsters: [[architecture-monsters-ai-2]] §2 (constant lunges, no ring).

### 3.1 `checkEnd(s: State): void` (`src/core/run.ts`) and score

```
if s.meta.screen !== 'playing': return
if p.hp <= 0: p.hp = 0; endRun(s, false); return                       // lose, both phases
if s.meta.phase === 'escape':
  ptx = floor(p.x / 32); pty = floor(p.y / 32)
  if max(|ptx - exit.tx|, |pty - exit.ty|) <= T.escape.winRadiusTiles: endRun(s, true)   // win
```

Lose has priority over win in the same step (a lethal bite on the exit tile is a death). `endRun` computes the result with `computeScore` exactly as [[architecture-systems]] §3 and [[architecture-scoring-and-save]] §2. Worked: win at 412 s, depth 40, 6 minerals used, 3 HP → 4000 + 1000 + 188 + 150 + 150 = **5488**.

## 4. Fx (`src/systems/fx.ts`)

```ts
export function emit(s: State, kind: FxEventKind, x: number, y: number, a = 0): void  // [[architecture-state-2]] §7
export function addShake(s: State, k: keyof typeof T.shake, scale = 1): void
export function tickFx(s: State, dt: number): void
```

- `addShake`: `mag = T.shake[k].px * scale`; `fx.shakeMag = min(T.cam.shakeMaxPx, max(currentAmp, mag))` where `currentAmp = fx.shakeMag * min(1, fx.shake / T.cam.shakeDecayS)`; `fx.shake = max(fx.shake, T.shake[k].s)`. Strongest wins, no stacking past 12 px.
- `tickFx`: `shake`, `flare`, `beaconFlash` decremented, floored at 0 (`hitstop` is decremented only by `step()` itself, [[architecture-systems]] §1.3, never by `tickFx`); events older than 30 steps pruned; queue capped at 32.
- Event names used by the systems (all members of the authoritative `FxEventKind` union in [[architecture-state-2]] §7):

| Event | Emitted by | `a` |
|---|---|---|
| `swing` | stepSwing | swing dir (rad) |
| `parryPerfect` / `parryGood` / `parryPoor` | resolveParries | δ (s) |
| `flameHit` | damagePlayer | energy lost |
| `hpHit` | `hurtPlayerHp` (bites rules 5–6, rocks; R-148) | 0 |
| `monsterDie` | monster AI on entering `dying` | kind index 0..2 |
| `flameOut` | stepFlame, stepMining, resolveParries, damagePlayer | 0 |
| `relight` | stepPickups, startRun | 0 = was out, 1 = refuel |
| `heal` | stepPickups | 0 |
| `mineTick` / `mineDone` | stepMining | progress / mineral index or −1 |
| `toss` / `shakeOff` | stepMinerals | mineral index or −1 (denied) |
| `roll` / `dodge` | stepRoll / damagePlayer | dir / 0 |
| `denied` | stepBeacon (press below `T.beacon.minStartE`) | 0 |
| `beaconLit` | lightBeacon | 0 |
| `rockWarn` / `rockLand` | stepQuake | rock size |
| `windup` / `lunge` | monster AI | kind index; windup a = beat index for devourer (`sfx_devourer-beat`) |
| `win` / `death` | endRun | 0 |

Audio mapping (from [[architecture-assets-audio-2]]): `swing`→`sfx_swing`, `parryPerfect`→`sfx_parry-perfect`, `parryGood|parryPoor`→`sfx_parry` with quality `q = 1 - u`, `flameHit`→`sfx_mon-hit`+`sfx_parry-bad`, `hpHit`→`sfx_hurt`, `monsterDie`→`sfx_mon-death`, `flameOut`→`sfx_flame-out`, `relight a=0`→`sfx_relight`, `relight a=1`→`sfx_resin`, `heal`→`sfx_plant-heal`, `mineTick`→`sfx_mine-hit`, `mineDone`→`sfx_mineral-collect` (a=−1 → `sfx_mine-empty`), `toss`→`sfx_flame-toss-<mineral>` (a=−1 → `ui_denied`), `shakeOff`→`sfx_flame-shakeoff`, `denied`→`ui_denied` (+ UI toast `'The Beacon needs more light'`), `roll`→`sfx_roll`, `windup`→`sfx_eye-open` (devourer: `sfx_devourer-beat`), `lunge`→`sfx_mon-lunge`, `beaconLit`→`sfx_beacon-ignite`+`sfx_beacon-horn`, `rockWarn`→`sfx_rock-warn`, `rockLand`→`sfx_rock-impact`, `death`→`sfx_player-death`.

## 5. Camera (`src/systems/camera.ts`)

```ts
export function stepCamera(s: State, dt: number): void
export function shakeOffset(s: State): { x: number; y: number }   // render-only helper, pure
```

```
k = 1 - exp(-T.cam.lerpPerS * dt)        // 0.1248 per step
cam.x += (p.x - cam.x) * k; cam.y += (p.y - cam.y) * k
```

No look-ahead (ponytail: add `+ facing * 24 px` lead if the screen feels cramped). Shake is applied in render only, never stored: `amp = fx.shakeMag * min(1, fx.shake / T.cam.shakeDecayS)`, offset `= amp * (noise(meta.steps, 1) * 2 - 1, noise(meta.steps, 2) * 2 - 1)` with the stateless noise of [[architecture-determinism]] §3 (no cosmetic stream draw in render). Escape adds the constant `T.escape.quakeShakePx` (2 px) to `amp`. Worked: player jumps 40 px (roll) → after 1 step cam lags 35.0 px, after 6 steps 18.0 px, after 18 steps 3.6 px.

## 6. State additions required

Fields not in [[architecture-state]] / [[architecture-state-2]] that these systems need. Each needs a default in `init()`/`initPlayer()`/`spawnMonster()`, the `DEFAULT_*` constants of [[architecture-state-3]] §3, and no `STATE_VERSION` bump (all additive).

| Field | Type | Default | Used by |
|---|---|---|---|
| `fx.hitstop` | number (s) | `0` | perfect-parry freeze ([[architecture-systems]] §1.3) |
| `player.swing.buffer` | number (s) | `0` | swing input buffer |
| `Monster.contactT` | number (s, lunge time of latch; −1 none) | `-1` | bite latch ([[architecture-systems-3]] §4) |
| `Monster.stuckT` | number (s) | `0` | wall stuck detection ([[architecture-monsters-ai-2]] §4) |
| `Monster.lastX`, `Monster.lastY` | number (px) | spawn x, y | stuck detection |
| `Monster.fleeing` | boolean | `false` | caught inside the light → flee ([[architecture-monsters-ai]] §2) |
| `Monster.behindT` | number (s) | `0` | stalker time spent behind ([[architecture-monsters-ai]] §3) |
| `Monster.beat` (exists in state-2 §2) | number, 0-based beat INDEX | `0` | windup event `a` for the devourer; beat COUNT stays `T.monsters[k].beats` (R-130) |
| `Pickup.size` | `'small' \| 'large'` | `'small'` | resin amount (25 / 50 E); generator places large resin in zones 2–4 and the Beacon cluster ([[architecture-scale-and-economy-2]] §3.1) |
| `world.exploreKey` | number | `-1` | explore skip cache key (small, JSON-safe) |
| `FxEventKind` members `'dodge'`, `'windup'`, `'lunge'`, `'denied'` (+ UI kinds) | union additions, **applied** | – | events in §4; authoritative list in [[architecture-state-2]] §7. `denied` = Beacon START GATE ([[architecture-systems-2]] §5); its toast reuses `ui.toasts` (no new field) |
| `world.pendingSig`, `director.escapeT`, `Rock.shrunk` | number / number / boolean | `0` / `0` / `false` | rock cadence and route cache, defined in [[architecture-rocks]] §1 (listed here for completeness) |
| `Debug.overlay` | boolean | `false` | AI debug overlay ([[architecture-monsters-ai-2]] §9) |

`Director.alive` stays as specified (stored mirror rebuilt each step by `stepDirector`). `ParryGrade` already has `'perfect' | 'good' | 'poor'`. `monster.stunned` / ai `'stunned'` is reused for the wall bonk (`T.ai.bonkS`).

## 7. DEFAULT (architect) choices made in the systems files

1. Radius curve exponent 0.5 (area-linear) with min 40 / max 170 / out 22 px.
2. Burn per zone 0.5/0.7/1.0/1.4 E/s; mining costs 3 E/s; Beacon hold costs 4 E/s, floors at 1 E and may only start at ≥ 40 E (press below is denied, costs nothing). Binding values: [[architecture-scale-and-economy-2]] §2.
3. Lit-flame hit kills the attacker and costs `energyHitE` 12/20/35 E; overflow never spills into HP.
4. Every graded parry kills all three kinds; perfect = ±35 ms around the PLANNED contact; late is punished harder than early; parry loss capped at 80 % of a hit.
5. Bite delay `lateMaxS` after latch in descent (parry window), 0 in escape.
6. Hurt invulnerability: 0.4 s after a flame hit, 0.8 s after an HP hit. During `hurtT`, a shade that reaches a LIT flame still dies at it (no energy loss, no kill credit); flame out or escape: it recovers (R-149).
7. Mineral effect kept after relight; toss consumes 1; swap/back costs a piece; same-type re-toss allowed; toss into a dead flame denied; shake-off no refund.
8. Beacon: energy frozen, not boosted; monsters near the Beacon die (not counted as kills); first rock at 1.5 s; escape horde after 1 s.
9. Escape: resin ignored, plants still heal, sprint 240 px/s always, roll 0.3 s / 126 px / i-frames vs bites only.
10. Swing input buffer 0.10 s; hitstop 60 ms on perfect.
11. Screen keys: Enter/click start, H help, Esc/P pause, Q quit to title from pause, T retry seed, C copy link; Digit1–3 select, F toss, G shake-off, E interact, Space roll.
12. Pickup radius 24 px centre distance; mining reach 40 px; Beacon reach 36 px.

## 8. Checks (`src/checks/systems.check.ts`, DOM-free, imported by `src/checks/all.ts`)

1. `baseRadius`: `(100) = 170`, `(50) ≈ 131.92`, `(0) = 22`; monotonic on 0..100; with `T.flame.curveExp` temporarily set to 1 (restored after), `(50) = 105` (proves the curve reads `T`, R-144). `flameRadius` with `debug.reveal = true` equals the value with reveal off (R-145).
2. `parryLoss`: every row of [[architecture-systems-3]] §3.2 within 0.01 E; `δ = −2/60` is perfect; copper loss < plain loss for the same δ.
3. Flame burn: `init`, `startRun(s,'1')`, force zone 1, energy 10, step 1200 with no input: energy 0 exactly, one `flameOut` event, never negative.
4. Damage table: build a lunging lurker latched on the player; lit flame → energy −12, monster `dying`, kills +1; flame out → hp −1, monster `recover`; escape + `roll.invuln > 0` → no change, `dodge` emitted; `hurtT > 0` with lit flame → energy unchanged, monster `dying`, kills unchanged (R-149); `hurtT > 0` with flame out → no change, monster `recover`. `hurtPlayerHp(s, 'rock')` with `roll.invuln > 0` → hp −1 (rolls never dodge rocks); with `hurtT > 0` → returns false, hp unchanged.
5. Mining: hold `KeyE` at a vein for exactly 120 steps → vein removed on step 120, not 121 (`progress + 1e-9 >= holdS`, R-127), minerals +pieces (capped 3), energy dropped by `≥ 6`; moving at step 60 → progress 0, vein kept.
6. Minerals: the worked sequence of [[architecture-systems-2]] §6 yields copper 0, sodium 1, used 2, then denied.
7. Beacon: zone 4, e = 40.0 exactly at the Beacon (gate reads the start-of-step snapshot `max(eStart, e)`, R-125, so the press step's burn to 39.98 does not deny), hold 300 steps → `phase === 'escape'` on step 300 exactly (`phase === 'descent'` after step 299; `beaconHold + 1e-9 >= holdS`, R-127), `beaconLit`, energy = 40 − 300 × 5.4 / 60 ≈ 13.0 (±0.1) and ≥ 1, all monsters `dying`.
7a. Beacon START GATE: zone 4, e = 39.9 at the Beacon, press `KeyE` (edge) and hold 300 steps → exactly one `denied` event, `beaconHold === 0` on every step, `phase === 'descent'`, `beaconLit === false`, energy dropped only by passive burn (39.9 − 300 × 1.4 / 60 = 32.9 ± 0.01; no hold cost). Then set e = 40.0, release and press again → hold starts (`beaconHold > 0` next step), no `denied`. 7b. Pickup on the press step: e = 30, small resin under the player, press → hold starts (`max(30, 55 − burn) >= 40`), no `denied`.
8. Collision: player pushed into a wall for 120 steps never overlaps a solid tile (`closest-point distance >= r - 1e-6`).
9. Screens: `title` + Enter → `playing`; Blur → `paused`; `dead` + Enter within 0.5 s → still `dead`.
10. Determinism: two runs with the same seed and scripted input are `JSON.stringify`-equal after 1800 steps ([[architecture-determinism]] §7).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-rocks]]
- [[architecture-scoring-and-save]]
- [[architecture-determinism]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-sprites]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-rulings]]

---
type: architecture
title: Last Ember – Gameplay Systems (2/4) – Flame, Pickups, Mining, Beacon, Minerals
description: Last Ember gameplay systems part 2 – lightRadius and insideLight shared by update and render, stepFlame burn and flame-out transition, resin and plant pickups, mining hold with cancel and completion, Beacon hold and lightBeacon, mineral select, toss and shake-off rules, each with signature, reads/writes, formulas, fx events, edge cases and worked numbers.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:10:00Z
---

# Last Ember – Gameplay Systems (2/4)

Part 2 of 4. Previous: [[architecture-systems]] (order, screens, intent, movement). Next: [[architecture-systems-3]] (swing, parry, damage, roll), [[architecture-systems-4]] (rocks, phase change, escape, end, score, fx, camera, State additions). Values: [[architecture-tuning]], [[architecture-tuning-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]].

Notation: `p = s.player`, `e = p.energy`, `M = T.minerals.table[p.activeMineral]`, `z = s.meta.zone`.

## 1. Light radius and the inside-light predicate (`src/systems/light.ts`)

ONE module used by `update` (AI, director, explore) and `render` (mask, eyes vs body). Pure functions of State; no writes.

```ts
export const LIGHT_ALL = 1e6
export function baseRadius(e: number, eMax = T.flame.energyMax): number // [[architecture-tuning]] §3.1 R_base
export function lightRadius(s: State): number           // gameplay radius incl. mineral and devourer push
export function flameRadius(s: State): number           // lightRadius without the escape/reveal branch (R-145)
export function insideLight(s: State, x: number, y: number, pad = 0): boolean
export function lightFrac(s: State): number             // e / p.energyMax in descent, 1 in escape
```

```
F = T.flame
baseRadius(e, eMax) = e <= 0 ? F.radiusOutPx
                    : F.radiusMinPx + (F.radiusMaxPx - F.radiusMinPx) * (e / eMax) ** F.curveExp   // R-144: no literals
flameRadius(s) = (e <= 0 ? F.radiusOutPx : baseRadius(e, p.energyMax) * M.radiusMul) * devourerMul(s)
lightRadius(s) = phase === 'escape' || debug.reveal ? LIGHT_ALL : flameRadius(s)
insideLight(s, x, y, pad) = (x - p.x)^2 + (y - p.y)^2 <= (lightRadius(s) + pad)^2
```

`baseRadius` reads every curve value from `T.flame` so a live edit of `radiusMinPx`, `radiusMaxPx` or `curveExp` takes effect on the next step (R-144, [[architecture-rulings-3]] §5). `flameRadius` passes the State value `p.energyMax` (R-146). `LIGHT_ALL` is for the predicate only: `stepExplore` uses `flameRadius` and never `LIGHT_ALL` ([[architecture-systems-4]] §1, R-145).

`devourerMul(s)` is in [[architecture-monsters-ai-2]] §1 (1.0 when no devourer is near). Rule: `debug.reveal` changes the radius but not any rng draw count ([[architecture-determinism]] §6 rule 6). Light is centred on the player (the torch tip offset of 12 px is visual only). No wall occlusion for the predicate (raycast shadows are a stretch goal, **spec**); the render mask may later add occlusion, the predicate must then use the same LOS function.

Worked: e = 36, copper, no devourer: `40 + 130 × 0.6 = 118` px. Monster at 110 px → inside; with `pad = −9` (body must be fully inside) → 110 ≤ 109 false.

## 2. `stepFlame(s: State, dt: number): void` (`src/systems/flame.ts`)

Reads: `meta.phase`, `meta.zone`, `player.energy`, `player.activeMineral`, `player.mining`, `player.beaconHold`, `debug.god`. Writes: `player.energy`. Emits: `flameOut`.

```
if phase === 'escape' or debug.god: return
if e <= 0: return                                   // out: nothing burns
burn = zt(T.flame.burnPerS, z) * M.burnMul
floor = p.beaconHold > 0 ? T.beacon.minEnergyE : 0
e = max(floor, e - burn * dt)
if e <= 0: e = 0; emit(s, 'flameOut', p.x, p.y)
```

Mining and Beacon costs are charged by their own systems (§4, §5); `stepFlame` charges only the passive burn.

Flame-out transition consequences (all derived from `e <= 0`, no flag): radius → 22 px; parry impossible (`stepSwing` still swings the stick — the swing anim and `swing` sound play — but `resolveParries` skips when `e <= 0`); a bite costs 1 HP; director spawn interval ÷ 1.5; lunge hazard × 2.5; mining cannot start (needs `e > 0`); the Beacon hold cannot start (START GATE needs `e >= T.beacon.minStartE` = 40, §5).

Worked: zone 2, sodium, e = 10: burn = 0.7 × 1.5 = 1.05 E/s → 0.0175 E/step → flame out after 572 steps (9.5 s) if nothing else drains it. Zone 4 plain: 1.4 E/s, a full bar lasts 71 s ([[architecture-scale-and-economy-2]] §2).

Floating point: `e` is clamped to exactly 0 so `flameOut(p)` is stable; there is no NaN path (`dt` constant, tuples indexed by clamped zone).

## 3. `stepPickups(s: State): void` (`src/systems/pickups.ts`)

Reads `pickups`, `player`. Writes `pickups` (splice), `player.energy`, `player.hp`, `player.stats.resinUsed/plantsEaten`. Emits `relight` (flame was out) or `heal`; a resin on a lit flame emits `relight` with `a = 1` so audio plays `sfx_resin` instead of `sfx_relight` (`a = 0` = was out). Iterate backwards so splicing is safe.

```
for i from pickups.length-1 down to 0:
  rr = T.player.radiusPx + T.pickup.radiusPx             // R-074: 10 + 14 = 24
  k = pickups[i]; if (k.x-p.x)^2 + (k.y-p.y)^2 > rr^2: continue
  if k.kind === 'resin':
    if phase === 'escape': continue                     // torch not needed; resin stays
    wasOut = e <= 0
    e = min(p.energyMax, e + (k.size === 'large' ? T.resin.largeE : T.resin.smallE))   // size: State addition; cap R-146
    stats.resinUsed += 1; splice; emit('relight', k.x, k.y, wasOut ? 0 : 1)
  if k.kind === 'plant':
    if p.hp >= p.hpMax: continue                         // cannot be stored; stays (spec)
    p.hp = min(hpMax, hp + 1); stats.plantsEaten += 1; splice; emit('heal', k.x, k.y)
```

Mineral effect persistence across relight: **DEFAULT (architect) = kept** (spec ASSUMPTION / [[last-ember-open-questions]] #2). Resin never touches `activeMineral`.

Worked: e = 0 (out), resin small → e = 25, radius 22 → 105.0 px (plain) in one step; event `relight a=0`. Large resin at e = 60 → 100 (10 E lost to the cap).

## 4. `stepMining(s: State, it: Intent, dt: number): void` (`src/systems/mining.ts`)

Reads `veins`, `player`, intent. Writes `player.mining`, `player.energy`, `player.minerals`, `player.stats.mineralsMined`, `veins` (splice). Emits `mineTick` (a = progress 0..1), `mineDone` (a = mineral index 0..2, or `a = -1` for "pouch full"). Mining never writes `ui.toasts` (owner: `src/systems/screens.ts`, R-003); the screen machine turns `mineDone a=-1` into the toast `'Pouch full'`.

Vein face point: the point on the shared edge of `vein.tile` and `vein.stand`, i.e. `fx = (cx(tile) + cx(stand)) / 2`, `fy = (cy(tile) + cy(stand)) / 2` with tile centres `tx*32+16`.

Target choice (each step): nearest vein with `dist(p, face) <= T.mining.reachPx` (40); ties → lower `id`.

| Condition | Effect |
|---|---|
| `!it.interact` or `it.moving` or `e <= 0` or no target in reach or `roll.t > 0` | `mining = { targetTile: -1, progress: 0 }` (cancel, progress lost) |
| target tile ≠ `mining.targetTile` | `targetTile = target.tile`, `progress = 0` |
| `minerals[target.mineral] >= 3` | no progress; on `interactEdge` emit `mineDone a=-1` (pouch full); `progress = 0` |
| otherwise | `progress += dt`; `e = max(0, e - T.mining.costPerS * dt)`; on crossing a multiple of `tickS` (0.5 s) emit `mineTick` |
| `progress + 1e-9 >= T.mining.holdS` (2 s; ε per R-127, so 120 steps complete it) | `minerals[m] = min(3, minerals[m] + vein.pieces)`; `stats.mineralsMined += added`; splice vein; `mining = { -1, 0 }`; emit `mineDone a = MINERALS.indexOf(m)` |

Tick crossing test: `floor((progress + 1e-9) / tickS) > floor((progress - dt + 1e-9) / tickS)` (same ε as completion, R-127).

`mineDone a = -1` (pouch full) is KEPT as a `mineDone` value, not a separate kind. Audio contract: the trigger table ([[architecture-resources-2]] §8, owned by the audio spec) maps `mineDone a=-1` to a DISTINCT 'empty' sound (`sfx_mine-empty`, as [[architecture-systems-4]] §6 lists), never to `sfx_mineral-collect`; the UI maps it to the toast `'Pouch full'` (R-134 in [[architecture-rulings-3]]).

`stepFlame` runs BEFORE mining in the step, so a zero caused by the mining cost is handled here: if `e` reaches 0 during mining, set `e = 0`, emit `flameOut`, and cancel mining (progress lost). "Moving" means `it.moving` (movement keys held); descent has no knock-back, so only the player can break the hold.

Worked: zone 1 plain, e = 40, mining 2 s: burn 0.5 × 2 = 1.0 E, mining 3 × 2 = 6.0 E → e = 33.0 (zone 4: burn 2.8 E → 31.2); vein `pieces = 2` copper, carrying 2 → copper = 3 (added 1, `mineralsMined += 1`).

## 5. `stepBeacon(s, it, dt, eStart): void` and `lightBeacon(s): void` (`src/systems/beacon.ts`)

Reads `world.beacon`, `world.beaconLit`, `player`, intent. Writes `player.beaconHold`, `player.energy`; `lightBeacon` writes `world.beaconLit`, `meta.phase` (owner per [[architecture-state-3]] §6), `director.quakeT`, `fx.beaconFlash`, `fx.shake/shakeMag`, `monsters` (set to `dying`). Emits `denied` (gate) and `beaconLit`; the audio layer plays `sfx_beacon-charge` while `beaconHold > 0` (polled from State, not an event), `ui_denied` on `denied`, and `sfx_beacon-ignite` + `sfx_beacon-horn` on `beaconLit`. Like mining, this system never writes `ui.toasts`: `src/systems/screens.ts` (R-003) turns `denied` into the toast `'The Beacon needs more light'`.

**START GATE** ([[architecture-scale-and-economy-2]] §2, binding): a hold may START only with `gateE >= T.beacon.minStartE` (40), where `gateE = max(eStart, e)` (R-125, [[architecture-rulings-3]] §4): `eStart` = `player.energy` read by `step()` BEFORE `stepFlame` (a local passed in, no State field), `e` = current energy (includes resin picked this step by `stepPickups`). Below the gate the press is DENIED: `denied` is emitted once on the press edge (`it.interactEdge`), no energy is spent, `beaconHold` stays 0 (no hold progress). Holding the key below the gate does nothing more (no repeated events). Once started, the gate is not re-checked: cost 4 E/s, floor 1 E, releasing resets to 0 and a new start needs the gate again.

```
if world.beaconLit: return
near = dist(p, beaconCentre) <= T.beacon.reachPx (36)
if !near or !it.interact or it.moving: beaconHold = 0; return
if beaconHold > 0 and e <= 0: beaconHold = 0                // a hit emptied the flame mid-hold: hold cancelled
if beaconHold === 0 and max(eStart, e) < T.beacon.minStartE: // START GATE, R-125 (also covers e <= 0)
  if it.interactEdge: emit(s, 'denied', p.x, p.y)            // toast + ui_denied; no cost, no progress
  return
beaconHold += dt
e = max(T.beacon.minEnergyE, e - T.beacon.costPerS * dt)  // never below 1 E once started (no soft lock)
if beaconHold + 1e-9 >= T.beacon.holdS: lightBeacon(s)     // ε (R-127): 300 steps of 1/60 reach 5 s
```

Float note (R-127): 300 × (1/60) accumulates to 4.99999…, so a bare `>=` would need 301 steps. Every accumulated-time threshold in systems uses the same `+ 1e-9` as `resolveBites` ([[architecture-systems-3]] §4).

HUD (render only, no State): while the player is within 8 tiles of the Beacon in descent, the light gauge draws a tick at `minStartE` (40 E).

`lightBeacon(s)` — phase transition (spec: "torch no longer needed"):

1. `world.beaconLit = true`, `meta.phase = 'escape'`, `player.beaconHold = 0`, `player.mining = { -1, 0 }`.
2. **Flame/energy:** `energy` is FROZEN at its current value (not boosted, not zeroed). It no longer burns or matters for damage. **DEFAULT (architect).** Reason: zeroing would make the HUD/flame read "out"; keeping it is free and lets render draw the hand torch as an extinguished stick. `activeMineral` stays (only cosmetic now).
3. **Light:** `lightRadius` returns `LIGHT_ALL`; render draws the whole cave lit with the zone ambient ([[architecture-assets-style]]), Beacon glow and the escape marker. The light-radius gauge is gone from the HUD; HP pips become the only gauge; the mineral hotbar is hidden; the exit arrow appears.
4. **Monsters:** every live monster → `ai = 'dying'`, `aiDur = T.monsters[kind].dyingS` (the blast of light kills them); they do NOT count as kills. Entry goes through `setDying(s, m)` (R-073). `director.spawnT = T.escape.firstSpawnS` (1.0 s) so the escape horde arrives after 1 s (R-147).
5. **Rocks:** `director.quakeT = T.escape.firstRockS` (1.5 s).
6. **Fx:** `fx.beaconFlash = T.beacon.flashS` (1.2 s); shake through the same strongest-wins rule as `addShake` ([[architecture-systems-4]] §4): `fx.shakeMag = min(T.cam.shakeMaxPx, max(currentAmp, T.beacon.shakePx))` (8 px), `fx.shake = max(fx.shake, T.beacon.shakeS)` (1.0 s); `emit('beaconLit', beacon x, y)` (R-147).
7. `stats.maxDepth` already 40 (standing at the Beacon).

Floor coupling: while `beaconHold > 0`, `stepFlame` also clamps its burn at the floor: `e = max(T.beacon.minEnergyE, e - burn * dt)`. Otherwise the passive burn could put the flame out mid-hold.

Gate timing (R-125): `stepFlame` runs before `stepBeacon` ([[architecture-systems]] §1.1), so a bare `e` test would read 39.98 for a player at exactly 40.00 in zone 4 and deny. The gate therefore uses `max(eStart, e)`: the start-of-step value makes "the bar shows 40, the press works" true, and `e` keeps a resin picked on the press step counting. Arrival at exactly 40.00 → accepted; at 39.99 → denied. Worked: zone 4 hold started at e = 40: total drain (1.4 + 4.0) E/s × 5 s = 27 E → e = 13.0 at completion; the floor is never touched by a gated hold (40 > 27). Arrival at e = 72.8 (mid with the Beacon cluster, [[architecture-scale-and-economy-3]] §1.2) → 45.8. Arrival at e = 11.1 (mid without the cluster) or e = 0: the press is denied (`denied`, toast), the press costs nothing (only the passive burn continues), `beaconHold` 0; fetch the cluster resin (≤ 34 tiles back) and press again. Floor case (only if the gate is lowered below 27 in tuning): start at 20 → 1 E floor after 3.52 s, the rest of the hold costs nothing.

## 6. `stepMinerals(s: State, it: Intent): void` (`src/systems/flame.ts`)

Reads intent, `player.minerals`, `player.activeMineral`, `player.selected`. Writes `selected`, `activeMineral`, `minerals`, `stats.mineralsUsed`. Emits `toss` (a = mineral index), `shakeOff`, and `toss` with `a = -1` for "denied" (audio `ui_denied`).

| Action | Guard | Effect |
|---|---|---|
| `it.select = m` | – | `selected = m` (no consumption; hotbar cursor) |
| `it.toss` | `minerals[selected] >= 1` and `e > 0` | `minerals[selected] -= 1`, `activeMineral = selected`, `stats.mineralsUsed += 1`, emit `toss a = index` |
| `it.toss` | `minerals[selected] === 0` or `e <= 0` | emit `toss a = -1` (denied); nothing changes |
| `it.toss` | `selected === activeMineral` and count ≥ 1 | allowed: consumes a piece, effect unchanged (refresh; counts for score) |
| `it.shake` | `activeMineral !== 'none'` | `activeMineral = 'none'`, emit `shakeOff`; no refund |
| `it.shake` | already `'none'` | nothing |

Rules (DEFAULT, architect, matching spec ASSUMPTIONS): one toss consumes one piece; the effect lasts until another toss or a shake; swapping to another type consumes a new piece of that type; swapping BACK costs another piece; the effect survives flame-out and relight; tossing into a dead flame is denied (nothing to colour). Re-tossing the same type is allowed so the player can farm score deliberately; it costs a piece, so the trade is honest.

Worked: carrying sodium 2, copper 1, active none. `Digit2` → selected copper. `F` → copper 0, active copper, used 1. `Digit1`, `F` → sodium 1, active sodium, used 2. `G` → active none. `Digit2`, `F` → denied (copper 0).

Edge: selecting a type with 0 pieces is allowed (cursor), the hotbar greys it.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-open-questions]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-assets-style]]
- [[architecture-assets-audio-2]]
- [[architecture-determinism]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]

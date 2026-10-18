---
type: architecture
title: Last Ember – Tuning Architecture (1/2) – tuning.ts Shape, Player, Flame, Actions, Parry
description: Exact shape of src/core/tuning.ts for Last Ember and all initial values for player movement, flame energy and radius curve, flicker, resin, plant, mining, Beacon hold, swing, parry window and loss curve, roll and hurt invulnerability, with units, formulas and worked numbers.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:00:00Z
---

# Last Ember – Tuning Architecture (1/2)

Part 1 of 2. Next: [[architecture-tuning-2]] (monsters, director, escape, minerals, camera, score, live-tuning workflow, top-8 feel knobs). Systems that read these values: [[architecture-systems]], [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]]. Monster AI: [[architecture-monsters-ai]], [[architecture-monsters-ai-2]]. Hub: [[architecture]]. Spec (governs): [[last-ember-design]]. State (governs field names): [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]].

Every number here is **DEFAULT (architect)** unless the row says **spec**. All values are start values for the Day 4 tension test ([[last-ember-production-plan]]).

## 1. Module contract

- File: `src/core/tuning.ts`. Pure data, no imports except `import type { MonsterKind, FlameKind } from './types.ts'`. No functions except the tiny lookup helpers in §1.3. No side effects.
- One exported object `T`, written as a plain object literal. "Readonly by convention": systems never assign into `T` (reviewers grep `T\.[a-zA-Z.]+ *=`). No `as const` (it would turn tuples into readonly literal types and make editing a number a type change; `satisfies Tuning` keeps the shape checked).
- Units are in the key names: `S` = seconds, `Px` = world px, `PxS` = px/s, `PxS2` = px/s², `PerS` = per second, `Deg` = degrees, `Rad` = radians, `E` = flame energy units (0..100), `Mul` = multiplier (1 = no change), `Hz`. Per-zone values are 4-tuples indexed `zone - 1`.
- Names used in [[architecture-state]] §8 map onto `T` (refinement, same values): `SWING_ACTIVE = T.swing.activeS`, `SWING_COOLDOWN = T.swing.cooldownS`, `ROLL_TIME = T.roll.durationS`, `ROLL_COOLDOWN = T.roll.cooldownS`, `ROLL_INVULN = T.roll.invulnS`, `MINE_TIME = T.mining.holdS`, `BEACON_HOLD = T.beacon.holdS`, `HURT_INVULN = T.hurt.hpInvulnS`, `HIT_FLASH = T.hurt.flashS`, `MINERAL_CAP = T.minerals.cap`, `MONSTERS_MAX = T.director.monstersMax`, `ROCK_WARN = T.escape.rockWarnS`, `ROCKS_MAX = T.escape.rocksMax`.

### 1.1 Type

```ts
// src/core/tuning.ts
import type { MonsterKind, FlameKind } from './types.ts'

type Z4 = [number, number, number, number] // per zone 1..4, index zone-1
type MonsterTune = {
  radiusPx: number; hp: number
  ringSpeedPxS: number; chaseSpeedPxS: number; steerPerS: number
  ringFactor: number; ringMarginPx: number; orbitRadS: number
  driftAmpPx: number; driftHz: number
  lungeChancePerS: Z4          // base hazard rate while eligible (lurker/devourer); stalker uses it while behind
  telegraphS: number           // total windup (devourer: both beats)
  beats: number                // 1 = single telegraph, 2 = devourer two-beat
  lungeRangePx: number         // windup may start only if distance to player <= this
  contactS: number             // planned lunge time to reach the player = PERFECT_AT[kind]
  biteSlackPx: number; lungeOverrunS: number
  recoverS: number; lungeCdS: [number, number]; lungeCdStartS: [number, number]
  energyHitE: number           // flame energy removed by a hit while lit (spec: scales with size)
  dyingS: number
  escapeStrikePx: number; escapeLeadS: number; escapeLungeCdS: [number, number]
}
type MineralTune = {
  radiusMul: number; burnMul: number; attractMul: number
  perfectMul: number; lossMul: number; flickerMul: number
  core: string; mantle: string; deep: string; spark: string // hex, from [[architecture-assets-style]] §4
}
export type Tuning = {
  player: { radiusPx: number; walkPxS: number; accelPxS2: number; frictionPxS2: number; facingStart: number; hpMax: number }
  flame: {
    energyMax: number; burnPerS: Z4; radiusMinPx: number; radiusMaxPx: number; radiusOutPx: number
    curveExp: number; flickerAmp: number; flickerLowAmp: number; flickerLowBelowE: number
    flickerHzA: number; flickerHzB: number; flameHitInvulnS: number
  }
  resin: { smallE: number; largeE: number }
  plant: { healHp: number }
  pickup: { radiusPx: number }
  mining: { holdS: number; costPerS: number; reachPx: number; tickS: number }
  beacon: { holdS: number; costPerS: number; minStartE: number; minEnergyE: number; reachPx: number; flashS: number; shakeS: number; shakePx: number }
  minerals: { cap: number; table: Record<FlameKind, MineralTune> }
  swing: { arcDeg: number; reachPx: number; activeS: number; cooldownS: number; bufferS: number }
  parry: {
    perfectS: number; earlyMaxS: number; lateMaxS: number
    lossMinFrac: number; lossMaxFrac: number; lossExp: number; minSpanS: number; goodSplit: number
    hitstopS: number; flareS: number
  }
  roll: { durationS: number; speedPxS: number; invulnS: number; cooldownS: number }
  hurt: { hpInvulnS: number; flashS: number }
  monsters: Record<MonsterKind, MonsterTune>
  devourerLight: { pushMax: number; nearPx: number; farPx: number }
  director: {
    monstersMax: number; maxAlive: Z4; spawnIntervalS: Z4; weights: Record<MonsterKind, Z4>
    devourerMax: number; spawnGapPx: [number, number]; spawnTries: number
    despawnPx: number; flameOutSpawnMul: number; attackSlots: Z4; firstSpawnS: number
  }
  ai: {
    separationPx: number; separationPxS: number; stuckFrac: number; stuckNudgeS: number
    stuckRelocateS: number; fleeMul: number; eyeRangeExtraPx: number; darkLungeMul: number
    flameOutLungeMul: number; stalkerBehindDeg: number; stalkerArcPx: number; bonkS: number
  }
  escape: {
    sprintMul: number; accelPxS2: number; maxAlive: number; spawnIntervalS: number
    spawnGapPx: [number, number]; despawnPx: number
    rockWarnS: number; rocksMax: number; firstRockS: number; firstSpawnS: number   // rockIntervalS deleted (R-056); firstSpawnS R-147
    quakeShakePx: number; winRadiusTiles: number
  }
  rocks: { // cadence + selection, values [[architecture-rocks]] §2–§4
    rateStart: number; rateEnd: number; rampS: number; minIntervalS: number; retryS: number
    pendingMax: number; p2Start: number; p2End: number; damageHp: number
    lookahead: number; routeModeP: number; lateralTiles: number; exitClearTiles: number
    beaconClearTiles: number; playerGapPx: number; detourMaxTiles: number; detourMaxFrac: number
    bfsTestsMax: number
  }
  cam: { lerpPerS: number; shakeMaxPx: number; shakeDecayS: number }
  shake: Record<'flameHit' | 'hpHit' | 'rockLand' | 'parryPerfect', { s: number; px: number }>
  score: { depthPts: number; winPts: number; timeCapS: number; mineralPts: number; hpPts: number }
}
export const T = { /* values: §2–§9 here and [[architecture-tuning-2]] */ } satisfies Tuning
```

### 1.2 Why one object

ponytail: one literal object instead of 60 named `const`s. One import (`import { T } from '../core/tuning.ts'`), one file to edit live, and `satisfies` catches a typo in a key. Ceiling: a deep path like `T.monsters.lurker.lungeCdS[1]` is long; that is fine for a jam.

### 1.3 Helpers (the only code in the file)

```ts
export const zt = (v: Z4, zone: number): number => v[Math.min(4, Math.max(1, zone)) - 1]
export const deg = (d: number): number => (d * Math.PI) / 180
```

## 2. View and player

No view tuning key: zoom is `viewZoomCss(view.h, view.dpr)` from `src/core/view.ts` (R-131, [[architecture-render]] §4.1); `view.heightPx` and `VIEW_H = 360` are deleted.

| Key | Value | Unit | Notes |
|---|---|---|---|
| `player.radiusPx` | 10 | px | matches sprite collision radius ([[architecture-assets-sprites]] §4.1) |
| `player.walkPxS` | 120 | px/s | 3.75 tiles/s ([[architecture-state]] §3) |
| `player.accelPxS2` | 900 | px/s² | 0 → 120 px/s in 0.133 s (8 steps) |
| `player.frictionPxS2` | 1100 | px/s² | 120 → 0 in 0.109 s (7 steps); slightly snappier stop than start |
| `player.facingStart` | π/2 | rad | facing down into the cave |
| `player.hpMax` | 5 | pips | copied to `player.hpMax` by `initPlayer()` per run, like `flame.energyMax` → `player.energyMax`; systems read the State value (R-146) |
| `escape.sprintMul` | 2.0 | × | **spec** ~2× walk: 240 px/s, no stamina |
| `escape.accelPxS2` | 1800 | px/s² | same 0.133 s ramp at sprint speed |

## 3. Flame

| Key | Value | Unit | Notes |
|---|---|---|---|
| `flame.energyMax` | 100 | E | shared vocabulary |
| `flame.burnPerS` | `[0.50, 0.70, 1.00, 1.40]` | E/s | zone 1..4 ([[architecture-scale-and-economy-2]] §2, binding); full flame lasts 200 / 143 / 100 / 71 s with no other drain |
| `flame.radiusMinPx` | 40 | px | radius at energy → 0⁺ (still lit) |
| `flame.radiusMaxPx` | 170 | px | radius at energy 100, plain flame; < view half-height 180 so the edge is on screen |
| `flame.radiusOutPx` | 22 | px | flame OUT: ember glow so the player stays minimally visible (**spec**) |
| `flame.curveExp` | 0.5 | – | radius curve exponent, see §3.1 |
| `flame.flickerAmp` | 0.03 | × radius | render-only wobble |
| `flame.flickerLowAmp` | 0.10 | × radius | extra wobble added linearly as energy goes from `flickerLowBelowE` to 0 |
| `flame.flickerLowBelowE` | 25 | E | |
| `flame.flickerHzA`, `flickerHzB` | 7.3, 11.1 | Hz | two non-harmonic sines |
| `flame.flameHitInvulnS` | 0.4 | s | invulnerability after a hit absorbed by the lit flame |

### 3.1 Radius curve (decision: area-linear, exponent 0.5)

```
R_base(e) = e <= 0 ? radiusOutPx
          : radiusMinPx + (radiusMaxPx - radiusMinPx) * (e / energyMax) ^ curveExp
```

Candidates compared:

| e (E) | linear k=1 | **area-linear k=0.5** | panic k=0.3 |
|---|---|---|---|
| 100 | 170 | **170** | 170 |
| 75 | 137.5 | **152.6** | 159.2 |
| 50 | 105 | **131.9** | 145.6 |
| 25 | 72.5 | **105.0** | 125.8 |
| 10 | 53.0 | **81.1** | 105.2 |
| 4 | 45.2 | **66.0** | 89.5 |
| 1 | 41.3 | **53.0** | 72.7 |
| 0 | 22 (out) | **22 (out)** | 22 (out) |

Justification for 0.5:

- The lit area above the minimum disc grows linearly with fuel for `radiusMin = 0`, so "half the light area = half the fuel" is a physically honest gauge. The 50 % safety rule of [[last-ember-design]] reads as "the light is still about three quarters as wide".
- Linear loses half its radius at 50 E and feels "dying" for the whole second half of a refill: no tension curve, just gloom.
- k = 0.3 hides the danger until ~10 E and then collapses; players feel cheated because the gauge lied. k = 0.5 gives a visible, accelerating squeeze in the last 25 E (105 → 53 px) = the panic beat, while still being honest.

Full gameplay radius (one function, used by update AND render, defined in [[architecture-systems-2]] §1):

```
lightRadius(s) = phase === 'escape' ? LIGHT_ALL (1e6, never stored)
               : energy <= 0 ? radiusOutPx * devMul
               : R_base(energy) * mineral.radiusMul * devMul
devMul = devourer light push, [[architecture-monsters-ai-2]] §1
```

Flicker is render-only and never feeds gameplay:

```
amp = flickerAmp * mineral.flickerMul + (e < flickerLowBelowE ? flickerLowAmp * (1 - e / flickerLowBelowE) : 0)
R_draw = lightRadius(s) * (1 + amp * 0.5 * (sin(2π*7.3*t) + sin(2π*11.1*t + 1.7)))   // t = meta.time
```

Example: e = 10, plain, t = 0.05 s: amp = 0.03 + 0.10 × 0.6 = 0.09; sines = sin(2.293) + sin(5.187) = 0.751 − 0.889 = −0.138; R_draw = 81.1 × (1 − 0.0062) = 80.6 px.

## 4. Resin, plant, pickup radius

| Key | Value | Unit | Notes |
|---|---|---|---|
| `resin.smallE` | 25 | E | relight instantly + refuel (**spec**); 25 E ≈ 50 s of zone-1 burn, 18 s of zone-4 burn ([[architecture-scale-and-economy-2]] §2) |
| `resin.largeE` | 50 | E | exactly 2 smalls; Beacon cluster 1 L + 2 S = 100 E; needs `Pickup.size` (State addition, see [[architecture-systems-4]] §6); until then every resin is small |
| `plant.healHp` | 1 | pip | **spec** |
| `pickup.radiusPx` | 14 | px | pickup when `dist(player, pickup) <= player.radiusPx + 14 = 24` ([[architecture-state-2]] §3) |

Energy is clamped: `energy = min(p.energyMax, energy + amount)` (State value, R-146). Resin at 90 E is still consumed (it is a pickup, not a storable item).

## 5. Mining and Beacon

| Key | Value | Unit | Notes |
|---|---|---|---|
| `mining.holdS` | 2.0 | s | **spec** |
| `mining.costPerS` | 3.0 | E/s | on top of burn; one vein = 6 E + 2 s of burn (1.0–2.8 E); zone 4 with hits ≈ 10.9 E ([[architecture-scale-and-economy-3]] §1.1) |
| `mining.reachPx` | 40 | px | player centre to the vein face point ([[architecture-state-2]] §4) |
| `mining.tickS` | 0.5 | s | `mineTick` event cadence (4 hits per vein, [[architecture-assets-audio-2]] §4) |
| `minerals.cap` | 3 | pieces | **spec** per type |
| `beacon.holdS` | 5.0 | s | **spec ASSUMPTION** |
| `beacon.costPerS` | 4.0 | E/s | 20 E total + burn; zone 4: 20 + 5 × 1.4 = **27 E** per hold |
| `beacon.minStartE` | 40 | E | START GATE ([[architecture-scale-and-economy-2]] §2): the hold may start only with `max(eStart, energy) >= 40`, `eStart` = energy at the START of the step, before `stepFlame` (R-125), so a bar at exactly 40.00 passes; a press below is DENIED (fx `denied`, toast `The Beacon needs more light`), costs nothing, no hold progress ([[architecture-systems-2]] §5). 40 = 27 E hold + 13 E margin |
| `beacon.minEnergyE` | 1 | E | the hold never drains below 1 E: once started (gate passed), it always completes (no soft lock) |
| `beacon.reachPx` | 36 | px | player centre to Beacon tile centre |
| `beacon.flashS` | 1.2 | s | `fx.beaconFlash` white-out, set by `lightBeacon` (R-147) |
| `beacon.shakeS`, `shakePx` | 1.0, 8 | s, px | quake start; `lightBeacon` applies them with the `addShake` strongest-wins rule (R-147) |

## 6. Swing and parry

| Key | Value | Unit | Notes |
|---|---|---|---|
| `swing.arcDeg` | 120 | deg | ±60° around the locked aim (sprite sweep, [[architecture-assets-sprites]] §4.2) |
| `swing.reachPx` | 56 | px | contact if `dist - monster.radiusPx <= 56` and inside the arc |
| `swing.activeS` | 0.15 | s | contact frames ([[architecture-state]] §8) |
| `swing.cooldownS` | 0.5 | s | **spec** start value, measured from swing start |
| `swing.bufferS` | 0.10 | s | a click during cooldown fires when the cooldown ends if within 0.10 s (needs `player.swing.buffer`, State addition) |
| `parry.perfectS` | 0.035 | s | perfect if `|δ| <= 0.035` (**OPEN** in spec, start value). At 60 Hz δ is a multiple of 1/60 s, so this is ±2 steps = 5 swing-start slots ≈ 83 ms |
| `parry.earlyMaxS` | 0.140 | s | earliest swing start that still counts (δ ≥ −0.140, i.e. −8 steps) |
| `parry.lateMaxS` | 0.090 | s | latest (δ ≤ +0.090, i.e. +5 steps); the bite lands at `contactS + lateMaxS`, so later swings are too late by construction |
| `parry.lossMinFrac` | 0.15 | × hit | loss just outside the perfect window |
| `parry.lossMaxFrac` | 0.80 | × hit | loss at the window edge; a parry always beats taking the hit (1.0) |
| `parry.lossExp` | 1.5 | – | loss curve exponent (gentle near perfect, steep near the edge) |
| `parry.minSpanS` | 0.020 | s | guard: `W' = max(W, P + 0.020)` so a widened perfect window never divides by ~0 |
| `parry.goodSplit` | 0.5 | – | grade `good` if `u <= 0.5`, else `poor` |
| `parry.hitstopS` | 0.060 | s | perfect-parry freeze ([[architecture-assets-audio-2]] §3) |
| `parry.flareS` | 0.35 | s | `fx.flare` |


Every graded parry KILLS the shade, all three kinds (**spec**: "it is parried and dies"). The grade only sets the flame loss. Timing reference: δ is the swing START time relative to the shade's perfect moment `contactS` (lunge time at which a non-moving player would be touched), so `δ = (m.aiT - p.swing.t) - T.monsters[kind].contactS` at the step the arc first touches the lunging shade. `δ < -earlyMaxS` = whiff (that swing does not affect that shade). A late swing beyond `lateMaxS` is rare: the bite lands `lateMaxS` after the latch ([[architecture-systems-3]] §1), so u is clamped to 1 if it happens.

Loss curve (full maths and worked examples: [[architecture-systems-3]] §3):

```
δ  = (m.aiT - p.swing.t) - T.monsters[kind].contactS   // s, < 0 early, > 0 late; multiple of 1/60
P  = perfectS * mineral.perfectMul
W  = max(δ < 0 ? earlyMaxS : lateMaxS, P + minSpanS)
u  = clamp((|δ| - P) / (W - P), 0, 1)
loss = |δ| <= P + 1e-9 ? 0
     : energyHitE(kind) * (lossMinFrac + (lossMaxFrac - lossMinFrac) * u ^ lossExp) * mineral.lossMul
```

## 7. Roll and hurt

| Key | Value | Unit | Notes |
|---|---|---|---|
| `roll.durationS` | 0.30 | s | escape phase only |
| `roll.speedPxS` | 420 | px/s | 126 px per roll (1.75× sprint) |
| `roll.invulnS` | 0.30 | s | whole roll is i-frames against lunges (not against rocks) |
| `roll.cooldownS` | 1.5 | s | **spec** start value, from roll start |
| `hurt.hpInvulnS` | 0.8 | s | after losing an HP pip |
| `hurt.flashS` | 0.25 | s | `player.hitFlash` |

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-tuning-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-host-changes]]
- [[architecture-assets-sprites]]
- [[architecture-assets-audio-2]]
- [[last-ember-production-plan]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-rocks]]

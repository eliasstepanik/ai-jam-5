---
type: architecture
title: Last Ember – Monster AI (1/2) – Shared Rules, Steering, Lunge Pipeline, Lurker, Stalker, Devourer FSMs
description: Last Ember monster AI part 1 – stepMonsters contract, ring radius and the numeric meaning of avoiding the light, steering maths (seek, orbit, separation O(n^2) capped at 24), lunge eligibility and hazard formula, the shared windup/lunge/recover/stunned/dying pipeline with capsule hit detection, and per-kind finite state machines for lurker, stalker (behind-angle predicate with wrap-around) and devourer (two-beat telegraph), with worked numbers.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:40:00Z
---

# Last Ember – Monster AI (1/2)

Part 1 of 2. Next: [[architecture-monsters-ai-2]] (devourer light push, escape behaviour, mineral attraction, director, walls without pathfinding, eyes, zone ramp, budget, debug overlay). Values: [[architecture-tuning-2]] §1–§4. Damage and parry that consume lunges: [[architecture-systems-3]]. Light predicate: [[architecture-systems-2]] §1. Hub: [[architecture]]. Spec (governs): [[last-ember-design]] § Monsters. State: [[architecture-state-2]] §2 (`Monster`, `MonsterAi`), additions in [[architecture-systems-4]] §6.

File: `src/entities/monster.ts` (spawn, shared pipeline) plus `src/entities/ai-lurker.ts`, `ai-stalker.ts`, `ai-devourer.ts`, `ai-escape.ts`, `steer.ts` — each well under 300 lines. Notation: `p = s.player`, `K = T.monsters[m.kind]`, `R = lightRadius(s)`, `d = hypot(m.x − p.x, m.y − p.y)`, `θm = atan2(m.y − p.y, m.x − p.x)` (angle of the monster seen from the player), `z = meta.zone`, `A = T.minerals.table[p.activeMineral].attractMul`, `wrapPi` from [[architecture-systems-3]] §3.

## 1. `stepMonsters(s: State, dt: number): void`

```
if debug.freezeAi: return
D = devourerMul(s)                                   // computed once per step ([[architecture-monsters-ai-2]] §1)
for m of s.monsters (array order):
  m.lastX = m.x; m.lastY = m.y
  m.aiT += dt; m.lungeCd = max(0, m.lungeCd - dt); m.stunned = max(0, m.stunned - dt)
  desired = phase === 'escape' ? escapeBrain(s, m) : brain[m.kind](s, m)   // returns desired velocity, may change ai
  pipeline(s, m, desired, dt)                        // §5: windup/lunge/recover/stunned/dying handling + movement
separate(s, dt)                                      // §3.4
for m: m.seen = insideLight(s, m.x, m.y, 0.5 * K.radiusPx); updateStuck(s, m, dt)
remove monsters with ai === 'dying' and aiT >= aiDur (iterate backwards)
```

The light predicate is `insideLight` of [[architecture-systems-2]] §1 — the same function render uses to choose body vs eyes, so what you see is what the AI obeys.

Budget note (320×240 map, [[architecture-scale-and-economy-4]] §1.4): every AI query here is local (rings around the player, LOS ≤ 12 cells, spawn tries O(tries)), so per-step AI cost does not grow with the map. The budget stays ≤ 0.3 ms per step ([[architecture-monsters-ai-2]] §8); the only map-sized option, the flow-field upgrade, must be windowed (≤ 6 561 cells, [[architecture-monsters-ai-2]] §4).

## 2. Ring radius and "avoid the light" (numbers)

```
ringRadius(m) = R * K.ringFactor + K.ringMarginPx + K.driftAmpPx * sin(2π * K.driftHz * meta.time + m.id)
```

`m.ringRadius` stores this value each step (stored mirror for the debug overlay; [[architecture-state-2]] spawn default refined to this formula).

Avoid rule (lurker and stalker; the devourer is exempt, it walks INTO the light):

| Quantity | Formula | Lurker at e = 50 (R = 131.9) |
|---|---|---|
| comfort ring | `ringRadius` | 131.9 + 14 ± 12 = 134–158 px |
| flee trigger | `d < R` (centre inside the light) while in `ring`/`stalk`/`recover` | d < 131.9 |
| flee exit | `d >= R + 0.5 * ringMarginPx` | d ≥ 138.9 |
| flee velocity | radially outward, `K.ringSpeedPxS * T.ai.fleeMul` | 70 × 1.4 = 98 px/s |
| committed states | `windup`, `lunge` ignore the light (they are attacking) | – |

`m.fleeing` (State addition) latches between trigger and exit; a fleeing shade can never start a windup. Typical cause: resin or a sodium toss makes R jump (small resin on a dead flame 22 → 105 px, or 132 → 171 px); the whole ring visibly scatters outward.

## 3. Steering maths (`src/entities/steer.ts`, pure)

```ts
export function seek(mx: number, my: number, tx: number, ty: number, vmax: number, arriveK = 3): [number, number]
export function blend(m: Monster, dvx: number, dvy: number, rate: number, dt: number): void
export function separate(s: State, dt: number): void
```

### 3.1 Seek with arrival

`dx = tx − mx`, `dy = ty − my`, `L = hypot(dx, dy)`; `L < 1e-6` → `[0, 0]`; else `v = min(vmax, L * arriveK)`; return `[dx / L * v, dy / L * v]`. Arrival: slows within `vmax / 3` px of the target (lurker: 23 px).

### 3.2 Velocity blend (inertia)

`k = 1 − exp(−rate * dt)`; `m.vx += (dvx − m.vx) * k`; `m.vy += …`. Lurker `rate = 6` → 9.5 % per step; devourer `rate = 2` → 3.3 % (heavy, slow to turn).

### 3.3 Orbit

`m.ringAngle = wrapPi(m.ringAngle + m.orbitDir * K.orbitRadS * dt)`; target point `T = (p.x + cos(ringAngle) * ringRadius, p.y + sin(ringAngle) * ringRadius)`; desired velocity = `seek(m, T, |d − ringRadius| > 80 ? K.chaseSpeedPxS : K.ringSpeedPxS)`. The ring follows the player automatically because `T` is relative to `p`.

### 3.4 Separation (O(n²), n ≤ 24)

```
for i < j over monsters not in windup/lunge/dying:
  gap = ri + rj + T.ai.separationPx; dx = mj.x − mi.x; dy = …; L = hypot
  if L >= gap or L < 1e-6: continue
  push = T.ai.separationPxS * (1 − L / gap) * dt      // px this step
  mi.x −= dx / L * push * 0.5; mi.y −= …; mj.x += …; mj.y += …   (then each through moveCircle with dx/dy = push)
```

24 shades → 276 pairs ≈ 3 µs. ponytail: O(n²) pair loop; a spatial hash is pointless below ~100 entities.

## 4. Lunge eligibility and hazard

```
slotsUsed = count(monsters with ai in {windup, lunge})
eligible(m) = m.lungeCd <= 0 and !m.fleeing and m.stunned <= 0
           and d <= K.lungeRangePx and |d - m.ringRadius| <= 40 (lurker/stalker) or d <= K.lungeRangePx (devourer)
           and slotsUsed < T.director.attackSlots[z-1] and losTiles(s, m, p)
λ(m) = K.lungeChancePerS[z-1] * A * (1 + T.ai.darkLungeMul * (1 - e / 100)) * (e <= 0 ? T.ai.flameOutLungeMul : 1)
start windup if eligible(m) and rand(s, 'gameplay') < 1 - exp(-λ * dt)
```

- The rng draw happens only when `eligible` is true, so the draw count depends on gameplay state only ([[architecture-determinism]] §6).
- `losTiles`: Bresenham from the monster tile to the player tile; no solid tile strictly between. ≤ 12 cells at these distances.
- Stalker additionally needs `behindT >= 0.25` (§7); `λ` for the stalker is its "behind" hazard.

Worked (lurker zone 1, plain, e = 30): λ = 0.03 × 1 × (1 + 0.7) = 0.051/s → per step 8.5e-4 → mean 19.6 s of eligibility; plus cooldown 3–5 s → each lurker attacks about every 24 s; 3 lurkers ≈ one attack per 8 s (Day-4 pass band 8–20 s, [[architecture-scale-and-economy-3]] §5.2). Flame out, same lurker: 0.03 × 2 × 2.5 = 0.15/s → 6.7 s. Sodium at e = 30: 0.082/s.

## 5. Shared pipeline (`pipeline(s, m, desired, dt)` in `monster.ts`)

| State | Enter | Per step | Exit → next |
|---|---|---|---|
| `ring` / `stalk` | spawn; end of `recover`/`stunned` | `blend(m, desired, K.steerPerS)`; `moveCircle` | eligible + draw → `windup` |
| `windup` | `aiT = 0`, `aiDur = K.telegraphS`, `lungeDir = θ(player − m)`, `beat = 1`, `emit('windup', a = 0)`; `contactT = −1` | `blend(m, 0, 0, 12)` (brake); `lungeDir` re-aimed at the player every step (eyes track); devourer: at `aiT >= 0.4` and `beat === 1` → `beat = 2`, `emit('windup', a = 1)` | `aiT >= aiDur` → `lunge` |
| `lunge` | `aiT = 0`; `lungeDir` LOCKED at the player now (escape: at `p + v * K.escapeLeadS`); `d0 = current d`; `vL = max(30, d0 − 10 − K.radiusPx) / K.contactS`; `v = vL * (cos, sin)(lungeDir)`; `emit('lunge')` | if `contactT < 0`: move by `v * dt` (substeps, [[architecture-systems]] §5.2); if a wall is hit → `stunned` (bonk). If `contactT >= 0`: stick — place at `p + (rp + rm) * unit(m − p)` | bite (`damagePlayer`) → `recover` or `dying`; parry → `dying`; `contactT < 0 and aiT >= contactS + lungeOverrunS` → `recover` (miss) |
| `recover` | `aiT = 0`, `aiDur = K.recoverS` (escape 0.4 s), `lungeCd = randRange(K.lungeCdS)` (escape `escapeLungeCdS`) | desired = outward from the player to `ringRadius + 40` at `ringSpeedPxS * 1.2`; stalker: `+ 60 px` (retreat) | `aiT >= aiDur` → `ring` (stalker `stalk`) |
| `stunned` | `stunned = aiDur = T.ai.bonkS` (wall bonk 0.25 s) | `blend(m, 0, 0, 8)` | `aiT >= aiDur` → `recover` |
| `dying` | `aiT = 0`, `aiDur = K.dyingS`, `vx = vy = 0`, `emit('monsterDie', a = kind index)` | no movement, no collision, ignored by separation, parry, bites, slots, caps | `aiT >= aiDur` → removed |

The windup-start `lungeDir` matches [[architecture-state-2]] §2 ("locked at windup start"); refinement: it tracks during windup and the FINAL lock happens at lunge start, so a player who sidesteps during the telegraph is still targeted (the parry is the answer, not walking away). DEFAULT (architect).

### 5.1 Lunge hit detection (capsule vs player circle)

The bite latch in `resolveBites` ([[architecture-systems-3]] §4) uses the swept segment of this step, not only the end point:

```
segDist(ax, ay, bx, by, px, py): t = clamp(((px−ax)(bx−ax) + (py−ay)(by−ay)) / max(1e-9, |b−a|²), 0, 1); return |p − (a + t(b−a))|
latch if contactT < 0 and segDist(m.lastX, m.lastY, m.x, m.y, p.x, p.y) <= 10 + K.radiusPx + K.biteSlackPx
```

Worked: lurker lunge from d0 = 163 px: vL = (163 − 19) / 0.2 = 720 px/s = 12 px/step. Previous (36, 0), now (24, 0) relative to the player at the origin → segDist 24 > 23, no latch; next step (12, 0) → 12 ≤ 23 → latch at lunge step 12 (aiT 0.200 = contactS, as planned). Why a capsule: if the player strafes 4 px/step sideways, the end points can sit 24 px off-axis on both steps while the segment between them passes within 20 px; only the swept test catches that.

## 6. Lurker FSM (small, zone 1+)

| State | Enter condition | Per-step behaviour | Exit condition | Timers |
|---|---|---|---|---|
| `ring` | spawn, after `recover`/`stunned` | orbit (§3.3) on `ringRadius`; flee if `d < R` (§2) | §4 draw → `windup` | `lungeCd` (start `randRange(2, 4)`) |
| `windup` | eligible + hazard | brake; eyes bright; track | `aiT ≥ 0.40` → `lunge` | `aiDur = 0.40` |
| `lunge` | windup end | dash, `contactS = 0.20` | bite / parry / miss after 0.45 s | `aiT` |
| `recover` | miss, or bite while flame out | back off to ring + 40 | `aiT ≥ 0.8` → `ring` | `lungeCd = randRange(3, 5)` |
| `dying` | parry, bite on a lit flame, Beacon lit | dissolve | `aiT ≥ 0.5` → removed | |

Lurker "rare lunge" (spec "occasional quick lunge") = low λ, slot 1, cooldown 3–5 s.

## 7. Stalker FSM (medium, zone 2+)

Behind predicate (exact, wrap-safe):

```
off = |wrapPi(θm − p.facing)|                       // 0 = straight ahead, π = straight behind
behind = off > deg(T.ai.stalkerBehindDeg)           // 110° → behind cone is 140° wide
```

Wrap example: `p.facing = 3.0` rad (171.9°), stalker at `θm = −3.0` rad: raw −6.0 → wrapPi → +0.2832 rad (16.2°) → in FRONT (a naive `|θm − facing| = 6.0 > 1.92` would wrongly say behind). Second: facing 0, θm = 2.2 rad (126°) → off 2.2 > 1.92 → behind.

Target angle: `βt = p.facing + π`. The stalker moves its `ringAngle` toward `βt` by the shortest way: `Δ = wrapPi(βt − ringAngle)`; `ringAngle += sign(Δ) * min(|Δ|, (K.ringSpeedPxS / max(ringRadius, 1)) * dt)`; desired = seek to the ring point (§3.3), chase speed if more than 80 px off the ring.

| State | Enter condition | Per-step behaviour | Exit condition | Timers |
|---|---|---|---|---|
| `stalk` | spawn, after `recover`/`stunned` | circle toward βt; flee if `d < R`; `behindT = behind && |d − ringRadius| ≤ 40 ? behindT + dt : 0` | eligible (§4) and `behindT ≥ 0.25` and draw → `windup` | `lungeCd` start 3–5 s |
| `windup` | as above | brake, eyes bright, track; continues even if the player turns (committed) | `aiT ≥ 0.40` → `lunge` | |
| `lunge` | windup end | dash, `contactS = 0.24` | bite / parry / miss after 0.54 s | |
| `recover` | miss or flame-out bite | RETREAT outward to `ringRadius + 100` at 102 px/s | `aiT ≥ 1.2` → `stalk`; `behindT = 0` | `lungeCd = randRange(2.5, 4)` |
| `dying` | parry / lit bite / Beacon | | `aiT ≥ 0.5` | |

Worked: player facing east (0 rad), stalker on the ring at θm = π/2 (south), ringRadius 165 px, ringSpeed 85 px/s → max angular speed 0.515 rad/s; Δ = wrapPi(π − π/2) = +π/2 → reaches the behind point in 3.05 s; it is "behind" (off > 1.92 rad) after turning 0.35 rad (0.68 s); plus 0.25 s dwell → hazard 0.5/s (zone 2) → mean 2 s more. If the player keeps turning to face it, `behindT` resets and it never attacks: turning is the counterplay (**spec**).

## 8. Devourer FSM (large, zones 3–4)

| State | Enter condition | Per-step behaviour | Exit condition | Timers |
|---|---|---|---|---|
| `ring` (approach) | spawn, after `recover` | orbit with `ringFactor 0.85`, margin 30, orbit 0.15 rad/s, speed 35 px/s (chase 45); NEVER flees; pushes the light (§1 of [[architecture-monsters-ai-2]]) | eligible (`d ≤ 150`, slot, cd, LOS) + λ 0.25/0.30 → `windup` | `lungeCd` start 3–5 s |
| `windup` beat 1 | draw | brake; maw half open; `emit('windup', a = 0)` → `sfx_devourer-beat` | `aiT ≥ 0.40` → beat 2 | |
| `windup` beat 2 | `aiT ≥ 0.40` | `beat = 2`, maw open, all 4 eyes; `emit('windup', a = 1)` | `aiT ≥ 0.80` → `lunge` | `aiDur = 0.80` |
| `lunge` | beat 2 end | big dash, `contactS = 0.30`, `energyHitE = 35` | bite / parry / miss after 0.60 s | |
| `recover` | miss, flame-out bite | heavy back-off to ring + 40 at 42 px/s | `aiT ≥ 1.5` → `ring` | `lungeCd = randRange(4, 6)` |
| `dying` | parry (any grade) / lit bite / Beacon | collapse | `aiT ≥ 0.8` | |

Beat timings match [[architecture-assets-sprites]] §6 (A 0.4 s + B 0.4 s). Parry timing reference is the lunge, not the beats; the two beats are the rhythm cue ("DUM … DUM … strike").

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-monsters-ai-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-determinism]]
- [[architecture-assets-sprites]]
- [[architecture-scale-and-economy-4]]
- [[architecture-scale-and-economy-3]]

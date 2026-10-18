---
type: architecture
title: Last Ember – Monster AI (2/2) – Devourer Light Push, Escape, Minerals, Director, Walls, Eyes, Ramp, Budget, Debug
description: Last Ember monster AI part 2 – devourer light-radius push formula and its coupling to flame and visibility, escape-phase behaviour with constant lunges, mineral attraction multipliers, the descent and escape director (spawn outside light, path-distance sanity check, despawn, caps), wall handling without pathfinding with stuck nudge and relocate plus the flow-field upgrade trigger, eye visibility rules, difficulty ramp per zone, per-step cost budget and the dev-only AI debug overlay.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:50:00Z
---

# Last Ember – Monster AI (2/2)

Part 2 of 2. Previous: [[architecture-monsters-ai]] (shared rules, steering, lunge pipeline, per-kind FSMs). Values: [[architecture-tuning-2]] §1–§5. Systems: [[architecture-systems]], [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]]. Hub: [[architecture]]. Spec: [[last-ember-design]] § Monsters, § Minerals, § Phase 2. State: [[architecture-state-2]] §2, §6; additions [[architecture-systems-4]] §6.

## 1. Devourer light push (`devourerMul(s): number`, `src/entities/ai-devourer.ts`)

Spec: "pushes the light radius back while near".

```
dv = nearest monster with kind === 'devourer' and ai !== 'dying'; none → return 1
d  = hypot(dv.x - p.x, dv.y - p.y)
t  = clamp((T.devourerLight.farPx - d) / (T.devourerLight.farPx - T.devourerLight.nearPx), 0, 1)   // 260, 80
k  = t * t * (3 - 2 * t)                                   // smoothstep: no pop at the edges
return 1 - T.devourerLight.pushMax * k                     // 0.35 → min 0.65
```

| d (px) | t | k | mul | R at e = 50 plain (131.9) |
|---|---|---|---|---|
| ≥ 260 | 0 | 0 | 1.000 | 131.9 |
| 200 | 0.333 | 0.259 | 0.909 | 119.9 |
| 170 | 0.500 | 0.500 | 0.825 | 108.8 |
| 120 | 0.778 | 0.875 | 0.694 | 91.5 |
| ≤ 80 | 1 | 1 | 0.650 | 85.7 |

Coupling (DEFAULT, architect):

- It multiplies `lightRadius` only. **Energy, burn rate and parry are untouched**: the flame is smothered, not drained. Killing or out-running the devourer restores the radius instantly.
- Everything that reads `lightRadius` feels it: the render mask and HUD gauge, `insideLight` (so lurkers/stalkers flee less and their rings close in, because their `ringRadius` scales with R), explore marking, spawn distance (`R + gap`) and eye range. That is the intended horror beat: the devourer's approach drags the whole ring inward.
- One evaluation per step at the start of `stepMonsters` from positions at step start; the value is not stored. Render calls the same `lightRadius(s)` and gets the same number for the same State. No feedback loop inside a step; across steps the loop (smaller R → devourer ring `0.85R + 30` closer → smaller R) converges because `mul ≥ 0.65`.
- Flame out: `22 px × mul` (min 14.3 px). The player sprite still draws (spec: minimally visible).

## 2. Escape-phase behaviour (`escapeBrain`, `src/entities/ai-escape.ts`)

Spec: no torch, no ring, "shades keep lunging constantly"; the roll dodges.

| State | Enter | Per step | Exit |
|---|---|---|---|
| `ring` (hunt) | spawn, after `recover` | seek the intercept point `p + (p.vx, p.vy) * 0.3` at `K.chaseSpeedPxS * 1.3` (lurker 124, stalker 169, devourer 59 px/s); no light test, no flee | `d ≤ K.escapeStrikePx` and `lungeCd ≤ 0` and slots `< 3` and LOS → `windup` (no hazard draw: constant) |
| `windup` | | brake, track; same telegraph lengths as descent (0.4 / 0.4 / 0.8 s) so a roll is readable | `aiT ≥ aiDur` → `lunge` |
| `lunge` | aim locked at `p + v * K.escapeLeadS` | same pipeline; bite has no delay (rule 6 / rule 2 of [[architecture-systems-3]] §4.1) | bite → `recover` (survives); miss → `recover` |
| `recover` | `aiDur = 0.4`, `lungeCd = randRange(K.escapeLungeCdS)` | drift back 40 px | → `ring` |

Stalkers keep no behind rule in escape (one rule set, simpler, and the player faces movement anyway). Worked: player sprinting east at 240 px/s, lurker 140 px ahead-left; windup 0.4 s (player moves 96 px), lunge aimed 0.15 s ahead (36 px lead); contact 0.2 s later. Roll pressed between eye-glow and contact (≤ 0.6 s window) with 0.3 s i-frames → dodge if the roll covers the contact step.

## 3. Mineral attraction (spec: sodium lures more, strontium fewer)

`A = T.minerals.table[activeMineral].attractMul`: plain/copper 1.0, sodium 1.6, strontium 0.5. Applied in exactly three places (descent only; escape ignores minerals):

| Where | Formula | Sodium zone 2 | Strontium zone 2 |
|---|---|---|---|
| spawn interval | `spawnIntervalS[z] / (A * (e <= 0 ? 1.5 : 1))` | 3.5 / 1.6 = 2.19 s | 7.0 s |
| alive cap | `clamp(round(maxAlive[z] * A), 1, 24)` | 8 | 3 |
| lunge hazard λ | `× A` ([[architecture-monsters-ai]] §4) | lurker 0.064/s at e = 100 | 0.02/s |

Strontium also shrinks R × 0.7, so its ring sits closer and eyes are visible over a shorter range: fewer, but nearer, unseen threats (the "hard navigation" trade-off of the spec). Specific per-colour AI reactions beyond these multipliers are deferred (**spec**).

## 4. Walls without pathfinding

ponytail: no pathfinding. Shades slide along walls through `moveCircle` (the same collision as the player, [[architecture-systems]] §5.2, radius = `K.radiusPx`). Ceiling: a shade on the far side of a wall can get stuck. Upgrade path below.

`updateStuck(s, m, dt)` (end of `stepMonsters`):

```
want  = hypot(m.vx, m.vy) * dt                 // intended move this step
moved = hypot(m.x - m.lastX, m.y - m.lastY)
if m.ai in {ring, stalk, recover} and want > 0.5 and moved < T.ai.stuckFrac * want: m.stuckT += dt
else m.stuckT = max(0, m.stuckT - dt)
if m.stuckT >= T.ai.stuckNudgeS and (m.stuckT - dt) < T.ai.stuckNudgeS: nudge
if m.stuckT >= T.ai.stuckRelocateS: relocate
```

- **Nudge** (0.5 s blocked): `orbitDir = -orbitDir`; `ringAngle += orbitDir * π / 3` (go round the other way); for a stalker also hold the new direction for 1 s by setting `behindT = 0`.
- **Relocate** (2.5 s blocked): if `!m.seen`, move it to a new spawn position from `findSpawn` (§5, uses the gameplay stream), `stuckT = 0`; if seen, despawn is not allowed (no pop-in/out in view): `stuckT = stuckNudgeS` and nudge again.
- A lunge that hits a wall stops: `stunned` for `T.ai.bonkS` (0.25 s), then `recover` ([[architecture-monsters-ai]] §5). The lunge was a miss.
- **Upgrade trigger (when to add a flow field):** add a **windowed** BFS flow field from the player tile (reuse the shared BFS of [[architecture-world-queries-2]] §1, restricted to the Chebyshev-40 window around the player, ≤ 81² = 6 561 cells ≈ 0.1 ms, rebuilt when the player changes tile; a full 76 800-cell field at 3.75 changes/s would cost ≈ 4 ms/s, so the window is the rule, [[architecture-scale-and-economy-4]] §1.4) and steer down its gradient when `stuckT > 0` — only if the Day 4/6 playtest shows (debug overlay counter) more than 1 relocate per minute per shade on average, or devourers fail to reach the player in narrow tunnels. Not before.

## 5. Director (`stepDirector(s, dt)`, `src/systems/director.ts`)

Reads `meta`, `player`, `monsters`, `director`, the path-distance cache. Writes `director.spawnT`, `director.alive`, `monsters` (push / splice). Draws from `gameplay` only.

```
live = monsters with ai !== 'dying'; director.alive = counts by kind over live
for i from monsters.length-1 down to 0: m = monsters[i]
  if !m.seen and hypot(m - p) > despawnPx: splice (silent, not a kill)     // 560 descent, 700 escape
spawnT -= dt; if spawnT > 0: return
spawnT = interval                                                            // §3 formula; escape: 1.2 s
if live.length >= cap: return                                                // §3; escape: 8
kind = weightedPick(weights[*][z-1] with devourer weight 0 if alive.devourer >= 1)
pos = findSpawn(s, kind); if pos: spawnMonster(s, kind, pos.x, pos.y)        // [[architecture-state-2]] §2
```

`findSpawn(s, kind)`, up to `T.director.spawnTries` (8) tries, each 2 draws (angle, gap):

```
a = randRange(0, 2π); g = randRange(gap0, gap1)                 // descent [60, 140], escape [220, 340]
r = (escape ? 0 : lightRadius(s)) + g
x = p.x + cos(a) * r; y = p.y + sin(a) * r; tile = (floor(x/32), floor(y/32))
reject if: any solid tile within K.radiusPx of (x, y)          // circle vs grid, as moveCircle
reject if: insideLight(s, x, y, K.radiusPx)                    // descent: spawn fully outside the light
reject if: pathDist[tile] < 0 or |pathDist[tile] - pathDist[playerTile]| > ceil(r / 32) + 4   // same tunnel system, not behind a thick wall
```

The path-distance check uses the existing entrance BFS field (descent) or the escape field (escape): a tile whose path distance differs from the player's by much more than the straight distance is around a wall, where a shade without pathfinding would be stuck. Weighted pick: one draw `u = rand * Σw`, walk the kinds in the fixed order `lurker, stalker, devourer`.

Worked (zone 3, plain, e = 40, R = 122.2): interval 3.0 s, cap 6, weights 0.45/0.40/0.15 (devourer allowed if none alive). Draw u = 0.62 × 1.0 → lurker (0.45) < 0.62 < 0.85 → stalker. Try: a = 1.1 rad, g = 95 → r = 217.2 px → candidate rejected if a wall is within 14 px; accepted otherwise.

Spawn defaults (`spawnMonster`): [[architecture-state-2]] §2 plus additions `contactT −1`, `stuckT 0`, `lastX/lastY = x/y`, `fleeing false`, `behindT 0`; `lungeCd = randRange(K.lungeCdStartS)`; `ringRadius` per [[architecture-monsters-ai]] §2.

## 6. Eye visibility rules (render; predicate shared with update)

| Condition | Drawn |
|---|---|
| `phase === 'escape'` | full body (cave lit) |
| `m.seen` (`insideLight(s, m.x, m.y, 0.5 * K.radiusPx)`) | full body + eyes |
| not seen, `d ≤ R + T.ai.eyeRangeExtraPx` (220) and tile LOS from the player | eyes only (`idle` dim; `windup`/`lunge` bright `telegraph` frames) |
| not seen, beyond range or no LOS | nothing — also when standing on an explored (remembered) tile (**spec**: monsters in remembered tiles are hidden) |
| `ai === 'dying'` | death animation if seen, eyes fade out otherwise |

`windup` eyes outside the range but with LOS within the view are still drawn bright (a telegraph must never be invisible). Flame out: range = 22 + 220 = 242 px, so attackers stay readable.

## 7. Difficulty ramp per zone (effective values, plain flame, e = 50)

| Zone | Kinds | Max alive | Spawn every | Attack slots | Lurker λ | Stalker λ (behind) | Devourer λ | Burn |
|---|---|---|---|---|---|---|---|---|
| 1 | L | 3 | 4.0 s | 1 | 0.045/s | – | – | 0.5 E/s |
| 2 | L, S | 5 | 3.5 s | 1 | 0.060/s | 0.75/s | – | 0.7 E/s |
| 3 | L, S, D | 6 | 3.0 s | 2 | 0.075/s | 0.90/s | 0.375/s | 1.0 E/s |
| 4 | L, S, D | 7 | 2.5 s | 2 | 0.090/s | 1.05/s | 0.450/s | 1.4 E/s |

(λ includes the darkness factor `1 + (1 − 0.5) = 1.5`.) Max alive, spawn interval, `energyHitE` 12/20/35, `MONSTERS_MAX` 24 and the escape director (8 alive, 1.2 s) are FINAL for the 320×240 map ([[architecture-scale-and-economy-3]] §2.1): the director is player-local and per-time, so longer zones mean more encounters per zone (≈ ×2.9), not denser spawns. Burn column: [[architecture-scale-and-economy-2]] §2. Speeds, telegraphs and windows do NOT ramp: the player's learned rhythm stays valid; pressure ramps through count, mix and frequency.

Despawn/respawn: despawned shades are not replaced 1:1; the director refills up to the cap at its interval. Shades never respawn on the same spot (fresh `findSpawn`). Beacon lighting kills all ([[architecture-systems-2]] §5); the escape director starts after 1 s.

## 8. Per-step cost budget (24 shades)

| Part | Cost estimate |
|---|---|
| brains + blend | 24 × ~60 flops |
| `moveCircle` | 24 × ≤ 2 substeps × ≤ 9 tile reads |
| LOS for eligibility | only eligible shades, ≤ 12 cells each |
| separation | 276 pairs |
| director | ≤ 8 tries × ≤ 9 tile reads, once per interval |
| `insideLight` / stuck | 24 × O(1) |

Budget: ≤ 0.3 ms per step on a mid laptop; with the host's 15 catch-up steps ≤ 4.5 ms, below the host's 12 ms step-time bailout, which therefore never triggers in play ([[architecture-scale-and-economy-4]] §1.8, [[architecture-host-changes-2]] §12). Check: `src/checks/ai.check.ts` runs 3 600 steps with 24 forced shades under Node and asserts the total < 1 s (generous, CI noise).

## 9. Dev-only AI debug overlay

Drawn by `drawDebug(ctx, s, w, h)` in `src/ui/debug.ts` ([[architecture-host-changes-2]] §7) as an extra layer when `s.debug.overlay` (State addition). Dev keys (R-132, R-133 in [[architecture-rulings-3]]): `Shift+Digit1` reveal, `Shift+Digit2` god, `Shift+Digit3` overlay, `Shift+Digit4` freezeAi, `Shift+Digit5` showPaths, `Shift+Digit6` quality override ([[architecture-render-3]] §3). No F-keys: `F5` would reload the page. Gating rule: every dev toggle and the `drawDebug` call are gated by `import.meta.env.DEV` in `src/game.ts` ONLY (`update` reads the keys and flips `s.debug.*`, `render` calls `drawDebug`); layers L0–L3 (`src/core`, `src/world`, `src/entities`, `src/systems`) and `src/ui/debug.ts` itself never read `import.meta.env`, so `npm run check` under Node never touches it. World-space layer (same transform as the game; light circle uses `flameRadius`, not `LIGHT_ALL`, when reveal is on):

- Light: circle `lightRadius` (white, 1 px); spawn annulus `R + 60 .. R + 140` (dashed grey); eye range `R + 220` (dotted).
- Per shade: ring circle `ringRadius` around the player in the kind colour (lurker cyan, stalker yellow, devourer magenta); line to its ring target; velocity vector; label `ai aiT/aiDur cd λ` (2 decimals) and `F` if fleeing, `S{stuckT}` if `stuckT > 0`.
- Lunge: locked direction line of length `vL * (contactS + overrun)`; the capsule of this step; latch marker at `contactT`.
- Stalker: the 140° behind cone of the player (translucent red wedge); `behindT` bar.
- Devourer: `nearPx` / `farPx` rings and the current `mul`.
- Screen-space panel: alive by kind / cap, slots used / max, spawnT, interval, `A`, current λ per kind, relocates per minute (the flow-field upgrade metric of §4), last parry δ and grade.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-monsters-ai]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-host-changes-2]]
- [[architecture-render-3]]
- [[architecture-rulings-3]]
- [[architecture-determinism]]
- [[architecture-world-queries-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]

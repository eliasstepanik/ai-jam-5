---
type: architecture
title: Last Ember – Flame Economy and Pacing Check
description: Numeric sanity check of the Last Ember flame economy and run pacing against the current tuning – walk and sprint times, burn versus resin per zone, expected hit drain for beginner/mid/expert parry rates, run length versus the 6–8 minute target, whether "deeper or out?" survives the energy-free escape, a ranked knob table with ranges, the Day-4 tension test protocol and a reference expected-value simulator for src/checks/economy.check.ts.
tags: [project, ai-jam-5, architecture, last-ember, balance]
timestamp: 2026-10-17T23:00:00Z
---

# Last Ember – Flame Economy and Pacing Check

> **SUPERSEDED for numbers by [[architecture-scale-and-economy-2]] and [[architecture-scale-and-economy-3]] (map 320x240); this file keeps the method.**
>
> Detail (2026-10-18): every number here is for 160×120 and D ≈ 200, with the old constants (burn .5/.6/.7/.8, resin 30/55, mining 2 E/s, Beacon 3 E/s, no start gate). Current: burn .5/.7/1.0/1.4, resin 25/50, mining 3 E/s, Beacon 4 E/s with `minStartE` 40. Binding values: [[architecture-scale-and-economy]] (map, D band), [[architecture-scale-and-economy-2]] (energy constants), [[architecture-scale-and-economy-3]] (decision, director, rocks, Day-4 protocol) and [[architecture-economy-simulator]] (the check code; §8 below is NOT the check). E-1 and E-2 are resolved ([[architecture-rulings-3]] R-123, R-124). Kept as derivation history; assumptions A4–A7 (REALISM 0.6) are still the source of the hit rates.

Hub: [[architecture]], [[index]]. Spec (governs): [[last-ember-design]]. Values checked: [[architecture-tuning]] §2–§5, [[architecture-tuning-2]] §1–§3, §9. Map and quotas: [[architecture-cave-generation]] §5, [[architecture-cave-generation-2]] §1, §3.1. Energy rules: [[architecture-systems-2]] §2–§5. Attack model: [[architecture-monsters-ai]] §4, [[architecture-monsters-ai-2]] §5, §7.

This file changes no value. It derives numbers from the current defaults and proposes tuning options. Options that touch the spec are marked **NEEDS OWNER (saile2204)**.

## 0. Assumptions (all explicit)

| # | Assumption | Source / reason |
|---|---|---|
| A1 | Path distance `D` (4-connected BFS steps) ≈ walked distance. Diagonal shortcuts (×0.71 at 45°) and wall-sliding roughly cancel. | ponytail: factor 1.0; measure on Day 4 |
| A2 | Zones are equal path quarters: each zone = `D/4` tiles. | `zoneOfDepth`, [[architecture-cave-generation-2]] §1 |
| A3 | Typical `D` = 200 tiles (range 120–300). | gen §3 "150–300", state §3 "200–300", floor 120 |
| A4 | Steady-state attack rate = `Σ alive_k / (1/λ_k + mean cd_k + busy_k)` × **REALISM 0.6** (spawn ramp, LOS, outrunning lurkers at 95 < 120 px/s, despawn). | monsters-ai §4; 0.6 is a guess, calibrate on Day 4 |
| A5 | λ taken at e = 50 (darkness factor 1.5). Stalker `busy` includes ~3 s to get behind. Devourer eligible (d ≤ 150 px) half the time. | monsters-ai-2 §7 |
| A6 | 20 % of lunges miss a moving player. Of connecting lunges: share `P` perfect (0 E); the rest is half imperfect parry (mean loss 0.45 × hit), half clean hit (1.0 × hit) → mean `0.725 × hit × (1−P)`. | parry loss curve 0.15–0.80, tuning §6 |
| A7 | Profiles: **beginner** P 40 %, faces stalkers 0 %, overhead +100 %; **mid** P 60 %, facing 25 %, +60 %; **expert** P 80 %, facing 50 %, +30 %. Each mines 1 vein per zone (2 s, 4 E). | brief rates 40/60/80 % |
| A8 | Mineral flame = plain (×1.0). Sodium raises burn ×1.5 and attack pressure ×1.6; not modelled. | tuning-2 §6 |

## 1. Walk and sprint times

Tile 32 px. Walk 120 px/s = 3.75 tiles/s. Sprint 240 px/s = 7.5 tiles/s.

| Path D | Descent, pure walk | Escape, pure sprint | Sum |
|---|---|---|---|
| 120 | 120 / 3.75 = **32.0 s** | 120 / 7.5 = **16.0 s** | 48 s |
| 160 | **42.7 s** | **21.3 s** | 64 s |
| 200 | **53.3 s** | **26.7 s** | 80 s |
| 300 | 80.0 s | 40.0 s | 120 s |

## 2. Passive burn versus resin (no fights)

Energy per tile of straight descent: burn sum over zones `(0.5+0.6+0.7+0.8) × (D/4) / 3.75 = 0.1733 × D` E.

| D | Burn, straight | +30 % detour | +60 % detour | + Beacon (15 E hold + 4 E burn) at +60 % |
|---|---|---|---|---|
| 120 | 20.8 E | 27.0 | 33.3 | 52.3 |
| 160 | 27.7 E | 36.0 | 44.4 | 63.4 |
| 200 | 34.7 E | 45.1 | 55.5 | 74.5 |
| 300 | 52.0 E | 67.6 | 83.2 | 102.2 |

Per zone at D = 200 (50 tiles, 13.3 s walk): burn 6.7 / 8.0 / 9.3 / 10.7 E.

Resin supply per zone (quota × E): small 6/5/3/2 × 30 = 180/150/90/60; large 0/1/2/2 × 55 = 0/55/110/110; **total 180/205/200/170 = 755 E**, plus Beacon resin 30 E = **785 E**. About 60 % of smalls sit near the main path (slot rule `k % 5 < 3`), so on-path supply ≈ 9.6 smalls + T1 + Beacon resin ≈ **11 × 30 = 330 E**.

**Verdict (2):** a fight-free descent is trivially feasible. 100 E start covers `(100 − 19) / 0.1733 = 467` tiles with no resin at all; every real map is shorter. Passive burn alone never threatens the run. Hits and the darkness spiral decide it (§3).

## 3. Hit drain per zone

Rates from A4 (attacks/s, after REALISM):

| Zone | Lurker | Stalker (no facing) | Devourer | Total | Mean hit E |
|---|---|---|---|---|---|
| 1 | 3 / (22.2 + 4 + 1.5) × 0.6 = 0.065 | – | – | 0.065 (1 per 15 s) | 12 |
| 2 | 3 / 22.2 × 0.6 = 0.081 | 2 / 9.38 × 0.6 = 0.128 | – | 0.209 (1 per 4.8 s) | 16.9 |
| 3 | 2.7 / 18.8 × 0.6 = 0.086 | 2.4 / 9.16 × 0.6 = 0.157 | 0.45 / 10.3 × 0.6 = 0.026 | 0.269 | 18.9 |
| 4 | 2.45 / 16.6 × 0.6 = 0.089 | 2.45 / 9.0 × 0.6 = 0.163 | 0.5 / 9.8 × 0.6 = 0.031 | 0.283 | 19.1 |

Per-attack factor `0.8 × (1−P) × 0.725`: P40 = **0.348**, P60 = **0.232**, P80 = **0.116**. Facing removes that share of stalker attacks.

Hit drain E/s = `Σ rate_k × hitE_k × factor`:

| Zone | Beginner (P40, facing 0) | Mid (P60, facing .25) | Expert (P80, facing .5) |
|---|---|---|---|
| 1 | 0.78 × .348 = 0.27 | 0.78 × .232 = 0.18 | 0.78 × .116 = 0.09 |
| 2 | (0.97 + 2.56) × .348 = 1.23 | (0.97 + 1.92) × .232 = 0.67 | (0.97 + 1.28) × .116 = 0.26 |
| 3 | (1.03 + 3.14 + 0.91) × .348 = 1.77 | (1.03 + 2.36 + 0.91) × .232 = 1.00 | (1.03 + 1.57 + 0.91) × .116 = 0.41 |
| 4 | (1.07 + 3.26 + 1.09) × .348 = 1.89 | (1.07 + 2.44 + 1.09) × .232 = 1.07 | (1.07 + 1.63 + 1.09) × .116 = 0.44 |

Net drain (burn + hits), E/s: beginner **0.77 / 1.83 / 2.47 / 2.69**; mid **0.68 / 1.27 / 1.70 / 1.87**; expert **0.59 / 0.86 / 1.11 / 1.24**. Stalkers carry 60–75 % of hit energy in zones 2–4; facing is the biggest single skill lever.

Zone time at D = 200 (13.3 s walk × (1 + overhead) + 2 s mining): beginner 28.7 s, mid 23.3 s, expert 19.3 s. Zone drain incl. 4 E mining:

| Zone | Beginner | Mid | Expert |
|---|---|---|---|
| 1 | 26.1 | 19.8 | 15.4 |
| 2 | 56.5 | 33.6 | 20.6 |
| 3 | 74.9 | 43.6 | 25.4 |
| 4 | 81.2 | 47.6 | 27.9 |
| + Beacon | 19 | 19 | 19 |
| **Total need** | **258 E** | **164 E** | **108 E** |
| Resin needed beyond the 100 E start | ≥ 158 E (6 smalls; cap waste → 7) | 64 E (3 smalls) | 8 E (Beacon resin alone) |

Energy at zone borders (resin spread evenly through the zone, cap 100 E):

| Route | Z1→2 | Z2→3 | Z3→4 | Beacon start | After hold |
|---|---|---|---|---|---|
| Beginner, resin 4/3/2+1L/1+1L | 94.8 | 85.9 | 81.3 | 72.9 | 54 |
| Mid, 1 small per zone (Z4 = Beacon resin) | 90.1 | 83.2 | 69.6 | 52 | 33 |
| Expert, zero resin except Beacon resin | 84.6 | 64.0 | 38.6 | 10.7 + 30 | 21.7 |
| Expert, zero resin, D = 300 | 79.5 | 51.4 | 16.3 | out (−22) | Beacon resin only |

**Verdict (3):** on average no profile flames out at D = 200. Supply/need = 785 / 108–258 = **3.0–7.3×**. Flame-outs happen only through variance (a 35 E devourer hit plus streaks) and the darkness spiral (λ ×2 at e → 0, ×2.5 and spawns ×1.5 when out). The [[architecture-tuning-2]] §9 target "careful player reaches depth 20 with 30–60 E" is missed: mid has 83 E there, expert 64 E. **Defaults are too generous for mid and expert players.** Need also scales linearly with `D`, so seed-to-seed need varies 2.5× (D 120 vs 300).

## 4. Run time versus the 6–8 minute target

Escape: sprint time × 1.3 (rock detours, rolls). Beacon hold 5 s.

| Profile, D = 200 | Descent | Beacon | Escape | **Run** |
|---|---|---|---|---|
| Beginner | 115 s | 5 | 35 s | **155 s ≈ 2.6 min** |
| Mid (competent) | 93 s | 5 | 35 s | **133 s ≈ 2.2 min** |
| Expert | 77 s | 5 | 35 s | **117 s ≈ 2.0 min** |
| Mid, D = 300 | 140 s | 5 | 52 s | 197 s ≈ 3.3 min |

**FLAG: the 6–8 minute single-run target is not reachable by a competent run.** 360 s would need a descent of ~320 s: overhead ×6 over pure walk at D = 200, or D ≈ 690 tiles at mid overhead. A 160×120 CA cave cannot give that. The rationale in [[architecture-state]] §3 ("60–80 s walking leaves room for 6–8 min") is optimistic by ~3×. Realistic: **2–3.5 min per win, 1–2 min per early death.**

Fix options, cheapest first: (a) read the target as **session** length: 2–3 runs in 6–8 min fits the 5–10 min voter session of [[last-ember-design]] better than one long run (recommended, **NEEDS OWNER** wording only); (b) walk 120 → 90 px/s plus `BEACON_DIST_MIN` 120 → 220 gives ~4 min (feel cost: sluggish); (c) map 200×150 (gen cost ~1.6×, still < 50 ms). Score is unaffected: `max(0, 600 − s)` never clamps.

## 5. Does "deeper or out?" survive?

Original rule: turn back while `energy ≥ cost_back(d) ≈ drain × d / v` (the 50 % safety margin). Two facts of the current architecture remove it:

1. **The way back costs no flame.** Escape: flame frozen, resin ignored ([[architecture-systems-4]] §3). This follows the spec ("torch no longer needed"). Required margin = 0 E at every depth.
2. **"Out" does not exist before the Beacon.** `checkEnd` ends a descent only on `hp <= 0`; a win needs phase `escape` ([[architecture-systems]] §2). Walking back to the entrance unlit does nothing. Death keeps `depth × 100`.

So, per depth d: turning back is **strictly never dominant** (it yields no end state and no score), and a light reserve for the return is **strictly never needed**. Pushing deeper weakly dominates at every depth, even when nearly dead (dying at depth 39 = 3900 + time bonus). The 50 % rule of the spec is void.

What remains is real but different: (i) greed detours: a mineral = 25 pts = 25 s of time score; resin/plant detours; (ii) **HP carried into the escape**. Escape costs only HP (constant lunges, 5 pips, roll cooldown 1.5 s), and HP is lost in the descent only while the flame is out. So energy protects HP, and HP is the escape budget. That chain is indirect and invisible: the light gauge never says "you cannot get out".

For reference, with option O1 below (descent rules on the way back): mid player at D = 200 retreating from depth 30 walks 150 tiles (40 s) at ~1.3 E/s → **~52 E**. That reproduces the spec's ~50 % margin almost exactly, so the original intent was numerically sound.

### Options (proposals, not applied)

- **O1 – Retreat outcome (restores the literal decision). NEEDS OWNER.** In descent, reaching `world.exit` after `maxDepth ≥ 10` ends the run as `retreat` (flame keeps burning on the way back). Score `depth × 100 + hp × 50 + time + minerals`, no win bonus; death keeps only `depth × 50`. Touches the approved score formula and the win rule.
- **O2 – Beacon as the energy gate (tuning plus one rule inside the spec's Beacon ASSUMPTION; no spec change).** `beacon.minStartE = 40` (hold cannot start below 40 E), `burnPerS = [0.5, 0.7, 1.0, 1.4]`, zone-4 quotas small 2 → 1 and large 2 → 1, Beacon resin moved to the zone 3/4 border. Check: expert zero-resin then reaches the Beacon chamber at ≈ −9 E (flame out in zone 4). Arriving under 40 E forces a trip **back up** to zone 3 resin through denser shades. That restores a bounded "push on or go back for light" decision.
- **O3 – Seed fairness (pure tuning).** Scale burn by `200 / beaconDist`, or band `beaconDist` to 180–260 (reject attempts outside). Removes the 2.5× need spread of §3.

## 6. Feel knobs (top 8, ranges derived from §2–§5)

Refines [[architecture-tuning-2]] §9.

| # | Knob | Default | Range | Symptom it fixes |
|---|---|---|---|---|
| 1 | `flame.burnPerS` | .5/.6/.7/.8 | Z1 0.4–0.6, Z4 0.8–1.6 | Expert arrives at the Beacon > 50 E → raise Z3/Z4. Beginner flame-out before the Z2→3 border → lower Z1/Z2. |
| 2 | `resin.smallE` + Z3/Z4 quotas | 30 E; 3+2L / 2+2L | 20–35 E; Z4 small 1–2, large 0–2 | Supply/need > 3 → "flame always full" → lower. Supply/need < 1.3 → "empty runs" → raise. |
| 3 | `beacon.minStartE` (new, O2) + `beacon.costPerS` | 1 E; 3 E/s | 0–50 E; 3–6 E/s | Beacon is never a checkpoint and the arrival energy is irrelevant → raise. |
| 4 | `stalker.lungeChancePerS` | 0/.5/.6/.7 | Z2 0.3–0.7 | Beginner hit drain > 1.5 E/s in Z2 (attack every < 5 s) → lower. "Nothing behind me" → raise. |
| 5 | `parry.perfectS` | 35 ms | 18–50 ms | Sets P. "Experts never lose light" → 25 ms. "Perfects are luck" → 50 ms. Keep drain ratio beginner/expert ≤ 3. |
| 6 | `energyHitE` L/S/D | 12/20/35 | 8–16 / 14–26 / 25–45 | One hit takes > 30 % of the bar and feels unfair → lower. Hits shrug-off → raise. |
| 7 | `BEACON_DIST_MIN` / upper band (O3) | 120 / none | 180–220 / 260–300 | Run < 2 min, or seed need varies > 2× → narrow the band. |
| 8 | `ai.darkLungeMul` / `flameOutLungeMul` | 1.0 / 2.5 | 0.5–1.5 / 1.5–3 | Flame-out = certain death → lower. Flame-out harmless → raise. |

## 7. Day-4 tension test protocol

Duration about 5 minutes per tester. Use 3 scripted runs on fixed seeds 7, 42 and 1234 (write down `beaconDist`):

1. **Beeline** (~2 min): main path only, grab resin only when it is on the path, no mining.
2. **Greedy** (~3 min): every vein in sight, every chamber, every resin.
3. **God pace** (F2, optional): pure walk time to the Beacon. That calibrates A1 and the overhead factors.

Log at every zone border and at Beacon start (dev console line or debug overlay readout): `t`, `zone`, `energy`, `hp`, `resinUsed`, flame-outs so far, hits taken, parries by grade, veins mined.

| Metric | Pass band | Fail meaning → knob |
|---|---|---|
| Energy at Z2→3 border, beeline | 30–60 E | > 70: no tension → 1, 2. < 15: too harsh → 1, 4 |
| Energy at Beacon start, greedy | 20–50 E | > 60 → 1, 2, 3 |
| Flame-outs per run | ≥ 1 in 1 of 3 runs, ≤ 3 per run | 0 in all runs → 1, 2. > 3 → 4, 8 |
| Resin used per run | 4–9 | < 3: resin irrelevant → 2. > 12: drain too high → 1, 6 |
| Time per zone, beeline | 20–45 s | < 20 → 7 |
| Descent time, greedy | ≥ 120 s | shorter → 7, §4 options |
| Z1 parry attempts | 1 per 8–15 s | > 15 s apart: dead zone → `lurker.lungeChancePerS` |

After each fail, change one knob, hot-reload, replay the same seed. Recalibrate REALISM in §8 from the logged hit counts.

## 8. Reference simulator (sketch for `src/checks/economy.check.ts`) — SUPERSEDED

> **SUPERSEDED by [[architecture-economy-simulator]].** Do not implement this sketch: it uses 50-tile legs, the old constants and no start gate. The binding check is rewritten from [[architecture-scale-and-economy-2]] constants with the stepped method of [[architecture-scale-and-economy-3]] §1.2. Kept as history.

Expected value only: no State, no RNG, pure over `T` and a route. 58 lines. Note: the `node:assert` import below is also superseded; real checks under `src/` use a local `ok(cond, msg)` and no `node:` imports ([[architecture-rulings]] R-039).

```ts
// src/checks/economy.check.ts – expected-value flame economy, pure over T + a route
import assert from 'node:assert/strict'
import { T } from '../core/tuning.ts'
import type { MonsterKind } from '../core/types.ts'

type Leg = { tiles: number; overhead: number; resinS: number; resinL: number; veins: number }
type Skill = { perfect: number; facing: number }
type ZoneLog = { zone: number; t: number; eIn: number; eOut: number; minE: number }

const KINDS: MonsterKind[] = ['lurker', 'stalker', 'devourer']
const BUSY_S: Record<MonsterKind, number> = { lurker: 1.5, stalker: 4.8, devourer: 2.6 }
// ponytail: steady-state rates x REALISM, not a step sim; recalibrate REALISM from Day-4 logs
const REALISM = 0.6, MISS = 0.2, IMPERFECT = 0.725

export function attackRate(z: number, k: MonsterKind): number {
  const i = z - 1, w = T.director.weights
  const sum = KINDS.reduce((a, q) => a + w[q][i], 0)
  let alive = (T.director.maxAlive[i] * w[k][i]) / sum
  if (k === 'devourer') alive = Math.min(alive, T.director.devourerMax) * 0.5
  const M = T.monsters[k], lam = M.lungeChancePerS[i] * 1.5
  if (lam <= 0 || alive <= 0) return 0
  return (alive / (1 / lam + (M.lungeCdS[0] + M.lungeCdS[1]) / 2 + BUSY_S[k])) * REALISM
}

export function simulate(legs: Leg[], sk: Skill): ZoneLog[] {
  let e = T.flame.energyMax, t = 0
  return legs.map((L, i) => {
    const z = i + 1
    const dur = ((L.tiles * 32) / T.player.walkPxS) * (1 + L.overhead) + L.veins * T.mining.holdS
    let hitE = 0
    for (const k of KINDS) {
      const r = attackRate(z, k) * (k === 'stalker' ? 1 - sk.facing : 1)
      hitE += r * dur * (1 - MISS) * (1 - sk.perfect) * IMPERFECT * T.monsters[k].energyHitE
    }
    const drain = T.flame.burnPerS[i] * dur + hitE + L.veins * T.mining.holdS * T.mining.costPerS
    const n = L.resinS + L.resinL, slice = drain / (n + 1)
    const avg = n > 0 ? (L.resinS * T.resin.smallE + L.resinL * T.resin.largeE) / n : 0
    const eIn = e
    let minE = e
    for (let j = 0; j <= n; j++) {
      e -= slice; minE = Math.min(minE, e)
      if (j < n) e = Math.min(T.flame.energyMax, Math.max(0, e) + avg)
    }
    e = Math.max(0, e); t += dur
    return { zone: z, t, eIn, eOut: e, minE }
  })
}

const leg = (resinS: number, resinL: number, overhead: number, tiles = 50): Leg =>
  ({ tiles, overhead, resinS, resinL, veins: 1 })
const beacon = T.beacon.holdS * (T.beacon.costPerS + T.flame.burnPerS[3])
const beg = simulate([leg(4, 0, 1), leg(3, 0, 1), leg(2, 1, 1), leg(1, 1, 1)], { perfect: 0.4, facing: 0 })
const exp = simulate([leg(0, 0, 0.3), leg(0, 0, 0.3), leg(0, 0, 0.3), leg(1, 0, 0.3)], { perfect: 0.8, facing: 0.5 })
assert.ok(beg.every((z) => z.minE > 0), 'beginner route with on-path resin never flames out on average')
assert.ok(beg[3].eOut >= beacon, 'beginner can afford the Beacon hold')
assert.ok(exp[1].eOut <= 70, 'tension band: zero-resin expert below 70 E at the Z2->3 border')
const run = exp[3].t + T.beacon.holdS + (200 * 32 * 1.3) / (T.player.walkPxS * T.escape.sprintMul)
assert.ok(run >= 100 && run <= 480, 'expert run inside the pacing band')
```

Status against current defaults: asserts 1, 2 and 4 pass (beginner min ≈ 54 E, run ≈ 117 s). Assert 3 sits at the edge (expert 64.0 E vs 70). Tighten it to the §7 band (≤ 60) after the Day-4 retune. ponytail: expected values only; add a seeded Monte-Carlo over `stepMonsters` if variance (flame-out rate) needs a check.

## 9. Verdict

- **Feasibility:** passive burn is small (0.17 E/tile). Hits are 21 % (expert) to 57 % (beginner) of total drain; skill sets the need. Resin supply is 3–7× the need, and on-path resin alone covers every profile at D = 200. Defaults are generous: mid and expert players see no light pressure before zone 3. Need scales with `D`, so seeds differ up to 2.5×.
- **Pacing:** a competent win takes ~2.2 min (2–3.5 min range). The 6–8 min single-run target is **impossible** on this map at this walk speed. Treat 6–8 min as session length.
- **Deeper or out:** **does not survive as written.** The escape is energy-free and no pre-Beacon exit exists. Pushing deeper weakly dominates at every depth; tension reduces to greed detours and HP brought into the escape.

**Recommendation.** Do O2 and O3 first: Beacon start gate `minStartE ≈ 40`, steeper Z3/Z4 burn, thinner Z4 resin, and a narrower `beaconDist` band. These are tuning plus one rule inside the spec's own Beacon ASSUMPTION, so they need no spec change and can be tested in the Day-4 session with §7. They turn the Beacon into the point where the light gauge matters, and they make "go back up for resin" a real, bounded choice. In parallel, raise O1 (retreat outcome, death halves depth score) with saile2204 as an open question in [[last-ember-open-questions]]. Only O1 restores the literal "deeper or out?" with the spec's 50 % margin, which §5 shows is numerically sound (~52 E at depth 30). It touches the approved score formula and the win rule, so it must not be decided by architecture.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-state]]
- [[last-ember-open-questions]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-economy-simulator]]
- [[architecture-rulings-3]]

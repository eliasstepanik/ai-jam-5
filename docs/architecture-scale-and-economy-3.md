---
type: architecture
title: Last Ember – Economy Ruling (binding) – 3/3 Decision, Scaling, Score Ranges, Tension Test
description: Binding ruling part 3 for the enlarged 320x240 map – the push-or-back-fill decision structure built from O2 (Beacon start gate at 40 E, steeper burn, front-loaded resin) plus O3 (path band), monster director scaling for longer zones, rock cadence for the 80–120 s escape, recomputed score ranges for 6–8 minute runs, the Day-4 tension test protocol with an 8-knob table, and the FINAL scaling values; the economy check simulator lives in architecture-economy-simulator.
tags: [project, ai-jam-5, architecture, last-ember, rulings, balance]
timestamp: 2026-10-18T11:00:00Z
---

# Last Ember – Economy Ruling (binding) – 3/3

Part 3. Previous: [[architecture-scale-and-economy]] (map, D band), [[architecture-scale-and-economy-2]] (energy rescale). BFS budget: [[architecture-scale-and-economy-4]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. Register: [[architecture-rulings]]. Base analysis: [[architecture-economy-check]] §2–§5. Values: [[architecture-tuning]], [[architecture-tuning-2]] §3, §5, §9. AI: [[architecture-monsters-ai]]. Rocks: [[architecture-rocks]] §2. Score: [[architecture-scoring-and-save]].

**Owner delegation (2026-10-18):** "deeper or out?" is solved by architecture with **O2 + O3** of [[architecture-economy-check]] §5. **O1 rejected** (it changes the approved score formula and win rule). Frozen: score `depth*100 + (win ? 1000 : 0) + max(0, 600 − seconds) + minerals_used*25 + hp_left*50`, win rule, no-shortcuts rule, escape rules (escape stays energy-free).

## 0. Inputs (binding sources)

Refined 2026-10-18: §0–§1 recomputed from [[architecture-scale-and-economy-2]], which is binding for every energy value. Method: [[architecture-economy-check]] §0, §3 as restated in part 2 §0. From part 1: map 320×240, D band 510–690 (D\* 600), zone = D/4 = 127.5 / 150 / 172.5 tiles, walk 3.75 tiles/s.

| Constant | Value | Source |
|---|---|---|
| `flame.energyMax` / start | 100 / 100 | part 2 §2 |
| `flame.burnPerS` Z1..Z4 | .50 / .70 / 1.00 / 1.40 | part 2 §2 |
| `resin.smallE` / `largeE` | 25 / 50 | part 2 §2 |
| Mining | 3 E/s × 2 s = 6 E per vein; 1.5 veins per zone = 9 E, 3 s | part 2 §2, §0 |
| Beacon hold | 4 E/s × 5 s + burn = 27 E | part 2 §2 |
| `beacon.minStartE` | 40 E; a press below the gate is denied | part 2 §2 |
| Near-path resin (D\*) | small 3/4/5/4, large 0/0/1/1; only in the first 60 % of each zone | part 2 §3.1, §3.2 |
| Off-path resin (D\*) | small 3/3/2/1, large 0/1/1/1 | part 2 §3.1 |
| Beacon cluster | 1 L + 2 S = 100 E, dist ∈ [bd−28, bd−10], ≤ 6 tiles from main | part 2 §3.4 |
| Plants / veins per zone | 2/2/3/3 / 10/9/8/7 | part 2 §3.1 |
| Count scaling | `round(density × bd/4 / 100)` | part 2 §3.1 |
| Winnable rule #14 | `Z4_E_PER_TILE 1.15`, `MARGIN 15` | part 2 §3.4 |

Profiles (part 2 §0, §4): zone time `t` at D 510/600/690: beginner 71/83/95 s (+100 % overhead, P40, takes all resin), mid 57.4/67/76.6 s (+60 %, P60, near-path resin), expert 47.2/55/62.8 s (+30 %, P80, near-path resin). Net drain E/s Z1..Z4: beginner .77/1.93/2.77/3.29, mid .68/1.37/2.00/2.47, expert .59/.96/1.41/1.84. Zone need = net × t + 9 E. Pickups sit at slots `(k+0.5)/n × 0.6` of the zone (beginner `× 0.8` over all resin), drain is linear, energy clamps at 100, cluster detour 12 tiles = 3.2 s booked 4 E each way.

## 1. The decision structure

### 1.1 What the player trades off (mid, D\*, plain flame unless stated)

| Lever | Cost | Gain |
|---|---|---|
| **Beacon start gate** (40 E) | a press below 40 E is denied; the hold then costs 27 E | – |
| **Burn .50 → 1.40 E/s** | Z4 burns 2.8× Z1; a full bar lasts 71 s of pure Z4 burn (zone 67 s) | – |
| **Placed resin / mid need** | Z1 150/54.6 = **2.75**, Z2 225/100.8 = **2.23**, Z3 275/143.0 = **1.92**, Z4 225/174.5 = **1.29** (1.86 with cluster). Near-path only: 1.37 / 0.99 / 1.22 / 0.86 (1.43) | – |
| **Cap 100 E** | Z1/Z2 surplus is lost; the 100 E cluster is a full refill, not a bank | – |
| **Sodium** (burn ×1.5, hits ×1.6) | Z3 2.00 → 3.10, Z4 2.47 → 3.81 E/s (+54 %) | vision |
| **Strontium** (hits ×0.5) / **Copper** (≈ same hit effect) | strontium: worse vision | Z4 2.47 → 1.94 E/s (−22 %) |
| **Mining** | Z4 vein = 6 E + 2 s × 2.47 = **10.9 E**, 2 time pts | 25 pts per piece |
| **Plant detour** | 30 tiles round trip = 8 s: Z3 16.0 E, Z4 19.8 E, −8 time pts | +1 HP = 50 pts |

Kept assumption: hit drain scales with attraction (sodium ×1.6, strontium ×0.5). Energy floors at 0 while dark (flame-out); deficits do not carry.

### 1.2 Arrival energy (part 2 §4 stepped method)

**Mid at D\*, worked** (t 67 s, zone need = net × 67 + 9 = 54.6 / 100.8 / 143.0 / 174.5 E):
- Z1: 3 S at .1/.3/.5 all hit the cap → `100 − 0.5 × 54.6` = 72.7.
- Z2: 4 S at .075/.225/.375/.525, gap `0.15 × 100.8` = 15.1: 72.7 → 65.1 + 25 = 90.1 → 75.0 + 25 → 100 → 100 → `100 − 0.475 × 100.8` = **52.1 at depth 20**.
- Z3: 5 S + 1 L at .05…55 (L at .35), gap 14.3: 44.9 + 25 → 55.7 + 25 → 66.4 + 25 → 77.1 + 50 → 100 → 100 → `100 − 0.45 × 143.0` = **35.7**.
- Z4: 4 S + 1 L at .06…54 (L at .30), gap 20.9: 25.2 + 25 → 29.2 + 25 → 33.3 + 50 = 83.3 → 87.4 → 91.4 → `91.4 − 0.46 × 174.5` = **11.1** without cluster. Cluster at bd−20 (.867): `91.4 − 0.327 × 174.5` = 34.3, −4, +100 → 100, −4, `− 0.133 × 174.5` → **72.8**.

**Beginner zone 4 at D\*, worked** (t 83 s, need 3.29 × 83 + 9 = 282.1; all resin 5 S + 2 L at `(k+.5)/7 × 0.8`, L at k = 2, 5, gap 32.2): 41.6 → 25.5 + 25 → 18.3 + 25 → **11.1** + 50 → 28.9 + 25 → 21.6 + 25 → 14.4 + 50 → 57.2 at .743 → `57.2 − 0.124 × 282.1` = **22.2 at the cluster** → −4, +100 → 100, −4 → `96 − 0.133 × 282.1` = **58.4**. Without cluster: `57.2 − 0.257 × 282.1` = −15.3, dark ≈ 4.6 s before the Beacon.

| Profile (overhead) | D | t s | Depth 20 | Z3→4 | Z4 dip | Beacon, no cluster | Beacon, with cluster |
|---|---|---|---|---|---|---|---|
| Beginner (+100 %) | 510 | 71.0 | 62.5 | 48.6 | 17.7 | 6.0 | **57.9** |
| Beginner | 600 | 83.0 | 57.7 | 41.6 | 11.1 | dark (−15) | **58.4** |
| Beginner | 690 | 95.0 | 53.0 | 34.7 | 4.3 | dark (−37) | **58.7** (≈ 0 E at the cluster) |
| Mid (+60 %) | 510 | 57.4 | 56.2 | 43.1 | 31.8 | 17.4 | **72.3** |
| Mid | 600 | 67.0 | 52.1 | 35.7 | 25.2 | 11.1 | **72.8** |
| Mid | 690 | 76.6 | 47.6 | 28.1 | 18.2 | 5.0 | **73.0** |
| Expert (+30 %) | 510 | 47.2 | 72.9 | 65.2 | 58.0 | **54.5** | skips |
| Expert | 600 | 55.0 | 70.6 | 61.0 | 54.4 | **49.3** | skips |
| Expert | 690 | 62.8 | 68.1 | 56.8 | 50.6 | **43.9** | skips |

Z4 dip = lowest energy before a Z4 pickup. Counts for D ≠ 600 follow part 2 §3.1. Cross-check: every value in the part 2 §4 table matches within 0.2 E (rounding). Beginner and expert rows at 510/690 are new. Beginner L slots: k = 2, 4 at 510 (n 6); k = 2, 5 at 690 (n 8). Mid at 510 reaches the cluster with 41 E: the gate would pass without the cluster if mid stopped there (it does not, the Beacon is 20 tiles further).

**Inconsistencies inside part 2 (flagged, not fixed there):**
- P2-a §4 table and beginner text: "out ≈ 5 s before the cluster". Its own walk gives 57.3 − 35.0 = 22.3 E **at** the cluster (lit). The beginner goes dark ≈ 4.6 s before the **Beacon** only when skipping the cluster. Only at DMAX does the beginner reach the cluster at ≈ 0 E.
- P2-b §4 "push and walk back ≤ 34 tiles … +100 E for ≤ 34 E": a 34-tile walk-back costs `2 × 34 / 3.75 × 2.47` = 45 E, and usable gain is `100 − e`, not 100. Still pays (x_max 75.9 tiles, §1.4).
- P2-c §2 mining: "6 E + ~2.8 E zone-4 drain while standing". 2.8 E is burn only (2 s × 1.4); with hits 2 s × 2.47 = 4.9 E, so a Z4 vein costs ≈ 10.9 E.
- P2-d §0 zone time `walk × 1.6 + 3 s` = 67 s omits part 1's fight stops (30 s) and teaching (10 s); part 1 §5 states ≈ 77 s. See §1.6 item 6.
- P2-e §0 keeps the old hit drains (calibrated on 50-tile zones); part 2 §6.1 already lists this as a risk.

### 1.3 Where a descent runs dry (mid D\* unless stated)

- **Greedy mid in Z4** (+20 s: 1.5 extra veins 3 s + 9 E, one plant 8 s, 9 s pocket search): need `2.47 × 87 + 18` = 232.9, gap 27.9 → 59.9 at .54 → `59.9 − 0.327 × 232.9` = **−16.3: dark ≈ 6.6 s before the cluster**. If the search finds the Z4 off-path 1 S + 1 L (75 E) first: cap 100 → 23.8 E at the cluster, lit.
- **Sodium in Z4** (3.81 E/s, need 264.4): 42.9 at .54 → **−43.6, dark ≈ 11 s** before the cluster. Dropping sodium at .54 still leaves −14.2 (≈ 6 s dark).
- **Sodium through Z3** (3.10 E/s, need 216.7): Z3 ends `100 − 0.45 × 216.7` = **2.5 E**, dark ≈ 3 s before Z4 slot 1. The Z4 large and the cluster still give 72.8: one flame-out, no gate effect.
- **Beginner plain:** dip 11.1 (D\*), 4.3 (DMAX); one stalker hit (20 E) in Z4 means a flame-out.
- **Beginner strontium/copper in Z4** (2.35 E/s, need 203.6): dip 30.0, cap at .743, **47.7 E at the Beacon without the cluster**: passes alone.
- **Expert:** never dry; 43.9–54.5 E without the cluster.

### 1.4 Break-even walk-back

A retreat walks a known route at overhead `o` (mid/expert 1.0; beginner 1.3, as in `Z4_E_PER_TILE`) and drain `d`. `x` tiles out and back cost `2x·o / 3.75 × d` E and as many time points. Usable gain `G' = min(G, 100 − e_at_pickup)`. **`x_max = 1.875 × G' / (o × d)`**.

| Gain | Z3 mid (d 2.00) | Z4 mid (d 2.47) | Z3 beginner (2.77, o 1.3) | Z4 beginner (3.29, o 1.3) |
|---|---|---|---|---|
| Small 25 | 23.4 | 19.0 | 13.0 | 11.0 |
| Large 50 | 46.9 | 38.0 | 26.0 | 21.9 |
| Cluster, G' ≤ 100 | – | ≤ 75.9 | – | ≤ 43.8 |

**Zone 4** (mid skipped the cluster; Beacon at 11.1 E, press denied): cluster ≤ 26 tiles back. Out `26 / 3.75 × 2.47` = 17.1 E → ≈ 2.4 s dark, relight to 100, back −17.1 → **82.9 E**, gate passes; 14 time pts plus one flame-out. The last Z4 near-path slot (.54) is 69 tiles back: > 38, never pays.
**Zone 3** (mid at the Z3→4 border with 35.7 E; Z3 off-path large 30 tiles back): cost `2 × 30 / 3.75 × 2.00` = 32 E → 53.7 E (+18), 16 time pts, x 30 < 46.9: pays at the border. But Z4 hits the cap at its large (51.3 + 50 → 100), so Beacon arrival stays 11.1 / 72.8. The 18 E only lift the Z4 dip 25.2 → 43.2 (one stalker hit of insurance).

**Decision rule:** at the last Z4 near-path slot (.54; 69 tiles before the Beacon, 49 before the cluster) the **Z4 greed budget** is `e − 0.327 × Z4need` (mid 91.4 − 57.1 = 34.3 E ≈ 14 s at 2.47: one plant + one vein). Over budget → back-fill to a seen off-path pocket inside `x_max`, or take dark time. At the cluster: take it unless `e − remaining drain ≥ 40` with margin (experts only).

### 1.5 Seed fairness (O3)

With the cluster, arrival is flat across 510–690: mid 72.3–73.0, beginner 57.9–58.7 (the refill to the cap resets the D spread). Without it: mid 17.3 / 11.1 / 5.0, expert 54.5 / 49.3 / 43.9. The DMAX risk is the beginner Z4 dip (17.7 → 4.3 E), not the gate. ponytail: band only, no `burnScale`; add `burnScale = 600 / beaconDist` if Day-4 DMAX seeds flame out in Z4 more often than DMIN seeds.

### 1.6 Verdict and residual weaknesses (honest)

**Verdict:** "push on or walk back" exists, but narrower than the first draft claimed. It is a **Z4 greed-budget decision** (mid ≈ 34 E after .54; beginner margin ≈ 11 E) plus a forced walk-back penalty for skipping the cluster. At mean, plain mid and beginner runs face no gate decision: the cluster (8 E for ≥ 62 E) dominates, and any lit arrival at it passes with 58–73 E. The gate binds on overspend (greed, sodium, hit variance) and on experts skipping the cluster (margin 4–15 E).

1. No pre-Beacon exit (O1 rejected): the choice is overspend vs back-fill, not "leave".
2. Cluster dominance: a real mean-run decision would need a costlier cluster (further from main, or smaller). Tuning belongs to the §5 knobs.
3. Cap + front-loading wipe cross-zone back-fill at the Z4 large: retreats into Z3 never change Beacon arrival, only the Z4 dip.
4. Beginner Z4 dip 4–18 E; at DMAX the beginner reaches the cluster at ≈ 0 E. Means only; Day 4 must log flame-outs.
5. Post-cluster variance soft-lock: arrival after the cluster = `96 − 0.133 × Z4need` (beginner 58.4). A devourer hit (35 E) in the last 20 tiles leaves 23.4 < 40 with all near-path resin used; only unexplored Z4 off-path resin (≤ 1 S + 1 L) remains. Rule #14 does not cover this.
6. Zone time: part 2 uses 67 s (walk × 1.6 + 3 s); part 1 §5 says ≈ 77 s with fight stops. At 77 s mid Z4 need = 199.2 E and cluster arrival 69.4 E. Direction unchanged; numbers here follow part 2.

## 2. Monster director scaling

**Per-time, not per-tile.** The director is player-local: spawns at `R + 60..140 px`, despawn at 560 px, cap `maxAlive[z]` ([[architecture-tuning-2]] §3). Map area does not enter the formula; per-tile density (×4 area → ×4 monsters) would break the cap. What scales is zone duration: mid 23 s → **67 s at D\*** (57–77 s over the band, [[architecture-scale-and-economy-2]] §0), so hits per zone grow ×2.9. Part 2 §4 already books that drain.

**Decision (binding; follows part 2 §0 "monsters and director unchanged"):**

| Key | Value | Reason |
|---|---|---|
| `director.maxAlive` | 3/5/6/7 (unchanged) | part 2 arrival energies (mid 52 E at depth 20, 11 E at the Beacon without the cluster) use these rates. Lower caps would lift mid over the gate and remove the cluster decision |
| `director.spawnIntervalS` | 4/3.5/3/2.5 (unchanged) | interval ≪ zone time; the director sits at its cap, so the cap governs |
| `energyHitE` L/S/D | 12/20/35 (unchanged, **spec** L < S < D) | stalker 20 E = 20 % of the bar, inside the [[architecture-economy-check]] §6 range 14–26 |
| `MONSTERS_MAX` | 24 (unchanged) | worst alive: descent Z4 7, sodium `round(7 × 1.6)` = 11, escape 8. 2× headroom, ≤ 8 KB State ([[architecture-scale-and-economy-4]] §1.1) |
| Escape `maxAlive` / interval | 8 / 1.2 s (unchanged, escape rules frozen) | escape costs HP only; longer escapes mean more lunges, watched by §5 knob 7 |

Refined 2026-10-18: the first draft cut `maxAlive` to 3/4/5/6 and stalker to 16 E. That is **withdrawn**: it contradicted part 2 §0.

Attack rates ([[architecture-economy-check]] §3, REALISM 0.6, mid facing 25 %), attacks/s: Z1 0.065 · Z2 0.177 · Z3 0.230 · Z4 0.242. **Per 67 s zone: 4.4 / 11.9 / 15.4 / 16.2.** Non-perfect connects `× 0.8 × (1 − P)`, at P 60: **1.4 / 3.8 / 4.9 / 5.2**.

Hit E per zone at mid pace (67 s, facing 25 %; raw E/s 0.78 / 2.89 / 4.31 / 4.61 × factor `0.8 × (1−P) × 0.725`). Burn per zone at part 2 rates: 33.5 / 46.9 / 67.0 / 93.8 = 241 E; mining 4 × 9 = 36 E; hold 27 E. Energies use the part 2 §4 stepped method (front-loaded near-path resin, cap 100, cluster at `bd − 20`, 4 E detour each way).

| P | Factor | Z1 | Z2 | Z3 | Z4 | Hits | Need incl. hold | Depth 20 | Z3→4 | Beacon, no cluster | Beacon, cluster |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 40 % | 0.348 | 18.2 | 67.4 | 100.4 | 107.4 | **293 E** | 597 E | 41.4 | 20.6 | out (−39) | **68.1** (out ≈ 8 tiles before the cluster) |
| 60 % | 0.232 | 12.1 | 44.9 | 67.0 | 71.7 | **196 E** | 500 E | 52.1 | 35.7 | 11.1 | **72.8** |
| 80 % | 0.116 | 6.0 | 22.4 | 33.4 | 35.8 | **98 E** | 402 E | 62.8 | 50.7 | 36.2 | **77.6** |

Supply on the near-path route: 100 start + 500 near-path resin + 100 cluster = 700 E, minus cap waste. Parry savings: P 40 → 60 saves **97 E** per run (≈ 4 small resin), 36 E of it in Z4; P 60 → 80 saves another **98 E**. Without the cluster P 40 flames out and P 60/80 miss the gate (11 / 36 E). The cluster refills to the cap and flattens all three to 68–78 E. At mid pace, skill buys margin before the cluster, not a different Beacon outcome. Only expert pace (55 s per zone, part 2 §4: 49 E) skips the cluster.

### 2.1 FINAL scaling values (binding, 2026-10-18)

| Key | Value | Reason |
|---|---|---|
| `director.maxAlive` Z1..Z4 | 3 / 5 / 6 / 7 | part 2 §0 unchanged; §1.2 energies assume these caps |
| `director.spawnIntervalS` Z1..Z4 | 4 / 3.5 / 3 / 2.5 s | interval ≪ zone time; the cap governs |
| `energyHitE` lurker / stalker / devourer | 12 / 20 / 35 | spec order L < S < D; stalker inside [[architecture-economy-check]] §6 range 14–26 |
| `MONSTERS_MAX` | 24 | worst alive 11 (sodium Z4); 2× headroom, ≤ 8 KB State |
| Escape `maxAlive` / interval | 8 / 1.2 s | escape rules frozen; costs HP only |
| `rocks.rampS` | 80 s | §3: rate keeps rising through a 104 s escape |
| `ROCKS_MAX` | 200 | §3: not reached at DMAX (152); worst 204 × 126 B ≈ 25.7 KB |
| `rocks.pendingMax` | 4 | unchanged ([[architecture-rocks]] §2) |
| First rock delay (`T.escape.firstRockS`) | 1.5 s after `lightBeacon` | [[architecture-rocks]] first-rock row, [[architecture-systems-4]] |
| `beacon.minStartE` | 40 E | part 2 §2 gate; > hold 27 E, so a passed gate completes the hold |

## 3. Rock cadence for the 80–120 s escape

Ramp ([[architecture-rocks]] §2): `rate(e) = 0.6 + 1.0 × min(1, e / rampS)` rocks/s. Integral for `T ≥ rampS`: `N(T) = 1.6 T − 0.5 × rampS`.

| Escape T | Old rampS 60 | New rampS 80 |
|---|---|---|
| 88 s (DMIN) | 111 | 101 |
| 104 s (D\*) | 136 | 126 |
| 120 s (DMAX) | 162 | 152 |

The old cap of 120 landed rocks is reached at `T = (120 + 30) / 1.6` = **94 s**. At D\* and above, the last 10–26 s of the escape would spawn only dust, so tension would drop exactly at the finish. **Decision (DEFAULT): `T.rocks.rampS` 60 → 80 s, `ROCKS_MAX` 120 → 200.** The cap is not reached even at DMAX with 100 % acceptance (152). Density on the route: 126 rocks / 600 tiles = **0.21 per tile**, old 44 / 250 = 0.18. The feel is unchanged. `rateStart` 0.6, `rateEnd` 1.6 and `pendingMax` 4 stay. State cost: worst 204 rocks (cap 200 + `pendingMax` 4) × ≈ 126 B JSON ≈ **25.7 KB**; worst-case State 154–159 KB stays inside the 180 KB soft budget ([[architecture-scale-and-economy-4]] §1.1). Route-guarantee BFS cost per step on the 76 800-tile grid is handled in [[architecture-scale-and-economy-4]].

## 4. Score ranges at 6–8 minutes

Mid timeline: zone borders at 77 / 154 / 231 / 308 s, hold to 313 s, escape to 417 s.

| Case | depth | won | s | min. used | hp | depth | win | time | min. | hp | **Score** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Death zone 2 | 15 | no | 115 | 1 | 0 | 1500 | 0 | 485 | 25 | 0 | **2010** |
| Death zone 3 | 25 | no | 193 | 3 | 0 | 2500 | 0 | 407 | 75 | 0 | **2982** |
| Death zone 4 | 35 | no | 270 | 5 | 0 | 3500 | 0 | 330 | 125 | 0 | **3955** |
| Death in escape | 40 | no | 380 | 6 | 0 | 4000 | 0 | 220 | 150 | 0 | **4370** |
| Slow win | 40 | yes | 480 | 6 | 2 | 4000 | 1000 | 120 | 150 | 100 | **5370** |
| Mid win | 40 | yes | 417 | 6 | 3 | 4000 | 1000 | 183 | 150 | 150 | **5483** |
| Fast win | 40 | yes | 360 | 8 | 3 | 4000 | 1000 | 240 | 200 | 150 | **5590** |
| Perfect win (expert, DMIN) | 40 | yes | 307 | 12 | 5 | 4000 | 1000 | 293 | 300 | 250 | **5843** |

Bounds: worst win (565 s, hp 1, 0 minerals) = **5085**. Best realistic death (escape, ~350 s, 15 minerals) = 4000 + 250 + 375 = **4625**. **Any win still beats any death.** Range ≈ 2000–5850 (old ≈ 500–6000).

**Time weight shift** (formula unchanged): old wins scored 403–483 time points, new wins score 35–293. Between a slow and a fast win, the gap is 120 pts = 2.4 HP pips = 4.8 minerals. HP and minerals now outweigh speed between wins. A plant detour (+50, −8) is always score-positive. Early deaths keep a large time term (485 in zone 2), but depth dominates (×100 per level).

## 5. Day-4 tension test protocol

### 5.1 Script

Seed **42** (fixed; write down `beaconDist`, it must lie in 510–690). F3 overlay on, no god mode. Tester plays a **scripted 5-minute descent** (≈ 308 s mid pace):

1. **Run A, beeline:** main path; pick resin only on the path; 1–2 veins per zone; plain flame. Stop at the Beacon. Try to start the hold; record whether the gate blocks.
2. **Run B, greedy:** every vein in sight, every plant, sodium from Z3 on. On a gate block, back-fill by the §1.4 rule and log the detour.
3. Optional: repeat A on seeds 7 and 1234 for DMIN/DMAX spread.

### 5.2 Log (one line per zone border + Beacon arrival + gate result)

`t`, `zone`, `energy`, `hp`, `resinUsed` (pickups, incl. cap-wasted), `resinWastedE`, flame-outs so far, attacks, hits taken (non-perfect connects), parries by grade, veins mined, plants eaten, back-fill detours (tiles, E gained).

| Metric | Pass band | Fail → knob |
|---|---|---|
| Time per zone, A | 60–95 s (§1.2 mid 67 s; part 1 ≈ 77 s) | < 60 → 8; > 95 → 4 |
| Descent time, A | 260–340 s | outside → 8, part 1 overhead model |
| Energy at Z3→4 border, A | mid **35–45 E** (§1.2: 35.7); beginner 35–50 (41.6); expert 55–65 (61.0) | below band → 1 lower, 2 +1 L; above → 1 raise |
| Energy at Beacon arrival, A | **with the cluster 40–80 E** (§1.2 mid 72.8, beginner 58.4). Without: mid ≈ 11 (gate blocks), expert 44–55 (passes) | > 80: no tension → 1, 2; < 40 → 2, 4 |
| Gate in B | **blocks in B (Beacon < 40 E)**, back-fill ≤ 60 tiles fixes it (cluster x_max 75.9, §1.4) | never blocks → 1, 3; unfixable → 2 |
| Flame-outs | A: 0–1; B: ≥ 1 (§1.3 greedy/sodium dark before the cluster) | A > 1 → 4, 5; B = 0 → 1 |
| Resin used | A 18–21 (near-path 16 S + 2 L, cluster 3); B 21–33 (+ off-path 9 S + 3 L) | A < 15 → 2 (too rich); B > 33 → 1, 4 |
| Hits taken per zone, A | Z1 1–3, Z2 3–6, Z3 4–8, Z4 5–9 | high → 4, 5; low → 4 |
| Z1 attack spacing | 1 per 8–20 s | > 20 s → `lurker.lungeChancePerS` |

After each fail, change one knob, hot-reload ([[architecture-tuning-2]] §8), replay the same seed. Recalibrate REALISM 0.6 from logged attacks/s.

### 5.3 Knob table

| # | Knob | Default here | Range | Symptom it fixes |
|---|---|---|---|---|
| 1 | `flame.burnPerS` Z3/Z4 | 1.00 / 1.40 | .80–1.20 / 1.10–1.80 | Beacon arrival > 80 (no gate pressure) → raise Z4; experts coast without the cluster → raise Z4 to 1.6 |
| 2 | Z3/Z4 resin quotas, near-path (part 2 §3.1) | Z3 5 S + 1 L, Z4 4 S + 1 L; cluster 1 L + 2 S | Z3/Z4 S 3–6, L 0–2; cluster S 1–3 | Gate unfixable or beginner wins < 1 in 3 → Z4 +1 L; arrival > 80 → −1 S |
| 3 | `beacon.minStartE` | 40 | 30–55 (keep > hold 27) | Gate never blocks in greedy runs → raise; blocks in beelines with the cluster → lower |
| 4 | `director.maxAlive` Z1–Z4 | 3/5/6/7 (§2) | 2–4 / 4–6 / 5–7 / 6–8 | Hits per zone out of band; "empty corridors" → +1 |
| 5 | `stalker.energyHitE` | 20 | 14–26 | One stalker hit feels > 25 % of the bar → lower; hits shrugged off → raise |
| 6 | `parry.perfectS` | 35 ms | 25–50 ms | P40/P80 drain ratio > 3.5 → widen; experts never lose light → narrow |
| 7 | `rocks.rampS` / `ROCKS_MAX` / escape `maxAlive` | 80 s / 200 / 8 | 60–100 s / 150–200 / 6–8 | Last 20 s of escape calm → lower rampS; escape deaths > 1 in 2 runs → `maxAlive` 6 |
| 8 | `DMAX` (part 1 band) | 690 | 620–690 | Zone > 95 s or escape > 110 s feels long → lower |

## 6. Reference simulator

Moved 2026-10-18 to [[architecture-economy-simulator]] (`src/checks/economy.check.ts`), rewritten from part 2 constants with the §1.2 stepped method.
Its asserts pin the §1.2 table at D\* within ±1 E and the gate blocks for greedy and sodium runs (§1.3).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-economy-check]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-economy-simulator]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai]]
- [[architecture-rocks]]
- [[architecture-scoring-and-save]]

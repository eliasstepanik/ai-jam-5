---
type: architecture
title: Last Ember – Cave Generation (4/4) – 320x240 Placement Quotas, Validation, Fallback, Tests
description: Last Ember cave generator part 4 – per-zone placement quotas with densities per 100 path tiles and count scaling by beaconDist, front-loaded near-path resin, the Beacon resin cluster placed first, replaced validateCave rules #1, #5, #11, #13 and the new always-winnable rule #14, the rescaled fallback ring cave, the 320x240 performance numbers and the rewritten npm run check cave test list. Copies the binding values of the scale and economy rulings.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-21T01:00:00Z
---

# Last Ember – Cave Generation (4/4) – Placement, Validation, Fallback, Tests at 320×240

Part 4 of 4. Previous: [[architecture-cave-generation-3]] (macro layout, rejection, loop constants). Base: [[architecture-cave-generation]], [[architecture-cave-generation-2]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. **Binding source:** [[architecture-scale-and-economy-2]] (SAE2) §2–§3, §5; [[architecture-scale-and-economy]] (SAE1) §6; [[architecture-scale-and-economy-4]] (SAE4) §1.10, §2, §3 rows 36–45. This file replaces part 2 §2 table, §3.1, §3.4 step 5, §6 fallback steps 1, 3, 4, 6, §6.1 rows 1, 5, 11, 13, §7 and §9. No value here is new.

## 1. Placement quotas (replaces part 2 §3.1)

Counts at D\* = 600 (zone 150 tiles); density per 100 path tiles in brackets (SAE2 §3.1):

| Item | Zone 1 | Zone 2 | Zone 3 | Zone 4 | Tag | Placement |
|---|---|---|---|---|---|---|
| resin small, near-path | 3 (2.00) | 4 (2.67) | 5 (3.33) | 4 (2.67) | `'cave:resin'` | `nearMain`, `wide2`, front-loaded slots §2; zone-1 count includes T1 |
| resin large, near-path | 0 | 0 | 1 (0.67) | 1 (0.67) | `'cave:resin'` | `nearMain`, middle slot `k = floor(n/2)` |
| resin small, off-path | 3 (2.00) | 3 (2.00) | 2 (1.33) | 1 (0.67) | `'cave:resin'` | not `nearMain`, any dist in the zone |
| resin large, off-path | 0 | 1 (0.67) | 1 (0.67) | 1 (0.67) | `'cave:resin'` | dark-chamber bundle first, then off-path |
| plants | 2 (1.33) | 2 (1.33) | 3 (2.00) | 3 (2.00) | `'cave:plants'` | `','` tiles, `wide2` |
| veins | 10 (6.67) | 9 (6.00) | 8 (5.33) | 7 (4.67) | `'cave:veins:<z>'` | as part 2 §3.1; pieces 1/1/2/2 |
| **Beacon cluster** | – | – | – | 1 large + 2 small (fixed) | `'cave:resin'` | §3; replaces the single Beacon resin |
| decor, initial monsters | as part 2 §3.1 | | | | | unchanged |

Totals at D\*: resin 33 (27 small, 6 large, 975 E), plants 10, veins 34, pickups 43.

**Count scaling (O3 fairness, R-153):** `n = Math.floor(density × (beaconDist / 4) / 100 + 0.5 + 1e-9)` per row (round half up, epsilon guards float `x.4999…` at exact .5); `density` = the 2-decimal literal printed in the table above (6.67, not 20/3), stored as that literal in code. Cluster fixed. Pinned case: bd 510, zone-1 veins `6.67 × 127.5 / 100 = 8.50425` → 9 (test 7).

| D | near small | near large | off small | off large | plants | veins | pickups (+ ≤ 3 #14b) |
|---|---|---|---|---|---|---|---|
| 510 | 3/3/4/3 | 0/0/1/1 | 3/3/2/1 | 0/1/1/1 | 2/2/3/3 | 9/8/7/6 | 40 (43) |
| 600 | 3/4/5/4 | 0/0/1/1 | 3/3/2/1 | 0/1/1/1 | 2/2/3/3 | 10/9/8/7 | 43 (46) |
| 690 | 3/5/6/5 | 0/0/1/1 | 3/3/2/1 | 0/1/1/1 | 2/2/3/3 | 12/10/9/8 | 46 (49) |

The old rule `k % 5 < 3` is replaced by the explicit near/off split. Mineral weights (part 2 §3.2) unchanged.

`CHAMBERS` (part 2 §2): max 2 per zone unchanged (SAE2 does not change it). Pocket counts: logged, not asserted; shortage → off-path (R-116). DEFAULT expectation ≥ 2 pockets per zone; the cave check logs min/mean per zone (§7 test 11), Day-4 review only.

Spacing (part 2 §3.3) unchanged, except: resin ↔ resin ≥ 10 does not apply inside the Beacon cluster (≥ 3 between its 3 items).

## 2. Front-loading (SAE2 §3.2)

Near-path slot `k` of `n` in zone `z` targets dist `zStart + (k + 0.5) / n × 0.6 × Z` with `Z = bd / 4`; candidates = `nearMain ∩ wide2` tiles with `dist ∈ [target − 8, target + 8]`. Every slot draws **exactly 24** tries (`rnd.int(0, n − 1)`, 1 draw each, drawn even after a hit); of the tries passing spacing (as above) take minimal `|dist − target|`, tie → lowest try index; none passes or empty window → slot empty, still 24 draws (R-117). All near-path resin therefore lies in the **first 60 % of each zone**; the last 40 % has only off-path resin, and in zone 4 the cluster.

## 3. Beacon cluster (SAE2 §3.4)

1 large + 2 small on `wide2` floor, outside `beaconMask`, `dist ∈ [bd − 28, bd − 10]`, Chebyshev ≤ 6 to a `main` tile, ≥ 3 apart. Inside the last 60 path tiles.

Order (replaces part 2 §3.4 step 5): the cluster is placed **FIRST** in `'cave:resin'`, before chamber bundles and zone resin. No candidate → relax once to Chebyshev ≤ 10 and `dist ∈ [bd − 40, bd − 8]`. Still none, or #14a fails → attempt rejected, `why: 'winnable'`. After zone resin: if #14b fails, add zone-4 near-path smalls on the front-loaded slots (max 3); still failing → reject.

## 4. Fallback ring cave at 320×240 (replaces part 2 §6 steps 1, 3, 4, 6; SAE1 §6)

1. All wall 320×240. Centre `(160, 120)`. `rx = 148`, `ry = 108`. Ring band as part 2 §6 step 2. **Amended by [[architecture-rulings-3]] R-163 / R-165:** FIXED geometry (`A = 0`, six rooms at `k·60°`, no wobble, no angle jitter), so the ring makes **0 draws** (was "still 4 draws"; R-152's 4 and the planner's 8 are superseded); the tag `'cave:fallback'` is used only to derive `cs = hashSeed(seed, 'cave:fallback')`, passed to `populate` with `a = 8`. The six pockets are accepted at `T.cave.fallbackPocketDepth = 5` (200/200 seeds at 4, 5, 6; 0/200 at 10 with the old wobble); `T.cave.pocketDepth = 10` stays for main caves.
2. Chord: horizontal corridor 3 tall at `y = 119..121`.
3. Entrance: topmost ring floor tile in column 160. Beacon chamber 7×7 centred at `(160, 222)`.
4. Pockets unchanged (six 4×4 rooms, 2-wide 3-long stubs, outward). Outermost `x = 316 < 318`, `y = 236 < 238`: inside `MAP_BORDER`.
5. Same Beacon-cluster rule (§3); the 7×7 chamber band always has candidates.
6. Distance ≈ 511 (half ring `2(rx + ry) = 512`). `validateCave` accepts `fallback === true` with `beaconDist >= 0.9 × DMIN = 459`; the upper bound 690 still applies. The former "retry with `A = 0`" is now the only variant (R-163; it remains the fixed test case). Known leftover risk (R-163): the ring yields exactly 6 chamber plants = the rule-11 minimum, no slack; verify in chunk C2. ponytail: ring kept for its code and test; swap for a fixed macro tree (ecc 13, no CA) if fallback runs feel short.

## 5. `validateCave` changes (replaces part 2 §6.1 rows 1, 5, 11, 13; adds #14)

| # | Invariant | How |
|---|---|---|
| 1 | Size | `tiles.length === w * h === 76 800`; alphabet `#`, `.`, `,` |
| 5 | Beacon reachable | Beacon floor, `dist = beaconDist = max(dist)`, `510 <= beaconDist <= 690` (`BEACON_DIST_BAND`); `fallback === true`: `459 <= beaconDist <= 690` |
| 11 | Counts | resin ≥ 24, large resin ≥ 4, plants ≥ 6, veins ≥ 24, each mineral ≥ 1 vein, pickups ≤ 60, veins ≤ 80 |
| 13 | Beacon chamber | mask tiles hold no item; Beacon cluster present (3 resin, 1 large) |
| 14 | Winnable | below; needs one extra BFS from the Beacon (`distB`, ≈ 1.2 ms) |

```ts
export const Z4_E_PER_TILE = 1.15  // beginner zone-4 net drain 3.29 E/s × 1.3 / 3.75 tiles/s, rounded up
export const MARGIN = 15
// restore(r): small T.resin.smallE (25), large T.resin.largeE (50)
// E60 = Σ restore(r) over resin with dist(r) >= bd - 60
// L   = max distB(r) over the 3 cluster resin
// E4  = Σ restore(r) over resin with zoneOfDepth(depthOf(dist(r), bd)) === 4   // src/core/score.ts, R-007
// 14a: Math.min(T.flame.energyMax, E60) - Z4_E_PER_TILE * L >= T.beacon.minStartE + MARGIN
// 14b: E4 >= 1.163 * (bd / 4) + T.beacon.minStartE + MARGIN          // 1.163 = mid zone-4 E per path tile
```

Rows 2–4, 6–10, 12 of part 2 §6.1 unchanged apart from the amendments there (row 6: quarter-point cuts, [[architecture-rulings-3]] R-157; row 7: `populate` widens `main` tiles, R-158). Row 6 quarters run on a ≤ 1 000-tile `main`.

**Depth classes (planned, R-164, chunk C5, not started):** the band `510..690` of row 5 (and fallback `>= 459`), the quotas of §1 (bd 510–690) and the rule-11 absolute minimums are the **class-3 default**. `validateCave` will take a `CaveParams`; for other classes the rule-11 minimums scale as `min(abs, floor(abs·bd/510))`, the fallback floor becomes `min(0.9·lo, 459)`, and the pickup cap of 60 is exceeded above bd 895 (rock cap 200 is reached near bd 865). Until C5 lands, every statement of this file is class 3.

## 6. Performance (replaces part 2 §7; SAE1 §4, SAE4 §1.7)

| Phase | 320×240 |
|---|---|
| macro tree + mask | 0.3 ms |
| noise + CA ×5 (3.5 M reads) | 10 ms |
| spine, widen, diagonals | 1.5 ms |
| largest region | 1.5 ms |
| BFS, one pass (`Int32Array`) | 1.2 ms |
| loop tunnels + macro-loop checks | ≈ 18 ms |
| Beacon chamber (≤ 4 BFS) | 5 ms |
| part 2: `wide2`, `main` (≤ 1 000), `nearMain` (≤ 1 000 × 49), pockets (≈ 3–4 ms), placement (`populate` ≈ 0.5 ms) | 9 ms |
| `validateCave` incl. #14 `distB` | 6 + 1.2 ms |
| `tiles` + `fnv1a` | 2 ms |
| **One attempt** | **≈ 57 ms**, ≤ 80 ms p95; typical 1.1 attempts; worst 8 + fallback ≈ 470 ms; chunked (part 3 §7) |

Zone field (part 2 §1): 76 800 writes ≈ 0.2 ms once per run. `wide2`: 4 × 76 800 reads. Part 2 §8 note: "a 1.2 ms BFS is cheaper than a second source of truth". Render tile maps 4–8 ms on the first world frame ([[architecture-render-2]] §2.1).

## 7. Tests – `src/checks/cave.check.ts` (replaces part 2 §9)

1. **Same seed identical:** `generateCave(1234)` twice → `tiles`, `veins`, `pickups`, `spawns`, `rngState`, `stats.ecc`, `stats.treeDraws` deep-equal; also `parseSeed('EmberCave')`.
2. **N seeds valid:** seeds `1..60` plus `0`, `4294967295` → `validateCave(r).ok`; assert **≥ 50 of 62** end on attempt 0 and none uses the fallback; log `ecc`, `treeDraws`, `beaconDist` per seed (SAE1 §8 risk 4).
3. **Loops exist:** invariant 6 passes and `stats.loops >= 2` (macro loops + tunnels).
4. **Beacon reachable:** BFS from the entrance reaches `beacon` with exactly `beaconDist` steps; `510 <= beaconDist <= 690`.
5. **Zones monotone:** along `main`, `zoneOfDepth(depthOf(dist, bd))` non-decreasing, covers 1..4.
6. **Fallback valid** (R-163: the ring now has only fixed geometry, so "the fixed `A = 0` set" is the ring itself): `fallbackCave(s)` for 20 seeds and the fixed `A = 0` set → valid, `fallback === true`, `459 <= beaconDist <= 690`, Beacon cluster present; `{ forceFail: true }` returns the fallback.
7. **Placement counts:** per zone, counts equal the §1 scaling formula for the seed's `beaconDist` (short slots allowed, ≤ formula; unit-pin the bd 510 and 690 rows of the §1 table against the R-153 formula); totals ≥ §5 #11; near-path resin dist inside the first 60 % of its zone; cluster 3 resin in `[bd − 40, bd − 8]`; rule #14 holds; T1–T4 in range; no pickup off `wide2`; nothing with `dist < 6`.
8. **Time budget:** `performance.now()` around the 62 generations of test 2: **total < 6 000 ms, max single attempt < 200 ms**; log mean and p95.
9. **Cache agreement:** after `startRun(s, '42')`, `getDepthField(s)` (`Int32Array`) equals the generator's `dist`; `zoneAt` matches `zoneOfDepth(depthOf(d, bd))` on 500 sampled tiles.
10. **Sub-stream isolation:** `{ skip: ['veins'] }` leaves `tiles`, resin and plant positions identical. **Amended by [[architecture-rulings-3]] R-159:** `generateCave({ skip: ['veins'] })` would fail validation rule 11 (veins ≥ 24) and run the fallback, so the check calls `populate` twice (with and without `skip: ['veins']`) on ONE shared `carveCore` result and compares those, instead of calling `generateCave` twice.
11. **Macro layout** (new, direct on `buildMacro`): 20 seeds → 47 tree edges + 2 loop edges unless `treeDraws === 64` (R-109: 0–2 loop edges), `'cave:macro'` draws = `1 + 81 × treeDraws + 96 + 47 + loops.length` (R-110), tree spans 48 cells, root in row 0, `ECC_MIN <= ecc <= ECC_MAX` or `treeDraws === 64`; Fisher–Yates uses exactly 81 draws per tree (count via a wrapping `Rnd`); free tiles of `M` = 52 288; log min/mean pockets per zone (R-116, not asserted).
12. **Mask draw count** (new): `noiseFill` with any `M` consumes exactly `w·h` draws (next value of the stream equals the unmasked run's).
13. **Rejection rows** (new): for the 62 seeds, `keep >= 16 000`, bbox ≥ 90 % of `w`, `h`, every macro cell ≥ 150 region floor tiles, entrance inside the root cell with `ty < 18`; log min cell floor and rejecting rule per seed (R-114: ≤ 3 / 62 attempt-0 failures from `CELL_FLOOR_MIN`).
14. **Loop pair filter** (new): every committed pass-8 tunnel joins tiles in the same or graph-adjacent macro cells; post-tunnel `max D >= max(510, 0.95 Dmax0)`.
15. **Fallback pockets** (new, [[architecture-rulings-3]] R-163): for 20 seeds, `fallbackCave(s)` accepts all 6 pockets at `T.cave.fallbackPocketDepth = 5` (6 chamber plants, the rule-11 minimum, no slack).

**`finalizeCave` (R-160):** `stats.mainLoop` is computed once per accepted cave (R-115) by the new export `finalizeCave` of `src/world/generate.ts`, used by both `generateCave` and the chunked game path (the chunked path does not call `generateCave`). Its signature is a GAP for the implementer.

Authorship (R-162): `cave.check` is written as chunk C4 in a fresh session from this §7 and the exported signatures only; independence comes from ≥ 8 mutation proofs against copies, an independent retrospect and the `@ultrathink` gate ≥ 95.

Heavy only (`CHECK_HEAVY=1`, R-048): fallback rate `fallback === false` for ≥ 99 % of seeds 1..200 (≈ 13 s). Check runtime budget: SAE4 §1.10 (target < 15 s).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-cave-generation-3]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-tuning]]
- [[architecture-render-2]]
- [[architecture-rulings-3]]
- [[architecture-rulings]]
- [[architecture-modules-world]]

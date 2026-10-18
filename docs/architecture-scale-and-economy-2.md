---
type: architecture
title: Last Ember – Economy Ruling (binding) – 2/3 New Constants
description: Binding ruling part 2 – flame economy for the enlarged 320x240 map (path band 510–690 tiles). Shows the old constants no longer fit, adopts O2 (Beacon start gate, steeper burn) and O3 (path band as fairness rule) of the economy check, sets new burn, resin, mining and Beacon constants, front-loaded per-zone placement quotas with densities per 100 path tiles, the Beacon resin cluster and the always-winnable validateCave rule, computed arrival energies per profile, and the edit table.
tags: [project, ai-jam-5, architecture, last-ember, rulings, balance]
timestamp: 2026-10-18T09:30:00Z
---

# Last Ember – Economy Ruling (binding) – 2/3

Part 2 of 3. Previous: [[architecture-scale-and-economy]] (map 320×240, `DMIN 510`, `D* 600`, `DMAX 690`, zone = `D/4`). Next: [[architecture-scale-and-economy-3]], [[architecture-scale-and-economy-4]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. Register: [[architecture-rulings]]. Method, assumptions A1–A8 and simulator: [[architecture-economy-check]] §0, §3, §8. Current values: [[architecture-tuning]] §3–§5, [[architecture-tuning-2]] §9. Current quotas: [[architecture-cave-generation-2]] §3.

**Architect decision (delegated by the owner, 2026-10-18):** ADOPT **O2** (Beacon start gate, steeper burn, resin redistributed) and **O3** (the 510–690 band of part 1 is the seed-fairness rule; no burn scaling by `beaconDist`). **O1 (retreat ending) REJECTED:** it changes the approved score formula and the win rule. Unchanged: score formula, win rule, no-shortcuts rule, escape rules (flame frozen, resin ignored).

## 0. Model (same as the economy check)

- Hit drain per zone and profile: [[architecture-economy-check]] §3 (REALISM 0.6, A4–A7), unchanged because monsters and director are unchanged. Hit-only drain E/s: beginner `.27 / 1.23 / 1.77 / 1.89`, mid `.18 / .67 / 1.00 / 1.07`, expert `.09 / .26 / .41 / .44`.
- Profiles (A7): beginner P40, overhead +100 %; mid P60, +60 %; expert P80, +30 %.
- Zone length `Z = D/4`: 127.5 / 150 / 172.5 tiles at D = 510 / 600 / 690. Pure walk `Z / 3.75`: 34 / 40 / 46 s.
- Mining: 1.5 veins per zone (part 1 §1: 6 per run), 3 s standing per zone.
- Zone time `t = walk × (1 + overhead) + 3 s`:

| D | Beginner | Mid | Expert |
|---|---|---|---|
| 510 | 71.0 s | 57.4 s | 47.2 s |
| 600 | 83.0 s | 67.0 s | 55.0 s |
| 690 | 95.0 s | 76.6 s | 62.8 s |

- Resin is picked when passed; energy clamps at `energyMax`; pickups sit at uniform slots of their dist range (§3.2); zone drain is spread linearly over the zone.

## 1. Old constants on the new map – they no longer fit

Old: `energyMax 100`, `burnPerS [.5,.6,.7,.8]`, `mining 2 E/s × 2 s = 4 E`, Beacon hold `5 s × 3 E/s + burn = 19 E`, gate none (`minEnergyE 1`). Net drain E/s (burn + hits): beginner `.77/1.83/2.47/2.69` (Σ 7.76), mid `.68/1.27/1.70/1.87` (Σ 5.52), expert `.59/.86/1.11/1.24` (Σ 3.80).

Total need `= Σnet × t + 4 zones × 6 E mining + 19 E Beacon`:

| D | Beginner | Mid | Expert |
|---|---|---|---|
| 510 | 7.76 × 71.0 + 24 + 19 = **594 E** | 5.52 × 57.4 + 43 = **360 E** | 3.80 × 47.2 + 43 = **222 E** |
| 600 | 7.76 × 83.0 + 43 = **687 E** | 5.52 × 67.0 + 43 = **413 E** | 3.80 × 55.0 + 43 = **252 E** |
| 690 | 7.76 × 95.0 + 43 = **780 E** | 5.52 × 76.6 + 43 = **466 E** | 3.80 × 62.8 + 43 = **282 E** |

Mid per zone at D\* (net × 67 s + 6 E): **51.6 / 91.1 / 119.9 / 131.3 E**. In zones 3–4 one full bar (100 E) lasts less than one zone. Passive burn alone at D\* with +60 % detours: `0.1733 × 600 × 1.6 = 166 E` > the 100 E start.

Two ways to keep the old quotas, both fail:

1. **Counts unchanged** (785 E total, on-path ≈ 330 E + 100 E start = 430 E): beginner short by 164–350 E at every D; mid misses at D ≥ 600 on path (413–466 vs 430). Zone-4 on-path supply (≈ 2 smalls, 60 E) vs mid zone-4 drain 131 E: the run is decided by flame-outs, not choices.
2. **Counts ×3** (constant density per tile, 2 355 E total, on-path ≈ 990 E): supply/need = 3.0–10.6×; mid sits near the cap and reaches depth 20 at ≈ 85 E (estimate, §6.4) (target 30–60). The old Beacon (19 E, no gate) is always affordable. No tension, the [[architecture-economy-check]] §3 verdict at 3× the scale.

Verdict: drain is time-based and grew ×3 with D; a fixed bar and a flat resin table cannot hold the 30–60 E band and the Beacon decision across 510–690. New constants follow.

## 2. New constants

| Constant | New | Justification |
|---|---|---|
| `flame.energyMax` | **100** (unchanged) | shared vocabulary; radius curve, gauge and mineral examples are normalised to it. Longer zones are handled by resin cadence, not a bigger bar |
| `flame.burnPerS` | **`[0.50, 0.70, 1.00, 1.40]`** | O2 schedule. Zone 1 stays gentle for teaching; zone 4 burn ×1.75. Burn share of mid drain zone 4 rises 43 % → 57 %, so light, not only hits, sets the deep pressure |
| `resin.smallE` | **25** (was 30) | more, smaller pickups: a slot every 22–38 path tiles, less cap waste, finer go-back decisions |
| `resin.largeE` | **50** (was 55) | exactly 2 smalls; the Beacon cluster = 1 large + 2 small = 100 E = one full bar |
| `mining.costPerS` | **3** (was 2) | 6 E per vein + ~2.8 E zone-4 drain while standing ≈ 9 E ≈ a third of a small resin. Mining stays a visible light cost (spec: "keep that") |
| `beacon.costPerS` | **4** (was 3) | hold = 20 E + 5 s × 1.4 burn = **27 E** |
| `beacon.minStartE` | **40** (new) | the START GATE (O2). 40 = hold 27 E + 13 E margin, so a gated hold never touches the floor and always completes lit |
| `beacon.minEnergyE` | **1** (unchanged) | floor during the hold, no soft lock |

**Gate behaviour** (`stepBeacon`, [[architecture-systems-2]] §5): the hold may START only on a step where `phase === 'descent'`, interact is held in reach and `max(eStart, player.energy) >= T.beacon.minStartE` (`eStart` = energy at the start of the step, before the burn; R-125, [[architecture-rulings-3]] §4). Below the gate: no hold starts, no energy is spent, `beaconHold` stays 0; on the press edge emit `denied` (`FxEventKind` member added by R-082 refined / R-128, a = 0, audio `ui_denied`) and show the toast `The Beacon needs more light`. The HUD light gauge draws a tick at 40 E while the player is within 8 tiles of the Beacon. Once started, the hold runs as today (cost 4 E/s, floor 1 E, releasing resets). The gate never blocks a run forever: §3.4 guarantees ≥ 100 E of resin within the last 60 path tiles.

## 3. Placement quotas for 320×240

### 3.1 Per-zone quotas (counts at D\* = 600, zone 150 tiles; density per 100 path tiles in brackets)

| Item | Zone 1 | Zone 2 | Zone 3 | Zone 4 | Placement |
|---|---|---|---|---|---|
| resin small, near-path | 3 (2.00) | 4 (2.67) | 5 (3.33) | 4 (2.67) | `nearMain`, `wide2`, front-loaded slots §3.2; zone-1 count includes T1 |
| resin large, near-path | 0 | 0 | 1 (0.67) | 1 (0.67) | `nearMain`, middle slot `k = floor(n/2)` |
| resin small, off-path | 3 (2.00) | 3 (2.00) | 2 (1.33) | 1 (0.67) | not `nearMain`, any dist in the zone |
| resin large, off-path | 0 | 1 (0.67) | 1 (0.67) | 1 (0.67) | dark-chamber bundle first, then off-path |
| plants | 2 (1.33) | 2 (1.33) | 3 (2.00) | 3 (2.00) | `','` tiles, `wide2` |
| veins | 10 (6.67) | 9 (6.00) | 8 (5.33) | 7 (4.67) | as [[architecture-cave-generation-2]] §3.1; pieces 1/1/2/2 |
| **Beacon cluster** | – | – | – | 1 large + 2 small (fixed) | §3.4; replaces the single Beacon resin |

Totals at D\*: resin 33 (27 small, 6 large, 975 E), plants 10, veins 34. Pickups 43 ≤ 60, veins 34 ≤ 80 ([[architecture-state-3]] §8 budget holds). Supply per zone (E): 150 / 225 / 275 / 225 + 100 cluster; near-path only: 75 / 100 / 175 / 150 + 100.

Counts for other D (O3 fairness): `n = Math.floor(density × (beaconDist / 4) / 100 + 0.5 + 1e-9)` per row (round half up with ε against float error; `density` = the printed 2-decimal literal, e.g. 6.67, R-153), cluster fixed. D = 510 → near small 3/3/4/3, near large 0/0/1/1, off small 3/3/2/1, off large 0/1/1/1, plants 2/2/3/3, veins 9/8/7/6. D = 690 → near small 3/5/6/5, near large 0/0/1/1, off small 3/3/2/1, off large 0/1/1/1, plants 2/2/3/3, veins 12/10/9/8.

### 3.2 Front-loading (resin redistributed)

Near-path slot `k` of `n` in zone `z` targets dist `zStart + (k + 0.5) / n × 0.6 × Z`; pick the `nearMain` `wide2` candidate closest to the target within ±8 path tiles (24 tries, spacing §3.3). So all near-path resin lies in the **first 60 % of each zone**. The last 40 % of every zone (60 tiles at D\*) has only off-path resin, and in zone 4 the cluster. Effect: crossing a zone border the bar is falling; "go back up ~40 tiles to the last near-path resin, or press on" is a real, short, paying choice. The old rule `k % 5 < 3` is replaced by the explicit near/off split.

### 3.3 Spacing changes

resin ↔ resin ≥ 10 (unchanged) except inside the Beacon cluster (≥ 3 between its 3 items). Plant ↔ plant ≥ 12, vein ↔ vein ≥ 4 unchanged.

### 3.4 Beacon cluster and the always-winnable invariant

Cluster: 1 large + 2 small on `wide2` floor, outside `beaconMask`, with `dist ∈ [bd − 28, bd − 10]` and Chebyshev ≤ 6 to a `main` tile (visible glow from the main path, short detour). It lies inside the last 60 path tiles.

New constant `Z4_E_PER_TILE = 1.15` (beginner zone-4 net drain 3.29 E/s × 1.3 known-route overhead / 3.75 tiles/s = 1.14, rounded up). `MARGIN = 15`.

**`validateCave` rule #14 – winnable** (needs one extra BFS from the Beacon, `distB`, ≈ 1.2 ms):

```
E60  = Σ restore(r) over resin r with dist(r) >= bd - 60            // restore: small 25, large 50
L    = max distB(r) over the 3 cluster resin
E4   = Σ restore(r) over resin r with zoneOfDepth(depthOf(dist(r), bd)) === 4   // src/core/score.ts (R-007)
ok   = min(T.flame.energyMax, E60) - Z4_E_PER_TILE * L >= T.beacon.minStartE + MARGIN
    && E4 >= 1.163 * (bd / 4) + T.beacon.minStartE + MARGIN            // 1.163 = mid zone-4 E per path tile
```

Check at D\*: `E60 = 100`, `L ≤ 28 + 6 = 34` → `100 − 39.1 = 60.9 ≥ 55` ✓. `E4 = 150 + 75 + 100 = 325 ≥ 174.5 + 55 = 229.5` ✓. D = 510: 300 ≥ 203.3 ✓. D = 690: 350 ≥ 255.6 ✓.

Generator enforcement (`populate`, stream `'cave:resin'`, own tag so other streams keep their draws):

1. Beacon cluster is placed FIRST (before chamber bundles and zone resin). No candidate → relax to Chebyshev ≤ 10 and `dist ∈ [bd − 40, bd − 8]`. Still none, or rule #14a fails → attempt rejected, `why: 'winnable'`, next attempt.
2. After zone resin: if #14b fails, add zone-4 near-path smalls on the front-loaded slots (max 3). Still failing → reject.
3. Fallback ring cave ([[architecture-scale-and-economy]] §6): same cluster rule; the 7×7 chamber band always has candidates.

Also replace #11 Counts: resin ≥ 24, large resin ≥ 4, plants ≥ 6, veins ≥ 24, each mineral ≥ 1 vein, pickups ≤ 60, veins ≤ 80. Replace #13: mask tiles hold no item; Beacon cluster present (3 resin, 1 large).

## 4. Target arrival energy (new constants)

Net drain E/s (hits + new burn): beginner `.77 / 1.93 / 2.77 / 3.29`, mid `.68 / 1.37 / 2.00 / 2.47`, expert `.59 / .96 / 1.41 / 1.84`. Zone drain at D\* `= net × t + 9 E` (1.5 veins × 6 E): beginner 72.9 / 169.2 / 238.9 / 282.1; mid 54.6 / 100.8 / 143.0 / 174.5; expert 41.5 / 61.8 / 86.6 / 110.2.

Routes: mid and expert take every near-path resin (slots of §3.2). Beginner takes ALL resin (its +100 % overhead is the exploring); its slots are modelled at `(k + 0.5) / n × 0.8` (near-path front-loaded blended with uniform off-path). Cluster detour: 12 tiles round trip, 3.2 s ≈ 8 E, booked 4 E each way.

Mid at D\*, worked: Z1 three smalls at 0.1/0.3/0.5 all hit the cap → `100 − 0.5 × 54.6 = 72.7`. Z2 four smalls at .075/.225/.375/.525, gap drain 15.1: 72.7 → 65.1+25 = 90.1 → 75.0+25 = 100 → 100 → 100 → `100 − 0.475 × 100.8 = 52.1` at depth 20. Z3 (5 S + 1 L, gap 14.3) ends `100 − 0.45 × 143 = 35.7`. Z4 (4 S + 1 L, gap 20.9): 35.7 → 50.2 → 54.3 → 83.3 → 87.4 → 91.4 → `91.4 − 0.46 × 174.5 = 11.1` at the Beacon without the cluster. With the cluster at `bd − 20`: `91.4 − 57.1 = 34.3`, −4 detour, +100 (cap), −4, `− 0.133 × 174.5` → **72.8**.

| Profile | D | Depth 20 (Z2→3) | Z3→4 | Beacon, no cluster | Beacon, with cluster | Gate 40 |
|---|---|---|---|---|---|---|
| Beginner | 600 | **57.7** | 41.6 | out ≈ 5 s before the cluster | **58.5** | pass only with cluster |
| Mid | 510 | 56.2 | 43.1 | 17.4 | **72.3** | needs cluster |
| Mid | 600 | **52.1** | 35.7 | 11.1 | **72.8** | needs cluster |
| Mid | 690 | 47.6 | 28.1 | 5.0 | **73.0** | needs cluster |
| Expert | 600 | 70.6 | 61.0 | **49.3** | (skips) | pass, margin 9 |

Reading: mid lands at depth 20 with **48–56 E** across the whole band (target 30–60 ✓, O3 spread ±4 E). Mid arrives at the Beacon under the gate unless it takes the cluster: the decision "detour for light now, or push and walk back ≤ 34 tiles" is real and always pays (+100 E for ≤ 34 E). Expert beelines through the gate with 49 E: skill is rewarded with time. Beginner, worked Z4 (5 S + 2 L, gap 32.2 E): 41.6 → 50.5 → 43.3 → 61.1 → 53.9 → 46.7 → 64.5 → 57.3, minimum ≈ 11 E; then 57.3 − 35.0 → out just before the cluster (on average 0 E for ~5 s, variance gives 1–2 flame-outs = HP risk), relight to 100 → **58.5** at the Beacon. Beginner D = 510/690 scale like mid (±5 E); not tabled.

Run time is unchanged by this ruling except the cluster detour (+3 s) or a walk-back (+15–25 s).

## 5. NEW TUNING VALUES

| Name | Old | New | File + section to edit |
|---|---|---|---|
| `flame.energyMax` | 100 | 100 (kept) | – |
| `flame.burnPerS` | `[.5,.6,.7,.8]` | `[.5,.7,1.0,1.4]` | [[architecture-tuning]] §3; [[architecture-tuning-2]] §9 knob 1 default |
| `resin.smallE` | 30 | 25 | [[architecture-tuning]] §4; [[architecture-tuning-2]] §9 knob 2 |
| `resin.largeE` | 55 | 50 | [[architecture-tuning]] §4 |
| `mining.costPerS` | 2 | 3 | [[architecture-tuning]] §5; [[architecture-tuning-2]] §9 knob 8 |
| `beacon.costPerS` | 3 | 4 | [[architecture-tuning]] §5 |
| `beacon.minStartE` | – | 40 (new key) | [[architecture-tuning]] §1.1 type + §5; [[architecture-systems-2]] §5 start condition |
| `beacon.minEnergyE` | 1 | 1 (kept) | – |
| resin small near / off per zone | 6/5/3/2 total, `k % 5 < 3` | near 3/4/5/4, off 3/3/2/1, front-loaded | [[architecture-cave-generation-2]] §3.1, §3.4 |
| resin large near / off | 0/1/2/2 | near 0/0/1/1, off 0/1/1/1 | [[architecture-cave-generation-2]] §3.1 |
| Beacon resin | 1 small, `[bd−14, bd−8]` | cluster 1 L + 2 S, `[bd−28, bd−10]`, ≤ 6 from main | [[architecture-cave-generation-2]] §3.1, §3.3, §3.4 |
| plants | 1/1/2/2 | 2/2/3/3 | [[architecture-cave-generation-2]] §3.1 |
| veins | 8/7/5/4 | 10/9/8/7 | [[architecture-cave-generation-2]] §3.1 |
| count scaling | fixed | `Math.floor(density × bd/4 / 100 + 0.5 + 1e-9)` (R-153) | [[architecture-cave-generation-2]] §3.1 |
| `validateCave` #11 | resin ≥ 14, L ≥ 2, plants ≥ 2, veins ≥ 12 | resin ≥ 24, L ≥ 4, plants ≥ 6, veins ≥ 24 | [[architecture-cave-generation-2]] §6.1 |
| `validateCave` #13 / #14 | Beacon resin present / – | cluster present / winnable (§3.4) | [[architecture-cave-generation-2]] §6.1 |
| `Z4_E_PER_TILE`, `MARGIN` | – | 1.15, 15 | [[architecture-cave-generation-2]] §6.1 |
| Day-4 target | depth 20 at 30–60 E | unchanged; add Beacon arrival mid 5–20 E w/o cluster | [[architecture-tuning-2]] §9; [[architecture-economy-check]] §7, §8 (leg tiles 50 → `bd/4`) |

## 6. Risks and open questions

1. REALISM 0.6 and the hit rates were calibrated for 50-tile zones; 150-tile zones with more side cells may change spawn uptime. Re-measure on Day 4 (seeds 7, 42, 1234).
2. Beginner zone-4 minimum ≈ 11 E on average, so variance flames it out 1–2 times there: if Day 4 shows deaths in zone 4, lower zone-4 burn to 1.2 before touching resin.
3. `minStartE` 40 vs expert margin 9 E: if experts get gated by variance, the cluster still saves them; do not lower the gate first.
4. §1 figure "mid ≈ 85 E at depth 20 with old counts ×3" is an estimate (near-cap behaviour), not a stepped computation.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-economy-check]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-3]]
- [[architecture-scale-and-economy-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-cave-generation-2]]
- [[architecture-systems-2]]
- [[architecture-state-3]]
- [[architecture-rulings-3]]

---
type: architecture
title: Last Ember – Map Scale Ruling (binding) – 1/3 Map Size and Path Length
description: Binding ruling part 1 – owner decision 2026-10-18 keeps the 6–8 minute run target and enlarges the map. Time model solved for the entrance→Beacon path length band, escape-time check, map-size comparison (256x192, 320x240, 384x288), the 320x240 decision with a deterministic macro-layout pass, new rejection rules and loop-tunnel constants, generation time budget with chunked generation, unchanged depth/zone normalisation, and the rescaled fallback ring cave.
tags: [project, ai-jam-5, architecture, last-ember, rulings, balance]
timestamp: 2026-10-18T09:00:00Z
---

# Last Ember – Map Scale Ruling (binding) – 1/3

Part 1 of 3. Next: [[architecture-scale-and-economy-2]], [[architecture-scale-and-economy-3]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. Ruling register: [[architecture-rulings]]. Supersedes the map numbers of [[architecture-cave-generation]] §2–§9 and [[architecture-cave-generation-2]] §6–§7 where stated. Inputs: [[architecture-economy-check]] §1, §4; [[architecture-tuning]] (walk 120 px/s, `sprintMul` 2.0, `mining.holdS` 2 s, `beacon.holdS` 5 s).

**OWNER DECISION (binding, 2026-10-18, saile2204):** the 6–8 minute single-run target stands. The map gets bigger. Not allowed: slower walking, re-reading the target as session length. Unchanged: score formula, win rule, no-shortcuts rule, escape rules. This closes [[architecture-economy-check]] §4 options (a) and (b); option (c) is taken and sized here.

## 1. Time model → path-length band

Constants: tile 32 px (kept, §2.4). Walk 3.75 tiles/s. Sprint 7.5 tiles/s. `D` = shortest 4-connected path entrance→Beacon in tiles.

Design point: competent (mid) run = **420 s**.

| Term | Model | Value at design point |
|---|---|---|
| Descent walking | `D × 1.6 / 3.75` (shortest path + 60 % detours/exploration) | `0.4267 D` s |
| Mining stops | 6 veins per run (≈1.5 per zone on the bigger map) × 2 s | 12 s |
| Parry/fight pauses | ≈ 0.21 attacks/s (economy-check §3 mean, REALISM incl.) × ≈ 300 s descent ≈ 62 attacks × 0.5 s net stop | 30 s |
| Zone-1 teaching | first parry, first mine, first resin (T1–T4) | 10 s |
| Beacon hold | spec ASSUMPTION | 5 s |
| Escape | `D / 7.5 × 1.3` (rock detours, rolls; economy-check §4) | `0.1733 D` s |

Solve: `0.4267 D + 0.1733 D + 12 + 30 + 10 + 5 = 420` → `0.6 D = 363` → **D = 605**, rounded **D\* = 600 tiles**.

Band: ±20 % (480–720) gives runs of 345–489 s = 5.75–8.15 min, outside 6–8 min at both ends. **Band = ±15 %: `DMIN = 510`, `DMAX = 690`.** Mid run at DMIN: `0.6 × 510 + 57 = 363 s` (6.05 min); at DMAX: `0.6 × 690 + 57 = 471 s` (7.85 min).

Split at D\* = 600 (mid): descent 256 s walk + 52 s stops = **308 s (73 %)**, Beacon 5 s (1 %), escape **104 s (25 %)**.

Escape check (sprint, no economy):

| D | Pure sprint | × 1.3 detours |
|---|---|---|
| 510 | 68 s | 88 s |
| 600 | 80 s | 104 s |
| 690 | 92 s | 120 s |

**FLAG 1:** pure sprint stays inside 60–100 s across the band. With the 1.3 detour factor the upper half of the band exceeds 100 s (max 120 s). **FLAG 2:** an escape share of 12–18 % is structurally unreachable. Escape/descent-walk time = `(1.3/7.5) / (1.6/3.75) = 0.41` follows from spec sprint 2× walk plus the 60 % descent overhead. A 15 % escape (63 s) would force D = 363 and a descent overhead of 3.1× walk. Escape rules are frozen, so the ruling accepts a **19–25 % escape share**. Owner may cap via DMAX 650 (escape ≤ 113 s); not applied.

Other profiles at D\* (same stop model, scaled): beginner (+100 % detours, 45 s fights, 15 s teaching) 320 + 72 + 5 + 104 = **501 s (8.4 min)**; expert (+30 %, 20 s fights, 5 s teaching) 208 + 37 + 5 + 104 = **354 s (5.9 min)**. Score `max(0, 600 − s)` never clamps: worst case beginner at DMAX = 368 + 72 + 5 + 120 = 565 s. Note for the owner: the time bonus shrinks from ~470 to ~180 points per win (weight shift, formula unchanged).

## 2. Map size

### 2.1 CA-only scaling model

Calibration on today's 160×120: typical D = 200 ([[architecture-economy-check]] A3). Straight span `L = sqrt((W/2)² + (0.85 H)²)` (entrance near top centre, Beacon near a far bottom corner) = 130 → effective tortuosity 1.54. Assumption: CA path/straight ratio **τ = 1.3–1.8** and scale-invariant (CA feature size 3–8 tiles is fixed; 45 % fill is well above the percolation threshold, so chemical distance stays ~linear). Seed spread of D: 0.6–1.5× typical (economy-check A3: 120–300 around 200). Floor: 45–55 % of the inner area, largest region keeps ≈ 85 %.

| Size | Tiles | Inner area | CA floor 45–55 % | Region (≈85 %) | L | D at τ 1.3–1.8 | Reaches [510, 690]? |
|---|---|---|---|---|---|---|---|
| 160×120 (today) | 19 200 | 18 352 | 8.3–10.1 k | 7.0–8.6 k | 130 | 169–234 | no |
| 256×192 | 49 152 | 47 376 | 21.3–26.1 k | 18.1–22.2 k | 207 | 269–373 | **no** (outliers ≤ 480) |
| 320×240 | 76 800 | 74 576 | 33.6–41.0 k | 28.5–34.9 k | 259 | 337–466 | **no** (only τ > 2 seeds) |
| 384×288 | 110 592 | 107 920 | 48.6–59.4 k | 41.3–50.5 k | 311 | 404–560 | **unreliable**: ~25 % of seeds in band, 8 attempts ≈ 90 % success, ~6× gen cost |

**Verdict:** CA alone cannot hit a ±15 % band at any affordable size; its D spread (0.6–1.5×) is wider than the band. Path length must come from a macro layout, not from map area.

### 2.2 Decision: 320×240 + macro-layout pass

**Map 320×240 tiles, tile 32 px (10 240 × 7 680 px world).** A coarse spanning tree of chambers fixes D; CA supplies the organic texture inside.

Macro parameters (all DEFAULT, architect):

| Constant | Value | Meaning |
|---|---|---|
| `CELL` | 40 | macro cell size in tiles → grid `MW × MH = 8 × 6` = 48 cells, exactly 320×240 |
| `CELL_INSET` | 4 | solid margin inside each cell edge → free chamber 32×32; 8-tile macro wall between cells |
| `CORR_W` | 8 | free band across the macro wall for each graph edge; centre offset `rnd.int(-8, 8)` along the shared side |
| `CENTRE_JIT` | 6 | cell centre = cell middle + `rnd.int(-6, 6)` per axis |
| `ECC_MIN`, `ECC_MAX` | 12, 14 | accepted tree eccentricity (cells) from the root cell |
| `TREE_TRIES` | 64 | tree redraws per attempt |
| `MACRO_LOOPS` | 2 | extra non-tree edges (spec loops) |
| `SPINE_R` | 3 | disc carved at every cell centre |

Algorithm (stream `'cave:macro'`, new tag, runs first in every attempt):

1. Root cell = top row, column `rnd.int(0, 7)`.
2. Tree: Fisher–Yates shuffle of the 82 grid edges (7×6 horizontal + 8×5 vertical; 81 draws), Kruskal with union-find. BFS on the 48-node tree → `ecc` = max cell depth from root. Accept if `ECC_MIN <= ecc <= ECC_MAX`. Else redraw (same stream continues). After 64 misses keep the tree with `|ecc − 13|` minimal (first wins ties). Never throws.
3. Loops: candidates = non-tree grid edges `(a, b)` with both tree depths ≥ 3 and tree distance `a↔b` ≥ 3 (cycle ≥ 4 cells ≈ 176 tiles). Order by tree distance desc, then edge index. Add greedily if the cell-graph eccentricity stays ≥ `ECC_MIN`. Stop at 2. Fewer than 2 → redraw the tree (counts toward 64).
4. Mask `M: Uint8Array(w*h)`: 1 = forced wall. Free each cell's inset 32×32 and each graph edge's `CORR_W` band.
5. Spine (after CA, §2.3): carve a `SPINE_R` disc at each cell centre and a `carveTunnel` 2-wide staircase between the centres of every graph edge (draws from `'cave:spine'`, new tag).

Expected D: adjacent-centre Manhattan = 40 + E|Δ jitter| ≈ **44 tiles per cell step**. Entrance→root centre ≈ 15; Beacon beyond its cell centre ≈ 20. `D ≈ 44 · ecc + 35` → ecc 12/13/14 → **563 / 607 / 651**, ±25 from jitter and CA openings → 538–676 ⊂ [510, 690]. Tree-window hit rate is estimated ≥ 25 % per draw, so 64 draws miss with p < 1e-8. Tree draws cost microseconds (48 nodes).

Why a mask, not a post-pass: forced-wall tiles still draw their noise value, so the `noiseFill` draw count stays `w*h` and every later tag is unaffected (determinism §4 rule "ALWAYS draw"). CA keeps all-wall areas wall (≥ 4 wall neighbours). The spine guarantees connectivity along every graph edge whatever CA does in the corridor band. CA blobs not touching the spine are dropped by pass 4 as before.

Floor at 320×240 with macro: free area = 48 × 1024 + 49 edges × 64 = 52 288 tiles; CA floor 45–55 % → 23.5–28.8 k; region ≈ 85 % → **≈ 20–24.5 k floor tiles** (26–32 % of the map; today ≈ 40 %).

### 2.3 Pass order (replaces [[architecture-cave-generation]] §1.3)

0 macro tree + mask (`'cave:macro'`) → 1 noise fill, `g[i] = M[i] || isEdge || r < 0.45` (`'cave:fill'`) → 2 CA ×5 → **2b spine carve (`'cave:spine'`)** → 3 widen + diagonal fix → 4–5 largest region + reject → 6 entrance (pool restricted to the root cell) → 7 D0 → 8 loop tunnels (`'cave:tunnels'`) → 9 Beacon + chamber + final D → 10+ part 2 unchanged. Monotone-carving invariant: unchanged (2b only adds floor and runs before pass 4). Attempt seeding: R-111 ([[architecture-rulings-3]]); every tag hashes from `caveSeed(seed, a)`.

### 2.4 Kept

Tile 32 px: sprite, collision radii and light radii are tuned in px against 32 px tiles; scaling tiles would retune everything. `MAP_BORDER = 2`, `FILL_WALL = 0.45`, `CA_ITERS = 5`, 4-5 rule, `widen`, `CHAMBER_R`, `CHAMBER_MASK_R`, `ENTRANCE_R`: all local feature sizes, independent of map size.

**Type change (required):** path fields `Int16Array` → **`Int32Array`** (`bfs4`, `CaveCore.dist`, `getDepthField`). `w*h = 76 800 > 32 767`; real D stays < 2 000, but a pathological serpentine could overflow. Cost 307 KB per field.

## 3. Rejection rules at 320×240

| Rule | Old (160×120) | **New** |
|---|---|---|
| Beacon distance | `beaconDist >= 120` (`BEACON_DIST_MIN`) | **`DMIN = 510 <= beaconDist <= DMAX = 690`** (`BEACON_DIST_BAND`) |
| Floor minimum | `keep >= 5 500` | **`keep >= 16 000`** (≈ 70 % of the 22 k expectation) |
| Bounding box | ≥ 60 % of `w` and `h` | **≥ 90 % of `w` and `h`** AND **every macro cell holds ≥ 150 region floor tiles** (`CELL_FLOOR_MIN`) |
| Top rows | a region tile with `ty < 18` | unchanged `ty < 18`, and it must lie in the root cell (free rows 4..17) |
| Loops | `loops >= 2` after pass 8 | unchanged (macro loops count, §3.1) |
| Attempts | `MAX_ATTEMPTS = 8` | unchanged 8; expected ≈ 1.1 attempts (D is set by the tree, not by luck) |

### 3.1 Loop tunnel constants

Spec 2–3 loops. The 2 macro loops are verified by `hasAlternativeRoute(g, centreA, centreB)` on the final map and counted in `stats.loops`. Pass 8 then adds `k = rnd.int(0, 1)` tile tunnels (still 1 draw), total 2–3.

| Constant | Old | **New** | Reason |
|---|---|---|---|
| `U` samples | 300 | **1 000** | constant density per floor tile (≈ 8.5 k → 22 k floor, ×2.6, rounded up) |
| `TUN_MAX` | 12 | 12 | a tunnel is a local crack, not a highway |
| `GAIN_MIN` / relaxed | 50 / 25 | 50 / 25 | loop size vs rocks is local; unchanged |
| `SPREAD` / relaxed | 30 / 20 | **60 / 40** | Chebyshev spacing scales with linear size (×2) |
| Pool | `D0 >= 0.2 Dmax` | unchanged | relative |
| Cell filter | – | **`u`, `v` in the same macro cell or graph-adjacent cells** | cross-wall pairs are massive shortcuts; drop them before any BFS |
| Shortcut guard | `max D >= 0.8 Dmax0` | **`max D >= max(DMIN, 0.95 Dmax0)`** | a ±15 % band cannot absorb a 20 % cut |
| `hasAlternativeRoute` `k` | 2 | 2 | blocking radius depends on rock size (≤ 2 tiles), not map size |
| `minLen` | 40 | 40 | tactical loop minimum, local |

## 4. Generation time budget

All passes are O(w·h); 320×240 = 4× today. Base: [[architecture-cave-generation-2]] §7 (≈ 8 ms per attempt at 160×120).

| Phase | 160×120 | 320×240 est. |
|---|---|---|
| Macro tree + mask | – | 0.3 ms |
| Noise + CA ×5 (3.5 M reads) | 2.5 ms | 10 ms |
| Spine, widen, diagonals | – | 1.5 ms |
| Largest-region flood | (in 1.5) | 1.5 ms |
| BFS, one pass | 0.3 ms | 1.2 ms |
| Loop tunnels: 1 000 × 21² reads + ≤ 4 candidates × 3 BFS + 2 macro-loop checks | ~1 ms | 1 + 14 + 3 ≈ 18 ms |
| Beacon chamber (≤ 4 BFS) | (in 1.5) | 5 ms |
| Part 2: `wide2`/`main`, pockets, placement | 2.3 ms | 9 ms |
| `validateCave` | 1.5 ms | 6 ms |
| `tiles` string + `fnv1a` | 0.5 ms | 2 ms |
| **One attempt** | **≈ 8 ms** | **≈ 55 ms** |

Typical 1.1 attempts ≈ 60 ms; worst 8 attempts + fallback ≈ 470 ms.

**Decision: chunked generation, one attempt per `update`, behind a loading screen — built now, no longer optional.** Reuse the fields of [[architecture-cave-generation-2]] §7 unchanged: `ui.genPending: string` (`''` = idle, else the seed key) and `ui.genAttempt: number`. No new State fields.

State machine: screen handler sets `genPending = key`, `genAttempt = 0` → each `update` runs `carveCore(caveSeed(seed, genAttempt))` (R-111) + `populate` + `validateCave`; ok → `startRun` with that result, `genPending = ''`; fail → `genAttempt++`; `genAttempt === MAX_ATTEMPTS` → `fallbackCave(seed)` → `startRun`. Render shows `Carving the cave…` while `genPending !== ''`. Pure in `(seed, attempt)`, no wall clock: determinism holds; HMR mid-generation simply resumes at `genAttempt`.

Budget: **one attempt ≤ 80 ms p95 on a mid laptop.** Check test 8 becomes: 62 generations total < 6 000 ms, max single attempt < 200 ms (CI margin). A 55 ms `update` makes one long frame; the host fixed-step accumulator must clamp catch-up steps (verify in `main.ts`; on the loading screen extra steps are harmless).

## 5. Depth and zones (unchanged)

`depthOf` normalisation 0..40 and `zone = min(4, 1 + floor(depth / 10))` stay exactly as in [[architecture-cave-generation-2]] §1 and [[architecture-scoring-and-save]] §1. Zone length = `D / 4`: **150 tiles at D\*** (band 128–172), 40 s pure walk, ≈ 64 s with detours, ≈ 77 s with stops (today 50 tiles, 13 s). Teaching ranges T1–T4 (path 7–24) are absolute and unchanged; they now fill the first ~15 % of zone 1. Energy and quota numbers scale with `D` (×3); their rescale is out of scope of this part (see [[architecture-scale-and-economy-2]]).

## 6. Fallback ring cave at 320×240

Replaces [[architecture-cave-generation-2]] §6 "Fallback ring cave" steps 1, 3, 4, 6. Stream `'cave:fallback'`, still 4 draws.

1. All wall 320×240. Centre `(160, 120)`. Ellipse radii **`rx = 148`, `ry = 108`**, ring 3 wide as before.
2. Chord: horizontal corridor 3 tall at **`y = 119..121`**.
3. Entrance: topmost ring floor tile in **column 160**. Beacon chamber 7×7 centred at **`(160, 120 + 108 − 6) = (160, 222)`**.
4. Pockets unchanged (six 4×4 rooms, 2-wide 3-long stubs, outward). Clearance: outermost tile `x = 160 + 148 + 1 + 3 + 4 = 316 < 318`, `y = 120 + 108 + 1 + 7 = 236 < 238`: inside `MAP_BORDER`.
5. Distance: a 4-connected half ring is Manhattan `2(rx + ry) = 512` on the centre line, ≈ 508 on the inner lane, + chamber ≈ **511**. That is at DMIN with no margin, and the map cannot hold a larger ellipse with outward pockets. Rule: **`validateCave` accepts `fallback === true` with `beaconDist >= 0.9 × DMIN = 459`**; the upper bound still applies. Fallback runs ≈ 6.0 min (mid). ponytail: ring kept for its existing code and test; swap for a fixed macro tree (ecc 13, no CA) if fallback runs feel short.

## 7. Final numbers

| Item | Value |
|---|---|
| Map | 320×240 tiles, 32 px, macro grid 8×6 of 40 |
| Floor tiles | ≈ 20–24.5 k expected; reject < 16 000 |
| D band | 510–690, design point 600 |
| Escape (sprint) | 68–92 s pure, 88–120 s with ×1.3; 80 / 104 s at D\* |
| Gen time | ≈ 55 ms per attempt, ≈ 60 ms typical, ≤ 80 ms p95 budget, chunked 1 attempt/update |
| Retries | `MAX_ATTEMPTS = 8`, `TREE_TRIES = 64` per attempt, expected 1.1 attempts |

## 8. Risks and open questions

1. **Render map cache:** a full-map offscreen canvas at 1:1 would be 10 240 × 7 680 px ≈ 315 MB RGBA and exceeds Safari's 16.7 M px canvas limit. Render must chunk (e.g. 1 024 × 1 024 px canvases = 32 × 32 tiles, built lazily near the camera) — needs a render ruling.
2. Exploration overhead +60 % is assumed constant; 35 side cells off the main tree path may raise it. Measure on Day 4 with seeds 7, 42, 1234 ([[architecture-economy-check]] §7).
3. FLAG 1/2 of §1 (escape share 19–25 %, up to 120 s): owner may lower DMAX; not applied.
4. Tree-window hit rate (≥ 25 %) and the 44 tiles/step estimate are untested; the check must log `ecc`, tree draws and D per seed.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-economy-check]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-tuning]]
- [[architecture-scoring-and-save]]
- [[architecture-rulings-3]]

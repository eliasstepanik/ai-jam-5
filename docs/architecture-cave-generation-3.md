---
type: architecture
title: Last Ember – Cave Generation (3/4) – Macro Layout Pass, 320x240 Constants, Rejection
description: Last Ember cave generator part 3 – the 320x240 macro-layout pass (8x6 grid of 40-tile cells, random spanning tree with a fixed draw count, eccentricity window, macro loops, forced-wall mask, spine carve), its interplay with noise fill and CA, the new pass order, rejection thresholds, loop-tunnel constants with the macro-cell pair filter, chunked attempts, touched constants and the GAP list. Copies the binding values of the scale ruling.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-18T12:00:00Z
---

# Last Ember – Cave Generation (3/4) – Macro Layout and 320×240

Part 3 of 4. Previous: [[architecture-cave-generation]] (terrain passes), [[architecture-cave-generation-2]] (zones, placement, validation). Next: [[architecture-cave-generation-4]] (economy placement, validation rules #11/#13/#14, fallback, tests). Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. **Binding source:** [[architecture-scale-and-economy]] (SAE1) §2–§4, §6; [[architecture-scale-and-economy-4]] (SAE4) §2, §3 rows 27–45. Where this file and parts 1–2 disagree, this file governs; where this file and SAE1 disagree, SAE1 governs.

No value here is new: every number is copied from SAE1/SAE4. Points SAE1 left open (GAP-1…GAP-10) are now closed by R-108…R-117 ([[architecture-rulings-3]] §1); the text below states the ruled behaviour and §9 lists the closures.

## 1. Module

| File | Exports | Lines (est.) |
|---|---|---|
| `src/world/gen/macro.ts` | `buildMacro`, `carveSpine`, `macroCellOf`, `MacroLayout`, constants of §2, `BEACON_DIST_BAND` | ≈ 140 |

Imports (R-150): `./carve.ts` (`carveDisc`, `carveTunnel`), core rng, `MAP_W`/`MAP_H` from `src/core/state.ts`; never `./loops.ts` or `./places.ts`. Pure, like every `gen/` file. `generate.ts` calls `buildMacro` first in every attempt, passes `M` to `noiseFill`, and `carveSpine` after `smooth`.

```ts
export type MacroLayout = {
  root: number                 // cell index cy * MW + cx, top row
  edges: number[]              // graph edges (tree + loops) as grid-edge indices, §3.1
  loops: [number, number][]    // the MACRO_LOOPS non-tree edges as cell pairs
  centre: Int32Array           // per cell: tile index of the jittered centre
  depth: Int8Array             // per cell: tree depth from root
  ecc: number; treeDraws: number // → CaveStats (SAE4 §2)
  M: Uint8Array                // w*h, 1 = forced wall
}
export function buildMacro(rnd: Rnd, w: number, h: number): MacroLayout   // stream 'cave:macro'
export function carveSpine(g: Uint8Array, w: number, h: number, L: MacroLayout, rnd: Rnd): number // 'cave:spine', tiles carved
export const macroCellOf = (i: number, w: number): number => Math.floor((i % w) / CELL) + Math.floor(Math.floor(i / w) / CELL) * MW
```

## 2. Constants (SAE1 §2.2, copied)

```ts
export { MAP_W, MAP_H } from '../../core/state.ts'  // 320 × 240 = 10 240 × 7 680 px, tile 32 px; defined once in core
export const CELL = 40                 // macro cell, grid MW × MH = 8 × 6 = 48 cells
export const MW = 8, MH = 6
export const CELL_INSET = 4            // solid margin per cell edge → free chamber 32×32; 8-tile wall between cells
export const CORR_W = 8                // free band across the macro wall per graph edge
export const CORR_OFF = 8              // band centre offset rnd.int(-8, 8) along the shared side
export const CENTRE_JIT = 6            // cell centre = cell middle + rnd.int(-6, 6) per axis
export const ECC_MIN = 12, ECC_MAX = 14, ECC_TARGET = 13
export const TREE_TRIES = 64
export const MACRO_LOOPS = 2
export const SPINE_R = 3
```

## 3. Tree construction (`buildMacro`, stream `'cave:macro'`)

### 3.1 Grid edges

82 grid edges: 7 × 6 = 42 horizontal + 8 × 5 = 40 vertical. Edge order (R-108): `e < 42` → horizontal, cells `(e % 7, ⌊e/7⌋)` and its east neighbour; `e >= 42` → vertical, `k = e − 42`, cells `(k % 8, ⌊k/8⌋)` and its south neighbour.

### 3.2 Algorithm (fixed draw count per tree)

1. **Root:** `root = rnd.int(0, 7)` (top row, cell `cx = root, cy = 0`). 1 draw, once per attempt.
2. **Tree draw** (repeat up to `TREE_TRIES = 64`): Fisher–Yates over `[0..81]` with `j = rnd.int(0, i)` for `i = 81 .. 1` → **exactly 81 draws per tree**. Kruskal with union-find over the shuffled order; 47 edges join 48 cells. BFS on the tree from `root` → `depth[]`, `ecc = max depth`.
3. **Window:** accept if `ECC_MIN <= ecc <= ECC_MAX` and step 4 finds 2 loops. Else draw the next tree (same stream continues). `treeDraws` = trees drawn.
4. **Loops:** candidates = non-tree grid edges `(a, b)` with `depth[a] >= 3`, `depth[b] >= 3` and tree distance `a↔b >= 3` (cycle ≥ 4 cells ≈ 176 tiles). Order: tree distance desc, then edge index asc. Add greedily if BFS eccentricity of the cell graph (tree + accepted loops) from `root` stays `>= ECC_MIN`. Stop at `MACRO_LOOPS = 2`. Fewer than 2 → redraw the tree; counts toward the 64.
5. **After 64 misses:** keep the drawn tree with minimal `|ecc − 13|` (first wins ties). Never throws. Keep its loops (0–1); pass 8 makes up the shortfall (R-112), else rejection §5 (R-109).
6. **Jitter** (after the tree is fixed): R-110: same `'cave:macro'` stream, centres in cell index order (2 draws each, x then y, `rnd.int(-6, 6)`, 96 draws), then band offsets in ascending graph-edge index (R-108 numbering; 1 draw each, `rnd.int(-8, 8)`, `47 + loops.length` draws (49 normally)). These are the last draws of `'cave:macro'`. Cell middle = `(cx·40 + 20, cy·40 + 20)`.

Draw count per attempt: `1 + 81 × treeDraws + 96 + 47 + loops.length`. Cost: 48 nodes, microseconds per tree (SAE1 §4: 0.3 ms incl. mask).

### 3.3 Mask `M`

`M = new Uint8Array(w*h).fill(1)`, then free (`M[i] = 0`):

- each cell inset: `x ∈ [cx·40 + 4, cx·40 + 35]`, `y ∈ [cy·40 + 4, cy·40 + 35]` (32×32);
- each graph edge (tree + loops): an `8`-wide band across the 8-tile macro wall. Horizontal edge `(cx, cy)–(cx+1, cy)`: `x ∈ [cx·40 + 36, cx·40 + 43]`, `y ∈ [c − 4, c + 3]`, `c = cy·40 + 20 + off`. Vertical edge: transposed.

Outer cells: inset 4 > `MAP_BORDER = 2`, so the map border stays wall. Free area = 48 × 1 024 + 49 × 64 = **52 288 tiles**.

### 3.4 Interplay with noise fill and CA (SAE1 §2.2, §2.3)

- Noise fill: `g[i] = M[i] || isEdge || r < 0.45`, **and `r = rnd.next()` is drawn for every tile, masked or not** → noise draws stay exactly `w·h = 76 800`; every later tag is unaffected (ALWAYS-draw rule, part 1 §2).
- CA ×5 (part 1 §3, unchanged rule 4-5): all-wall mask areas stay wall (≥ 4 wall neighbours). Chamber rims touching the mask get more wall neighbours and round off; accepted texture.
- **Pass 2b spine** (after CA, before widen): `carveDisc(g, w, h, centre[c], SPINE_R)` for every cell, then `carveTunnel(g, w, h, centre[a], centre[b], rnd)` (2-wide staircase, part 1 §9.2) for every graph edge in ascending edge index, stream `'cave:spine'`. Draws vary with the jittered Manhattan length; own tag, so no other stream shifts. The spine guarantees connectivity along every graph edge whatever CA does in the band; the staircase may cross the macro wall beside the band (centres jitter ±6, band ±8) — both openings are floor, monotone carving holds.
- CA blobs not touching the spine are dropped by pass 4 (largest region) as before.

Expected D (SAE1 §2.2): ≈ 44 tiles per cell step; `D ≈ 44 · ecc + 35` → ecc 12/13/14 → 563 / 607 / 651, ±25 → 538–676 ⊂ [510, 690].

## 4. Pass order (replaces part 1 §1.3; = SAE1 §2.3)

0 macro tree + mask (`'cave:macro'`) → 1 noise fill `g[i] = M[i] || isEdge || r < 0.45` (`'cave:fill'`) → 2 CA ×5 → **2b spine (`'cave:spine'`)** → 3 widen + diagonal fix → 4–5 largest region + reject → 6 entrance (pool restricted to the root cell) → 7 D0 → 8 loop tunnels (`'cave:tunnels'`) → 9 Beacon + chamber + final D → 10+ part 2 / part 4. Monotone-carving invariant unchanged: 2b only adds floor and runs before pass 4.

**Attempt seeding: R-111.** `caveSeed(seed, a) = a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)`; every tag above (incl. `'cave:macro'`, `'cave:spine'`) is `makeRnd(hashSeed(caveSeed, tag))`, so each attempt gets a new tree, noise, spine and placement.

## 5. Rejection (replaces part 1 §5 thresholds; SAE1 §3)

| Rule | Value |
|---|---|
| Floor minimum | `keep >= 16 000` (≈ 70 % of the 22 k expectation) |
| Bounding box | region spans **≥ 90 %** of `w` and of `h` AND every macro cell holds **≥ `CELL_FLOOR_MIN = 150`** region floor tiles; reject budget ≤ 3 / 62 attempt-0 seeds, else 100 (R-114) |
| Entrance rows | a region tile with `ty < 18` **inside the root cell** (free rows 4..17) |
| Loops | `stats.loops >= 2` after pass 8 (macro loops count, §6) |
| Beacon distance | `BEACON_DIST_BAND = [510, 690]`: `510 <= beaconDist <= 690`; fallback `>= 459` (part 4 §4) |
| Attempts | `MAX_ATTEMPTS = 8`, expected ≈ 1.1; none passes → `fallbackCave(seed)`, `stats.fallback = true` (R-048) |

`BEACON_DIST_MIN = 120` is removed. Entrance (part 1 §6 step 1): candidates are region floor tiles with `ty < 18` **and** `macroCellOf(i) === root`, rest unchanged.

## 6. Loop guarantee changes (replaces part 1 §9.1 values; SAE1 §3.1)

- **Macro loops:** the 2 loop edges are verified by `hasAlternativeRoute(g, w, h, centre[a], centre[b])` (part 1 §9.3, `k = 2`, `minLen = 40` unchanged). Verified at the start of pass 8 (after D0; monotone carving keeps them valid); `mv` = number verified; failed loops do not count; tunnel target `kt = max(k, 2 − mv)` (R-112).
- **Pass 8 tunnels:** `k = rnd.int(0, 1)` (still 1 draw, then all 1 000 samples); `stats.loops = mv + committed tunnels`, total 2–3.

| Constant | Old | New |
|---|---|---|
| `U` samples | 300 | **1 000** (exactly 1 000 draws) |
| `TUN_MAX`, ring | 12, `3..12` | unchanged |
| `GAIN_MIN` / relaxed | 50 / 25 | unchanged |
| `SPREAD` / relaxed | 30 / 20 | **60 / 40** |
| Pool | `D0 >= 0.2 Dmax` | unchanged |
| Pair filter | – | **`u`, `v` in the same macro cell or graph-adjacent cells** (`macroCellOf`, edges of `MacroLayout`), applied before any BFS |
| Shortcut guard | `max D >= 0.8 Dmax` | **`max D >= max(DMIN, 0.95 Dmax0)`**, `DMIN = BEACON_DIST_BAND[0]` (510, from `macro.ts`) |
| `hasAlternativeRoute` `k`, `minLen` | 2, 40 | unchanged |
| `k` | `rnd.int(2, 3)` tunnels | **2 macro + `rnd.int(0, 1)` tunnels, target `max(k, 2 − mv)`** |

**Import graph (R-150, acyclic):** `gen/carve.ts` is a leaf (`MAP_BORDER`, `isEdge`, `carveDisc`, `TUN_W`, `brush`, `carveTunnel`; imports core rng types only). `gen/macro.ts` → `carve`. `gen/loops.ts` → `carve`, `macro` (`macroCellOf`, `MacroLayout`, `BEACON_DIST_BAND`), `../bfs.ts`. `gen/places.ts` → `carve`, `macro` (`macroCellOf`), `../bfs.ts`. No file imports `loops` or `places` except `generate.ts`. Full graph: [[architecture-modules-world]] §3.

Cost: 1 000 × 21² ≈ 0.44 M reads + ≤ 4 candidates × 3 BFS + 2 macro-loop checks ≈ **18 ms** (SAE1 §4). With `k = 0` pass 8 still draws the 1 000 samples (fixed draw count). No candidate even after relaxing: no error, no extra draws; rejection only if `stats.loops < 2` (R-113).

## 7. Generation time and chunking (replaces part 2 §7; SAE1 §4)

One attempt ≈ 55 ms (macro 0.3, noise + CA 10, spine/widen/diagonals 1.5, region 1.5, BFS 1.2 each, tunnels 18, chamber 5, part 2 9, validate 6, tiles + hash 2), p95 budget **≤ 80 ms**, typical 1.1 attempts ≈ 60 ms, worst 8 + fallback ≈ 470 ms. SAE4 §1.7 adds `populate` 0.5 ms and rule #14 BFS 1.2 ms → ≈ 57 ms.

**Chunked generation is built** (no longer optional): existing fields `ui.genPending: string` (`''` idle, else seed key) and `ui.genAttempt: number`. Each `update` runs `carveCore(caveSeed(seed, genAttempt))` (R-111) + `populate` + `validateCave`; ok → `startRun` with that result, `genPending = ''`; fail → `genAttempt++`; `genAttempt === MAX_ATTEMPTS` → `fallbackCave(seed)` → `startRun`. Render shows `Carving the cave…` (SAE4 §1.9). Pure in `(seed, attempt)`, HMR resumes at `genAttempt`. Host bailout: SAE4 §1.8 (owner approval for `main.ts`).

## 8. Touched constants and types (SAE4 §2, cave rows)

| Item | New |
|---|---|
| `MAP_W`, `MAP_H` | 320, 240 |
| noise draws | `w·h` = 76 800, masked tiles included |
| `keep` | ≥ 16 000 |
| bbox | ≥ 90 % + `CELL_FLOOR_MIN = 150` per cell |
| `BEACON_DIST_MIN` | removed → `BEACON_DIST_BAND = [510, 690]`; fallback ≥ 459; determinism floor ≥ 459 |
| `U`, `SPREAD` | 1 000; 60 / 40 |
| `main` scratch | ≤ 1 000 |
| `MAX_ATTEMPTS`, `TREE_TRIES` | 8, 64 |
| path fields | `bfs4`, `shortestPath`, `beaconRoomMask`, `CaveCore.dist`: **`Int32Array`** (w·h = 76 800 > 32 767); BFS ≈ 1.2 ms; one shared module-level queue of length `w·h` (SAE4 §1.2) |
| `floorHash` | `ty * w + tx` |
| `CaveStats` | `+ ecc: number`, `+ treeDraws: number`; `loops` = verified macro loops + tunnels |
| unchanged | `MAP_BORDER 2`, `FILL_WALL 0.45`, `CA_ITERS 5`, `widen`, `TUN_MAX 12`, `GAIN_MIN`, `minLen 40`, `ENTRANCE_R 3`, `CHAMBER_R 3`, `CHAMBER_MASK_R 5`, `SAFE_START 6`, `POCKET_DEPTH 10`, pocket 12..90, T1–T4 |

```ts
// src/world/bfs.ts (replaces part 1 §7 signatures)
export function bfs4(g: Uint8Array, w: number, h: number, src: number, out = new Int32Array(w * h)): Int32Array
export function shortestPath(dist: Int32Array, w: number, to: number): number[]
```

## 9. GAP list (all closed, [[architecture-rulings-3]] §1)

1. GAP-1 grid-edge index order (§3.1): closed by R-108.
2. GAP-2 last-resort tree with < 2 loop candidates (§3.2 step 5): closed by R-109.
3. GAP-3 stream and order of centre-jitter and band-offset draws (§3.2 step 6): closed by R-110.
4. GAP-4 per-attempt seeding (§4): closed by R-111.
5. GAP-5 failed macro-loop verification (§6): closed by R-112.
6. GAP-6 tunnel target with no candidate (§6): closed by R-113.
7. GAP-7 `CELL_FLOOR_MIN` reject rate (§5): closed by R-114.
8. GAP-8 `stats.mainLoop` cost: closed by R-115 (accepted cave only, +2.5 ms per run).
9. GAP-9, GAP-10 (pocket counts, front-loaded slot tie rule, [[architecture-cave-generation-4]] §1, §2): closed by R-116, R-117.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-cave-generation-4]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-determinism]]
- [[architecture-rulings-3]]
- [[architecture-modules-world]]

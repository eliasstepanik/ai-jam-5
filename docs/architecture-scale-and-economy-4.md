---
type: architecture
title: Last Ember – Scale Ruling (binding) – Size-Dependent Budgets and Edit Manifest
description: Binding ruling part 4 – every size-dependent budget re-derived for the 160x120 → 320x240 map (State size and limits, explored bitset, Int32 path fields, world and render caches, memory canvas, chunk cache, BFS allowances with a visit cap for rocks, exit-field rebuild rule, generation phases, npm run check runtime, host step-time bailout, loading screen), the touched cave-generation constants, and the mechanical edit manifest for every KB file that carries an old size number.
tags: [project, ai-jam-5, architecture, last-ember, rulings, performance]
timestamp: 2026-10-18T09:30:00Z
---

# Last Ember – Scale Ruling (binding) – 4/4: Budgets and Edit Manifest

Binding input: [[architecture-scale-and-economy]] (SAE1). Siblings: [[architecture-scale-and-economy-2]] (economy, NEW TUNING VALUES), [[architecture-scale-and-economy-3]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. Register: [[architecture-rulings]].

Scale factor: `76 800 / 19 200 = 4` in area, `2` in linear size. Timings are DEFAULT estimates (mid laptop, V8), scaled linearly from the measured-by-estimate 160×120 numbers; no build exists yet. **Note:** item counts in §1.1 use part 2 §3.1 (binding); if part 2 or part 3 (`ROCKS_MAX`) changes a count, re-run §1.1.

## 1. Re-derived budget table

Reconciled with part 2 counts on 2026-10-18.

### 1.1 State (JSON)

Inputs. Per-item JSON from [[architecture-state-2]] §2–§7 at worst digits (id 5, px 5, tile index 5, float 18–19 chars): pickup ≈ 72 B, vein ≈ 73 B (booked **85 B**), monster 18 keys / 11 floats ≈ **400 B**, rock size 2 ≈ **126 B** (size 1 ≈ 108), fx event ≈ **115 B**. Counts from part 2 §3.1 (`round(density × bd/4 / 100)`); pickups = resin + 10 plants, in brackets + ≤ 3 rule-#14b smalls: **bd 510** veins 9+8+7+6 = 30, resin near 13 S + 2 L, off 9 S + 3 L, cluster 3 = 30, pickups 40 (43); **bd 600** veins 34, resin 33, pickups 43 (46); **bd 690** veins 12+10+9+8 = 39, resin 19+2+9+3+3 = 36, pickups 46 (49). Validator caps (#11): pickups ≤ 60, veins ≤ 80. `ROCKS_MAX` **200 is FINAL** ([[architecture-scale-and-economy-3]] §2.1; [[architecture-rulings-3]] R-118); the cap-120 rows are deleted. `MONSTERS_MAX` 24 (part 3 §2.1).

| Item | 160×120 | Typical KB (late escape, D\*) | Worst KB | Math |
|---|---|---|---|---|
| `world.tiles` | 19.2 | **76.8** | **76.8** | `w·h` chars, alphabet `# . ,` needs no JSON escape |
| `world.explored` | ≤ 7 | 14 | **28.8** | 2 400 words; worst `-2147483648,` = 12 chars; typical 40 % non-zero: `960 × 11.5 + 1 440 × 2` |
| `veins` + `pickups` | ≤ 12 | 3.6 | **6.2 / 6.8 / 7.5** (bd 510/600/690); #11 caps 11.9 | typical 60 % of 80 left × 75 B; worst `73 / 80 / 88 × 85 B`; caps `140 × 85` |
| `monsters` | 8 | 3.2 | **9.6** | typical 8 alive (escape `maxAlive`); worst `24 × 400 B` |
| `rocks`, `ROCKS_MAX` 200 (FINAL) | 14 | 14.5 | **25.7** | typical 126 landed (part 3 §3, D\*) × 115; worst `(200 + pendingMax 4) × 126` |
| `fx.events` + rest | 3 + 3 | 1.8 + 2.5 | 3.7 + 3 | `32 × 115 B`; player, meta, ui ≤ 3 KB |
| **Total** | 65 / 200 hard | **116.4** | **155.1** (bd 690), **159.5** at #11 caps | `76.8 + 28.8 + 11.9 + 9.6 + 25.7 + 6.7` |

**Decision: limits hold, unchanged.** Per bd 510/600/690: typical 113.5 / 116.4 / 119.4 KB (lands 101 / 126 / 152 at rampS 80); worst 153.8 / 154.4 / 155.1. Soft budget **180 KB** (worst 159.5 = 89 %), hard check **`JSON.stringify(midRunState).length < 300_000`** (53 %). Items shrank (old ceiling 36 KB → ≤ 11.9 KB); rocks grew with cap 200. No State type change; spec fixes only: [[architecture-state-3]] §8 rows (manifest row 11), and part 3 §3 "200 rocks × ≈ 60 B ≈ 12 KB" understates (126 B → 25.7 KB, part 3 owner). The tile string is shared by reference in `migrate` (`fill` keeps primitives), so swap cost does not grow; `explored.slice()` copies 2 400 numbers per swap (< 0.05 ms).

**STATE_VERSION rule:** [[architecture-state-3]] §2 says a `MAP_W/H` change bumps the version. Bump `1 → 2` only if code with 160×120 has already merged; if not, keep `1` (no old state exists). **Ruled (R-120):** stays `1`; on 2026-10-18 `src/` had no State code.

### 1.2 Derived world caches (outside State, `src/world/caches.ts`, `route.ts`)

| Entry | Type | 160×120 | 320×240 |
|---|---|---|---|
| solid, pending, empty, zone, beacon room | `Uint8Array(w·h)` | 5 × 19.2 KB | **5 × 76.8 = 384 KB** |
| depth field, exit field | `Int16Array` → **`Int32Array`** | 2 × 38.4 KB | **2 × 307.2 = 614.4 KB** |
| exit field second buffer (ping-pong, below) | `Int32Array` | – | **307.2 KB** |
| route scratch stamp | `Uint16Array` | 38.4 KB | 153.6 KB |
| route scratch queue / dist | `Int32Array` / `Int16→Int32Array` | 76.8 + 38.4 KB | 307.2 + 307.2 KB |
| shared BFS queue (`bfs.ts`, reused, was per build) | `Int32Array` | 76.8 KB garbage per build | **307.2 KB once** |
| **Total** | | **≈ 290 KB** | **≈ 2.38 MB**, fixed per run |

Rules: (1) all path fields are `Int32Array` (SAE1 §2.4). (2) `bfsField`/`bfs4` reuse one module-level queue of length `w·h` (re-allocated only on size change) — a 307 KB allocation 3×/s is avoidable garbage. (3) `getExitDist` writes into two preallocated buffers alternately, so each rebuild still returns a new instance (WQ2 tests 3, 11) without allocation. ponytail: ping-pong, not a pool.

### 1.3 Render resources

| Item | 160×120 | 320×240 | Math / rule |
|---|---|---|---|
| tile maps `zone, mask, inner, variant` | 4 × 19.2 = 77 KB | **4 × 76.8 = 307 KB** | build cost 1–2 ms → **4–8 ms**, once, first world frame (one long frame, accepted) |
| memory canvas | 160 × 120 px, 77 KB + `ImageData` 77 KB | **320 × 240 px, 307 KB + 307 KB** | **1 px per tile kept**: 76 800 px ≪ 16.7 M px Safari limit |
| memory diff copy | `Int32Array(600)` | **`Int32Array(2 400)`** | compare 2 400 words/frame ≈ 2 µs |
| memory upload | `putImageData` full, 77 KB | **dirty rect only** | `putImageData(buf, 0, 0, dx, dy, dw, dh)` over the bounding box of the tiles of changed words; a full 307 KB upload costs ≈ 0.3–0.5 ms |
| chunk size | 8 × 8 tiles = 256² px, 256 KB | unchanged | local, not size-dependent |
| chunk grid | 20 × 15 = 300 | **40 × 30 = 1 200** | `ceil(320/8) × ceil(240/8)`; key `cx + cy * CHUNKS_W`, `CHUNKS_W = ceil(w / 8)` (no literal 20/40) |
| full map as chunks | 300 × 256 KB = 77 MB | 1 200 × 256 KB = **307 MB** | never resident: LRU is mandatory (SAE1 §8 risk 1 resolved by the existing chunk cache) |
| LRU cap | 40 (10 MB) | **40 unchanged** | viewport-bound: 1080p z = 2 → 960 × 540 world px → ≤ 5 × 4 = 20 chunks; 1440p z = 3 → 853 × 480 → ≤ 5 × 3 = 15; 2× headroom |
| build quota | 4 / frame | **4 unchanged** | sprint 240 px/s crosses a chunk column every 256 / 240 = 1.07 s, needing ≤ 4–5 new chunks; direct paint covers overflow |
| darkness canvas | ≤ 8.3 MB (1080p), 14.7 MB (1440p) | unchanged | viewport-sized |

Memory budget of [[architecture-resources]] §5 (R-122, absolute figures): world caches **2.38 MB** (§1.2), render maps **0.92 MB** (tile maps 307 KB + memory canvas 2 × 307 KB) → ≈ 133 MB total (was ≈ 130 MB; deltas vs 160×120 are +2.1 / +0.7 MB). Fits.

### 1.4 CPU per call and per step

| Quantity | 160×120 | 320×240 | Math / rule |
|---|---|---|---|
| full-field BFS (`bfs4`, `bfsField`) | 19 200 cells ≈ 0.2–0.3 ms | **76 800 ≈ 0.8–1.2 ms** | ×4; SAE1 §4 uses 1.2 ms |
| solid grid rebuild | 0.03 ms | 0.12 ms | ×4, full copy kept |
| `revealAround` | ≤ 546 reads | **unchanged** | light radius in px, `rt = 6` |
| LOS longest line | ≤ 160 reads | ≤ 320 reads | `max(w, h)`; reveal uses ≤ 6 |
| `moveCircle`, `nearestFloor`, `sampleSpawn` | ≤ 72 / ≤ 289 / ≤ 12 × 10 reads | **unchanged** | local |
| monster spawn sampling ([[architecture-monsters-ai]]) | O(tries) | **unchanged** | rings around the player, local |
| AI flow-field upgrade ([[architecture-monsters-ai-2]] trigger) | ≤ 19 200 cells ≈ 0.5 ms | **windowed BFS, Chebyshev 40 → ≤ 81² = 6 561 cells ≈ 0.1 ms** | a full 76 800 field per player tile change (3.75/s) would be ≈ 4 ms/s; window is the rule if ever built |
| pocket detection (gen) | ≈ 1.0 ms | ≈ 3–4 ms | floor 8.5 k → 22 k (×2.6), stamped floods; inside SAE1 §4 "part 2: 9 ms" |
| `main` path scratch | ≤ 400 steps | **≤ 1 000** | `beaconDist ≤ DMAX 690` |

### 1.5 Rocks BFS allowance (binding, replaces [[architecture-rocks]] §4.4 cost and [[architecture-rocks-2]] §5 budget)

Old hard worst: 7 full BFS × 19 200 ≈ 1.4–1.8 ms. Same count at 76 800 = **7 × 1.2 ≈ 8.4 ms**: does **not** fit beside render (≈ 5 ms) and AI. New rule:

1. **Early exit by proof.** `routeDist` stops at the first visited tile `t` with `E[t] >= 0 && E[t] < eF`, where `E = getExitDist(s)` and `eF = min{E[f] : f ∈ F, E[f] >= 0}` (`+∞` if none). Proof: `E` strictly decreases along `downhill(E, t)`, every tile of `F` has `E ≥ eF > E[t]`, and `E` already blocks all pending tiles, so that route avoids `F` and every pending shadow. Valid for both `pendingBlocks` modes (a strict route is also a physical route). Returns `dist[t] + E[t]`: a real route length, so an upper bound of the true distance; the detour cap can only get stricter (R-119).
2. **Visit cap** `ROUTE_VISIT_MAX = 19 200` cells per `routeDist` call (= the old map, ≈ 0.25–0.3 ms). Exceeded → result `-1` (not reachable). This is conservative on every caller: plan → candidate rejected; landing → shrink → cancel; push-out → next target → cancel. Cancelling a rock never traps the player, so the guarantee holds. Cost of the cap: rocks whose only detour needs > 19 200 visited cells are not placed (a 19 200-cell detour is > 25× DMAX; never a fair rock).
3. Allowances per step (unchanged counts): plan ≤ 3 capped BFS, landing ≤ 6 capped BFS, never both (existing `bfs > 0` deferral), plus ≤ 1 full exit-field rebuild. **Hard worst: 6 × 0.3 + 1.2 = 3.0 ms.** Typical step: 0 BFS; typical plan/land: early exit within < 200 cells.

### 1.6 Exit-field recompute rule

Change rate unchanged (commit + land ≈ 2 × 1.6/s ≤ 3.2/s, escape cadence is part 2). Full recompute ≈ 1.2 ms → **≤ 3.8 ms per simulated second (≈ 0.4 % of CPU)**. **Decision: keep full lazy recompute, no chunking, no incremental repair** ([[architecture-world-queries-2]] §1.2 reasoning holds at 4×). Rules: (a) coalesce — lazy read means k changes before one read cost one rebuild; (b) at most 1 rebuild per step: `stepQuake` reads `getExitDist` once at its end so render never pays a rebuild; (c) ping-pong buffers (§1.2). ponytail: upgrade to a bounded-radius repair only if a profile shows a rebuild > 3 ms on the target laptop.

### 1.7 Generation (matches SAE1 §4, not re-derived)

One attempt ≈ 55 ms, p95 budget ≤ 80 ms, typical 1.1 attempts ≈ 60 ms, worst 8 + fallback ≈ 470 ms. Chunked: one attempt per `update`, `ui.genPending` / `ui.genAttempt`. Additional pass costs from this file: tile string 2 ms, render tile maps 4–8 ms on the first world frame (not in generation). Part 2 counts add per attempt: `populate` ≤ 88 items × 24 tries × ≤ 88 spacing checks ≈ 0.19 M compares ≈ 0.5 ms, rule #14 `distB` BFS 1.2 ms → ≈ 57 ms, inside the 80 ms p95; cave check (62 gens) +0.1 s, still < 6 000 ms. Monster spawn sampling and pocket detection do not depend on item counts (§1.4 unchanged).

### 1.8 Host frame-time cap (binding host change, needs owner approval as a `main.ts` edit)

Current host: `MAX_FRAME = 0.25` → ≤ 15 catch-up steps ([[architecture-host-changes]] §hidden tab). At 15 steps × 55 ms a run of failed attempts would freeze one frame for 825 ms. **Rule:**

```ts
const STEP_BUDGET_MS = 12 // ponytail: wall-time bailout; per-system time slicing if a normal step ever nears it
// inside frame(), around the existing while (acc >= STEP) loop
const t0 = performance.now()
while (acc >= STEP) {
  game.update(state, input, STEP); acc -= STEP
  if (performance.now() - t0 > STEP_BUDGET_MS) { acc = 0; break }   // drop the backlog, never spiral
}
```

- `MAX_FRAME = 0.25` and `dt = STEP` stay. Max steps per frame stays 15 when steps are cheap (15 × 0.3 ms AI ≈ 4.5 ms < 12 ms: never triggers in play).
- During generation: one attempt (≥ 30 ms on any machine) exceeds 12 ms, so **exactly one attempt per frame**; the loading screen renders between attempts at ≈ 13–18 fps.
- Determinism: unaffected (simulation is step-counted; only wall-time backlog is dropped). Score uses `meta.steps`.
- After the last attempt the next frame carries ≈ 80 ms backlog → ≤ 5 catch-up `playing` steps (0.08 s). Accepted.

### 1.9 Loading screen behaviour

While `ui.genPending !== ''`: screen stays `title` (so `meta.steps` does not count), input except `Escape` is ignored, centre text `Carving the cave…` plus `attempt n/8` from `ui.genAttempt` (debug builds only), spinner from `meta.time`. Typical seed: 1 frame (≈ 60 ms), the text may not show before the first attempt — ponytail: accepted, no frame-boundary handshake. Escape cancels: `genPending = ''`. HMR mid-generation resumes at `genAttempt` (SAE1 §4).

### 1.10 `npm run check` runtime

| Check | 160×120 | 320×240 rule | Est. |
|---|---|---|---|
| cave test 2/8: 62 generations | < 1 500 ms | SAE1: total < 6 000 ms, max < 200 ms | ≈ 3.7 s |
| determinism: 20 seeds twice | ≈ 0.3 s | unchanged seeds; memoised first run via `src/checks/caves.ts` `caveOf(seed)` | ≈ 1.2 s |
| fallback: 20 seeds + `A = 0` | small | unchanged | ≈ 0.5 s |
| rocks property | 24 × 150, < 3 000 ms | **seeds 1..12 × 150 ops = 1 800**, assert **< 8 000 ms**; oracle is a full 76 800 BFS (≈ 1–1.5 ms, independent, no early exit) × 2 per op | ≈ 2.5–4.5 s + 12 gens 0.7 s |
| rocks e2e bot seed 3 | 3 600 steps | unchanged | ≈ 0.5 s |
| world test 13: 200 × `getExitDist` | < 100 ms | **< 400 ms** | ≈ 0.24 s |
| ai, state, score, world rest | ≈ 1.5 s | unchanged | ≈ 1.5 s |
| **Total** | target < 5 s | **typical ≈ 9 s, worst ≈ 16 s, hard < 30 s**; new target **< 15 s** | |

`CHECK_HEAVY=1` (read inside `run()`, R-041): seeds 1..200 fallback rate (≈ 13 s) and rocks 100 seeds × 150 ops (≈ 40 s). Local only; CI never sets it.

## 2. Touched constants (cave generation)

| Constant | Old | New | Reason |
|---|---|---|---|
| `MAP_W`, `MAP_H` | 160, 120 | **320, 240** | SAE1 §2.2 |
| noise draws per attempt | 19 200 | **`w·h` = 76 800** | ALWAYS draw, masked tiles included |
| floor minimum `keep` | 5 500 | **16 000** | SAE1 §3 |
| bounding box | ≥ 60 % of w, h | **≥ 90 % + `CELL_FLOOR_MIN = 150` per cell** | SAE1 §3 |
| entrance top rows | `ty < 18` | **`ty < 18` and in the root cell** | root cell free rows 4..17 |
| `BEACON_DIST_MIN` | 120 | **removed → `BEACON_DIST_BAND = [510, 690]`**; fallback `>= 459` | SAE1 §3, §6 |
| determinism floor | `beaconDist >= 60` | **`>= 459`** | weakest valid map is the fallback |
| loop samples `U` | 300 | **1 000** | SAE1 §3.1 |
| `SPREAD` / relaxed | 30 / 20 | **60 / 40** | SAE1 §3.1 |
| shortcut guard | `>= 0.8 Dmax` | **`>= max(DMIN, 0.95 Dmax0)`** | SAE1 §3.1 |
| tunnel pair filter | – | **same or graph-adjacent macro cell** | SAE1 §3.1 |
| loop count `k` | `rnd.int(2, 3)` tunnels | **2 macro + `rnd.int(0, 1)` tunnels** | SAE1 §3.1 |
| `TUN_MAX`, Chebyshev ring | 12, `3..12` | unchanged | local crack |
| tunnel max steps | `manhattan ≤ 24` | unchanged (follows from `TUN_MAX`) | – |
| `GAIN_MIN`, `minLen`, `k` | 50/25, 40, 2 | unchanged | local |
| `ENTRANCE_R`, `CHAMBER_R`, `CHAMBER_MASK_R`, `SAFE_START` | 3, 3, 5, 6 | unchanged | local |
| rocks exit / Beacon clear | 5 / Beacon room | unchanged | local |
| `POCKET_DEPTH`, pocket size | 10, 12..90 | unchanged | local |
| teaching ranges T1–T4 | path 7–24 | unchanged | SAE1 §5 |
| `main` scratch | ≤ 400 | **≤ 1 000** | §1.4 |
| `MAX_ATTEMPTS`, `TREE_TRIES` | 8, – | 8, **64** | SAE1 §2.2 |
| fallback ring | centre (80,60), rx 66, ry 46, chord y 59..61, col 80 | **(160,120), 148, 108, y 119..121, col 160, Beacon (160,222)** | SAE1 §6 |
| `floorHash` index | `ty * 160 + tx` | **`ty * w + tx`** | visual only |
| new sub-stream tags | – | **`'cave:macro'`, `'cave:spine'`** | SAE1 §2.2 |
| `CaveStats` | – | **+ `ecc: number`, `treeDraws: number`** | SAE1 §8 risk 4 (log per seed) |

Economy constants (quotas, `CHAMBERS`, resin/vein counts, `rocksMax`, rock cadence incl. `rockIntervalS` → R-056) are **not** here: see [[architecture-scale-and-economy-2]] NEW TUNING VALUES.

## 3. Edit manifest (apply mechanically; "→ SAE4 §x" = replace with the value and cite this file)

Search used (literal, `projects/ai-jam-5/`): `160`, `120`, `19 200`, `19200`, `19,200`, `160x120`, `160×120`, `BEACON_DIST_MIN`, `Int16Array`, `65 KB`, `200 KB`, `600 words`, `memory canvas`, `rockIntervalS`, plus `MAP_W`, `5 500`, `ty < 18`, `SPREAD`, `catch-up`, `38.4`, `77 KB`. `19,200`, `600 words` (as phrase outside state-3), `memory canvas` (only render.md row) had no other hits. Pure economy/spec hits (`economy-check` tables, `tuning-2` px values, audio `160` Hz) are not size rows.

| # | File | Section | Old | New |
|---|---|---|---|---|
| 1 | [[architecture-state]] | §3 table | `MAP_W 160 (5120 px)`, `MAP_H 120 (3840 px)`, `19 200` | `320 (10 240 px)`, `240 (7 680 px)`, `76 800` |
| 2 | [[architecture-state]] | §3 rationale | CA 200–300 tiles, "shrink to 128×96" | pointer to SAE1 §1–2 (D band 510–690, macro layout); delete the shrink line |
| 3 | [[architecture-state]] | §4 table + intro | `19 200` tiles, `about 40 KB JSON`, `19 KB` | `76 800`, `about 160 KB JSON`, `77 KB` |
| 4 | [[architecture-state-2]] | §1 `World` comments | `MAP_W = 160`, `MAP_H = 120`, `600 int32 words` | `320`, `240`, `2 400` |
| 5 | [[architecture-state-2]] | §1 defaults table | `160, 120`; length `19 200`; `new Array(600)` | `320, 240`; `76 800`; `new Array(2400)` (better: `Math.ceil(w*h/32)`) |
| 6 | [[architecture-state-2]] | §10 `init()` note | "19 200-tile generation" | "76 800-tile generation (≈ 55 ms, chunked, SAE1 §4)" |
| 7 | [[architecture-state-2]] | §10 `startRun` step 2 | `generateCave(seed)` sync | `startRun` receives the finished `CaveResult` from the `ui.genPending` loop (SAE1 §4) |
| 8 | [[architecture-state-3]] | §2 version policy | – | add: SAE4 §1.1 STATE_VERSION rule |
| 9 | [[architecture-state-3]] | §5 table rows 1–3 | `Int16Array 19 200`, `Int16Array`, `cache.ts` | `Int32Array 76 800`, `Int32Array`, `caches.ts` (R-046) |
| 10 | [[architecture-state-3]] | §7 #6 | `< 200_000` | `< 300_000` |
| 11 | [[architecture-state-3]] | §8 table | 19 200 B; 600 words ≤ 7 KB; ≤ 12 KB; total 65 KB / 200 KB | SAE4 §1.1 rows; total ≈ 160 KB worst, ≈ 116 KB typical, soft 180 KB, hard 300 KB |
| 12 | [[architecture-world-queries]] | §4 LOS cost | "≤ 160 for the longest map line" | "≤ 320" |
| 13 | [[architecture-world-queries-2]] | §1 code | `Entry<Int16Array>` ×2, `getDepthField/getExitDist(): Int16Array`, `bfsField(): Int16Array`, queue "allocated per build" | `Int32Array`; shared queue + exit ping-pong (SAE4 §1.2) |
| 14 | [[architecture-world-queries-2]] | §1.1 table | 19.2 KB ×3, 38.4 KB ×2, 0.03 / 0.2 ms, scratch 38.4+76.8+38.4, total ≈ 290 KB | 76.8 KB, 307.2 KB, 0.12 / 1.2 ms, 153.6+307.2+307.2, total ≈ 2.38 MB |
| 15 | [[architecture-world-queries-2]] | §1.2 | "19 200 cells ≈ 0.15–0.25 ms", "0.8 ms per second", "0.5 ms" | "76 800 ≈ 1.2 ms", "≤ 3.8 ms per second", "≤ 1 rebuild per step" → SAE4 §1.6 |
| 16 | [[architecture-world-queries-2]] | §1.3 item 2 | "≈ 0.5 ms" | "≈ 3 ms" (4 rebuilds × ≈ 0.8) |
| 17 | [[architecture-world-queries-2]] | §2 text | "`Int16Array` holds 32 767 … < 19 200" | "`Int32Array`; `w·h = 76 800 > 32 767`" |
| 18 | [[architecture-world-queries-2]] | §3 table | `routeDist` ≤ 19 200 / 1.5 ms; rebuild ≤ 19 200 / 0.5 ms | ≤ `ROUTE_VISIT_MAX` 19 200 / ≤ 1.8 ms; 76 800 / ≤ 1.2 ms |
| 19 | [[architecture-world-queries-2]] | §4 test 1, 13 | `t in 0..159`; `< 100 ms` | `0..319`; `< 400 ms` |
| 20 | [[architecture-rocks]] | §4.4 options table | `19 200` ×5, "< 0.3 ms" | `76 800`; cost "< 1.2 ms"; chosen BFS gets early exit + cap (SAE4 §1.5) |
| 21 | [[architecture-rocks]] | §4.4 code | `dist = new Int16Array(...)` ×2 | `Int32Array`; add `ROUTE_VISIT_MAX` + early-exit test |
| 22 | [[architecture-rocks]] | §4.4 complexity | 19 200, 77 k reads, 0.10–0.25 ms, path ≤ 400, 0.75 ms | capped 19 200 visits ≈ 0.3 ms, path ≤ 1 000, worst 0.9 ms |
| 23 | [[architecture-rocks]] | §2 note | `rockIntervalS` supersede | unchanged; cadence values → part 2 (economy, R-056) |
| 24 | [[architecture-rocks-2]] | §5 per-step budget | 7 BFS × 19 200 ≈ 1.4–1.8 ms | 6 capped + 1 full ≈ 3.0 ms (SAE4 §1.5) |
| 25 | [[architecture-rocks-2]] | §7 property test | seeds 1..24, 3 600 ops, `< 3000 ms`, heavy 100 seeds | seeds 1..12 × 150, `< 8000 ms`, heavy 100 seeds; oracle stays uncapped |
| 26 | [[architecture-rocks-2]] | §1, §2 | `routeDist` failure semantics | add: cap-exceeded = `-1` (conservative) |
| 27 | [[architecture-cave-generation]] | §1 module table + §1.3 | pass list without macro | add `src/world/gen/macro.ts` (tree, mask, spine, ≈ 120 lines); pass order → SAE1 §2.3 |
| 28 | [[architecture-cave-generation]] | §2 noise | "exactly 19 200 draws" | "exactly `w·h` (76 800) draws, masked tiles included" |
| 29 | [[architecture-cave-generation]] | §3 CA | "5 × 19 200 × 9 ≈ 0.9 M reads, under 5 ms"; "160×120 … 150–300 tiles" | "5 × 76 800 × 9 ≈ 3.5 M, ≈ 10 ms"; "320×240 + macro, D 510–690" |
| 30 | [[architecture-cave-generation]] | §5 thresholds | `keep >= 5 500`; bbox 60 %; `beaconDist >= 120` | `16 000`; 90 % + `CELL_FLOOR_MIN 150`; `BEACON_DIST_BAND [510, 690]` |
| 31 | [[architecture-cave-generation]] | §5 attempts | "under 15 ms per attempt; about 1.2 attempts"; 1..200 rate | "≈ 55 ms, ≤ 80 ms p95; ≈ 1.1"; rate check heavy-only (R-048) |
| 32 | [[architecture-cave-generation]] | §6 entrance | `ty < 18` candidates | `ty < 18` and inside the root macro cell |
| 33 | [[architecture-cave-generation]] | §7 `bfs4`, `shortestPath` | `Int16Array` signatures; "≤ 19 200 < 32 767, 0.3 ms" | `Int32Array`; "Int32, ≈ 1.2 ms"; shared queue |
| 34 | [[architecture-cave-generation]] | §8 `beaconRoomMask` | `D: Int16Array` | `D: Int32Array` |
| 35 | [[architecture-cave-generation]] | §9.1 | `U = 300`, `SPREAD 30/20`, guard `0.8 Dmax`, `k` 2–3 tunnels, cost "300 × 21²" | SAE4 §2 rows; cost "1 000 × 21² ≈ 0.44 M + BFS ≈ 18 ms" |
| 36 | [[architecture-cave-generation-2]] | §0.2 `CaveCore` | `dist: Int16Array` | `Int32Array` |
| 37 | [[architecture-cave-generation-2]] | §1, §2 costs | "19 200 writes ≈ 0.05 ms"; "4 × 19 200 reads"; `main ≤ 400`; `nearMain ≤ 400 × 49` | 76 800 ≈ 0.2 ms; 4 × 76 800; ≤ 1 000; ≤ 1 000 × 49 |
| 38 | [[architecture-cave-generation-2]] | §2 `CHAMBERS` table header | "CA 160×120", pockets 3–6 | "320×240", pocket counts re-measured; `CHAMBERS` values → part 2 |
| 39 | [[architecture-cave-generation-2]] | §3.1 quotas, §3.1 budget line | pickups ≤ 60, veins ≤ 80 | → part 2 NEW TUNING VALUES; state ceilings SAE4 §1.1 |
| 40 | [[architecture-cave-generation-2]] | §5 `floorHash` | `ty * 160 + tx` | `ty * w + tx` (pass `w`) |
| 41 | [[architecture-cave-generation-2]] | §6 fallback steps 1, 3, 4, 6 | 160×120, (80,60), 66/46, y 59..61, col 80, "≈ 179 ≥ BEACON_DIST_MIN" | SAE1 §6 values; accept `>= 459` |
| 42 | [[architecture-cave-generation-2]] | §6.1 #1, #5 | `=== 19 200`; `>= BEACON_DIST_MIN = 120` | `=== w*h === 76 800`; band 510–690, fallback 459 |
| 43 | [[architecture-cave-generation-2]] | §7 title + table + chunking | "< 50 ms at 160×120", ≈ 8 ms, chunking "build only if" | "≤ 80 ms p95 at 320×240", SAE1 §4 table; chunking built (SAE1 §4) |
| 44 | [[architecture-cave-generation-2]] | §8 note | "a 0.2 ms BFS" | "a 1.2 ms BFS" |
| 45 | [[architecture-cave-generation-2]] | §9 test 2, 8 | ≥ 55 of 62 on attempt 0; < 1 500 / < 120 ms | ≥ 50 of 62; < 6 000 / < 200 ms; log `ecc`, `treeDraws` |
| 46 | [[architecture-determinism]] | §7 table row `generateCave` | `beaconDist >= 60`, `tiles.length === 19200` | `>= 459`, `=== 76800`; streams +`'cave:macro'`, `'cave:spine'` (§4 table) |
| 47 | [[architecture-render-2]] | §2.1 table + cost | `Uint8Array(19200)` ×4; "19 200 tiles, 1–2 ms" | `Uint8Array(w*h)` (76 800); "4–8 ms" |
| 48 | [[architecture-render-2]] | §2.2 chunk grid + key | "20 × 15 = 300"; `cx + cy * 20` | "40 × 30 = 1 200"; `cx + cy * CHUNKS_W`; LRU 40, quota 4 unchanged |
| 49 | [[architecture-render-2]] | §5.2 memory | `160 × 120` px; `Int32Array(600)`; 600 words; full `putImageData` 77 KB | `320 × 240`; `Int32Array(2400)`; 2 400; dirty-rect `putImageData` (SAE4 §1.3) |
| 50 | [[architecture-render]] | §1 module table `memory.ts` | – | add "dirty-rect upload"; size unchanged |
| 51 | [[architecture-render-3]] | §3 budget table, tiles row | first visit +0.5 ms per chunk | unchanged; add "tile maps 4–8 ms once per run" |
| 52 | [[architecture-resources]] | §2 `TileCache` comments | `// 19 200 each`; `cx + cy * 20` | `// w*h (76 800) each`; `cx + cy * CHUNKS_W` |
| 53 | [[architecture-resources]] | §5 table | tile maps 77 KB; memory 2 × 77 KB | 307 KB; 2 × 307 KB |
| 54 | [[architecture-resources]] | §5 memory budget | ≈ 130 MB | ≈ 133 MB (world caches 2.38 MB outside registry, render maps 0.92 MB; R-122) |
| 55 | [[architecture-host-changes]] | hidden-tab bullets, "No giant dt" | `MAX_FRAME` clamp only, "no host change is needed" | add `STEP_BUDGET_MS = 12` bailout (SAE4 §1.8); needs owner approval |
| 56 | [[architecture-host-changes-2]] | "Must stay true" check line | "< 30 s, target < 5 s (20 seeds × gen)" | "< 30 s, target < 15 s" (SAE4 §1.10) |
| 57 | [[architecture-host-changes-2]] | "Does NOT change" list | "the loop and the accumulator clamp" | remove those words; loop gains the bailout |
| 58 | [[architecture-monsters-ai-2]] | flow-field upgrade trigger | "≤ 19 200 cells ≈ 0.5 ms" | windowed BFS Chebyshev 40, ≤ 6 561 cells ≈ 0.1 ms |
| 59 | [[architecture-monsters-ai-2]] | §5 budget | "15 catch-up steps ≤ 4.5 ms" | unchanged; add "bailout at 12 ms (SAE4 §1.8)" |
| 60 | [[architecture-modules-core]] | §3.2 `MAP_W`, `MAP_H` row | `160`, `120` | `320`, `240` |
| 61 | [[architecture-modules-core]] | §4 `state.check.ts` #6 | "under 200 000 chars" | "under 300 000" |
| 62 | [[architecture-modules-world]] | §1 `bfs.ts`, `caches.ts` exports | `Int16Array` (bfs4, shortestPath, getDepthField, getExitDist, bfsField) | `Int32Array` |
| 63 | [[architecture-modules-world]] | §2 rows + exports | no macro module; `beaconRoomMask(D: Int16Array)`; loops `SPREAD = 30`, `U = 300`; validate `BEACON_DIST_MIN = 120` | add `src/world/gen/macro.ts` (`buildMacro`, `carveSpine`, constants SAE1 §2.2); `Int32Array`; `60`, `1 000`; `BEACON_DIST_BAND` |
| 64 | [[architecture-modules-world]] | §1 `route.ts` | scratch `stamp/gen/queue/dist` | `dist` Int32; export `ROUTE_VISIT_MAX` |
| 65 | [[architecture-modules-world]] | §4 checks table | cave 62 gens < 1 500 / < 120 ms; rocks 1..24 < 3 000 ms; world 200 × < 100 ms; "≈ 5 s worst" | < 6 000 / < 200; 1..12 < 8 000; < 400 ms; "≈ 16 s worst" |
| 66 | [[architecture-modules-render]] | §3 `memory.ts` row | "160×120 memory map canvas" | "320×240 (`w×h`) memory canvas, dirty-rect upload" |
| 67 | [[architecture-modules-render]] | §3 `tiles.ts` row | "8×8 chunk cache with LRU 40 and build quota 4" | unchanged; add "`CHUNKS_W = ceil(w/8)`" |
| 68 | [[architecture-modules-ui-assets]] | screens / loading row | no generation-wait state | `Carving the cave…` loading view on `ui.genPending` (SAE4 §1.9) |
| 69 | [[architecture-ui]] | screen list / title | – | add the loading view: text, Escape cancels, no other input |
| 70 | [[architecture-rulings]] | R-065 | `downhill(s, E: Int16Array, …)` | `E: Int32Array` |
| 71 | [[architecture-rulings]] | new rows | – | add R-rows: Int32 fields; State limit 300 KB; host bailout; `ROUTE_VISIT_MAX` + early exit; check budgets; cite SAE4 |
| 72 | [[architecture-economy-check]] | §4 FLAG + options; §7 row 7 | 160×120 limit; `BEACON_DIST_MIN` 120 | add "Resolved by [[architecture-scale-and-economy]]"; row 7 → band 510–690 |
| 73 | [[last-ember-open-questions]] | #12 | open, "160x120 map" | closed by owner decision 2026-10-18, link SAE1 |
| 74 | [[architecture]] | E-2 row + file table | open; no SAE parts | resolved; add SAE1–SAE4 rows |
| 75 | [[index]] | project file list | – | add SAE1–SAE4 |
| 76 | [[architecture-tuning-2]] | §5 `rockIntervalS` | `[0.9, 1.8]` | not a size row: delete per R-056; values → part 2 |

No other KB file under `projects/ai-jam-5/` carries a map-size number. [[architecture-assets-style]] "30 × 17 tiles visible" and render zoom are viewport-based: unchanged.

## 4. Budgets that no longer fit (resolved above)

1. State hard limit 200 KB: worst ≈ 160 KB (`ROCKS_MAX` 200, #11 caps) leaves little margin → raised to 300 KB (§1.1).
2. Rocks per-step worst 7 full BFS ≈ 8.4 ms → capped BFS + early exit, ≤ 3.0 ms (§1.5).
3. Check runtime target < 5 s → ≈ 9 s typical; new target < 15 s, hard < 30 s kept (§1.10).
4. Host catch-up during generation: 15 × 55 ms freeze → 12 ms bailout, needs owner approval for `main.ts` (§1.8).
5. Cave check 62 gens < 1 500 ms, rocks < 3 000 ms, world test 13 < 100 ms → re-set (§1.10).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-determinism]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-render]]
- [[architecture-modules-ui-assets]]
- [[architecture-ui]]
- [[architecture-economy-check]]
- [[architecture-tuning-2]]
- [[architecture-assets-style]]
- [[last-ember-open-questions]]

---
type: architecture
title: Last Ember – Cave Generation (1/4) – Terrain, Connectivity, Loops
description: Last Ember cave generator part 1 – module list and generateCave(seed) CaveResult contract, noise fill and border, 4-5 cellular automata, 2-tile corridor-width guarantee, largest-region flood and rejection, entrance room and light shaft, 4-connected path BFS consistent with collision, Beacon at the farthest floor tile with carved chamber and chamber mask, loop-tunnel selection, carving and the corridor-disjoint hasAlternativeRoute check, annotated ASCII map.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-18T12:00:00Z
---

# Last Ember – Cave Generation (1/4)

Part 1 of 4. Next: [[architecture-cave-generation-2]] (side rooms `,`, veins, pickups, spawns, stats, checks), [[architecture-cave-generation-3]] (320×240 macro layout, rejection, loop constants; governs where it differs), [[architecture-cave-generation-4]] (320×240 placement, validation, fallback, tests). Hub: [[architecture]], [[index]]. Spec (governs): [[last-ember-design]] § Run structure, § Cave and zones. State (governs names): [[architecture-state]] §3–4, [[architecture-state-2]] §1, §10. Streams: [[architecture-determinism]] §2, §4. Consumers: [[architecture-world-queries]] (collision, 4-connectivity), [[architecture-rocks]] §3.3 rule 4 (chamber mask), §4.3. Values marked **DEFAULT (architect)** are architect decisions; change them freely and say why in the PR. Sketches use repo style (no semicolons, single quotes, 2-space indent). File homes: [[architecture-modules-world]] §2 governs (R-150). **Refinement of [[architecture-determinism]] §4 (not a contradiction):** loop tunnels need the entrance path field, so the tunnel pass now runs AFTER entrance placement. Tags are unchanged, so sub-stream isolation still holds. `CaveGen` there is renamed `CaveResult` and extended (superset, §1.2). Update that pass table to the order in §1.3.

## 1. Modules and contract

| File | Exports | Lines (est.) |
|---|---|---|
| `src/world/generate.ts` | `caveSeed`, `carveCore`, `generateCave`, attempt loop (types from core, R-150) | 140 |
| `src/world/gen/carve.ts` | leaf (R-150): `MAP_BORDER`, `isEdge`, `carveDisc`, `TUN_W`, `brush`, `carveTunnel` | 60 |
| `src/world/gen/ca.ts` | `noiseFill`, `smooth`, `widen`, `fixDiagonals` | 100 |
| `src/world/gen/region.ts` | `largestRegion` | 60 |
| `src/world/bfs.ts` | `bfs4`, `shortestPath` (shared with `caches.ts`, §7) | 70 |
| `src/world/gen/places.ts` | `placeEntrance`, `placeBeacon`, `beaconRoomMask` | 110 |
| `src/world/gen/loops.ts` | `pickLoopPairs`, `dilate`, `reopen`, `hasAlternativeRoute` | 160 |
| `src/world/gen/macro.ts` | `buildMacro`, `carveSpine`, `macroCellOf`, `MacroLayout` (tree, mask, spine; [[architecture-cave-generation-3]] §1) | 120 |

Plus `src/world/gen/populate.ts` (part 2). All files are pure: no State, no DOM, no module-level mutable data. Work grid `g: Uint8Array(w*h)`, `1` = wall, `0` = floor, `i = ty*w + tx`; it becomes the `tiles` string only at the end.

### 1.2 Contract

```ts
export type CaveStats = {
  attempts: number; floor: number; dropped: number  // fill attempts used; final floor; tiles removed by pass 4
  beaconDist: number; loops: number; tunnelTiles: number // loops = verified macro loops + tunnels, 2..3
  chamberR: number; mainLoop: boolean; fallback: boolean // chamber radius 0..3; §9.3 on E→B; §5 attempts
  ecc: number; treeDraws: number                         // macro tree eccentricity, trees drawn (part 3 §3)
}
export type CaveResult = {
  tiles: string                 // w*h chars '#' '.' ','     – passes 1–9 + part 2 (side rooms)
  entrance: TilePt; exit: TilePt // exit === entrance (state-2 §1) – pass 6
  beacon: TilePt                // farthest reachable floor   – pass 9
  beaconDist: number            // D at beacon, >= 1          – pass 9
  chamber: number[]             // beacon-room mask, ascending – pass 9 (§8)
  veins: Vein[]; pickups: Pickup[] // id 0; startRun assigns ids – part 2
  spawns: SpawnHint[]           // initial shade spots        – part 2
  stats: CaveStats              // debug overlay + checks     – all passes
  rngState: number              // 'cave:spare' state → s.rng.cave
}
export type GenOpts = { skip?: readonly ('veins' | 'pickups' | 'spawns' | 'rooms')[]; forceFail?: boolean } // test-only (R-047)
export function generateCave(seed: number, opts: GenOpts = {}): CaveResult
```

`startRun` copies `tiles`, `entrance`, `exit`, `beacon`, `beaconDist`, `veins`, `pickups` into State ([[architecture-state-2]] §10). `chamber` is not stored: it is rebuilt at runtime by the same pure function (§8). `spawns` is consumed once by `startRun`. `stats` feeds the `debug.showPaths` overlay and checks.

### 1.3 Pass order (replaces [[architecture-determinism]] §4 order)

**Superseded (2026-10-18):** order with pass 0 macro (`'cave:macro'`) and 2b spine (`'cave:spine'`) → [[architecture-cave-generation-3]] §4 ([[architecture-scale-and-economy]] §2.3). Passes 2, 4, 5, 7, 9 still draw nothing. **Monotone-carving invariant:** after pass 4 no pass turns floor into wall. Adding floor never removes a path, so connectivity and every loop verified in pass 8 stay valid to the end. Part 2 never changes solidity (`,` is floor).

## 2. Noise fill and border (pass 1)

```ts
export const MAP_BORDER = 2       // DEFAULT: rows/cols 0..1 and w-2..w-1 stay wall forever
export const FILL_WALL = 0.45     // DEFAULT (determinism §4)
export const isEdge = (x: number, y: number, w: number, h: number): boolean =>
  x < MAP_BORDER || y < MAP_BORDER || x >= w - MAP_BORDER || y >= h - MAP_BORDER
export function noiseFill(g: Uint8Array, w: number, h: number, rnd: Rnd, M: Uint8Array, p = FILL_WALL): void {
  for (let i = 0; i < w * h; i++) {
    const x = i % w, r = rnd.next()     // ALWAYS draw: draw count = w*h for any border width or mask
    g[i] = M[i] || isEdge(x, (i - x) / w, w, h) || r < p ? 1 : 0   // M = macro mask, part 3 §3.3
  }
}
```

- One `makeRnd(hashSeed(caveSeed, tag))` per attempt (R-111, [[architecture-rulings-3]]); exactly `w·h` (76 800) draws in index order, masked tiles included.
- Border 2: CA counts off-map as wall, but a 1-wide border can still erode at corners. Two forced rows keep the ring solid, match `tileAt` off-map = `'#'`, and let BFS skip bounds checks.
- 45 %: below about 0.42 the 4-5 rule makes one open hall (short paths); above about 0.50 it fragments and pass 4 drops too much. Knob: 0.47 if Beacon paths feel short on Day 4.

## 3. Cellular automata (pass 2)

Rule (DEFAULT, "4-5 rule", B5678/S45678): a wall stays wall with ≥ 4 wall neighbours of 8; a floor becomes wall with ≥ 5. Off-map counts as wall.
```ts
export const CA_ITERS = 5
export function smooth(g: Uint8Array, w: number, h: number): Uint8Array {
  let a = g, b = new Uint8Array(w * h)
  for (let it = 0; it < CA_ITERS; it++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (isEdge(x, y, w, h)) { b[i] = 1; continue }
      let n = 0                                        // edge rule above keeps x±1, y±1 in map
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += a[i + dy * w + dx]
      n -= a[i]                                        // 8 neighbours, not 9
      b[i] = n >= (a[i] ? 4 : 5) ? 1 : 0
    }
    const t = a; a = b; b = t                          // double buffer: synchronous update
  }
  return a
}
```

- **Synchronous:** in-place updates bias toward the scan direction (streaks to the lower right).
- **4-5:** speckles die in 1–2 iterations; edges round into organic blobs. Iterations 1–3 remove noise, 4–5 smooth; beyond 5 the map is near a fixed point. Cost 5 × 76 800 × 9 ≈ 3.5 M reads, ≈ 10 ms.
- **320×240 + macro:** CA feature size is about 3–8 tiles at any map size, so CA only textures the chambers; the macro tree fixes the entrance→Beacon path at D 510–690 ([[architecture-scale-and-economy]] §2, [[architecture-cave-generation-3]] §3).

## 4. Corridor-width guarantee (pass 3)

Radii ([[architecture-tuning]], [[architecture-tuning-2]], [[architecture-monsters-ai]]): player 10 px, lurker 9, stalker 14, devourer 30; tile 32 px. Player, lurker and stalker (≤ 28 px wide) fit 1 tile; the devourer (60 px) needs 2.

Decision (DEFAULT, architect): **every floor tile lies in at least one all-floor 2×2 block.** Passages are then ≥ 2 tiles wide: devourers (zones 3–4) fit, and a 1×1 rock never seals a corridor (only 2×2 rocks can, which is where loops matter).

```ts
export function widen(g: Uint8Array, w: number, h: number): void {
  for (let i = 0; i < w * h; i++) {
    if (g[i]) continue
    const x = i % w, y = (i - x) / w
    let best = -1, bestWalls = 5
    for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { // 4 blocks containing (x,y), fixed order
      const bx = x + ox, by = y + oy
      if (isEdge(bx, by, w, h) || isEdge(bx + 1, by + 1, w, h)) continue
      const j = by * w + bx, walls = g[j] + g[j + 1] + g[j + w] + g[j + w + 1]
      if (walls < bestWalls) { bestWalls = walls; best = j } // strict <: first block wins ties
    }
    if (best >= 0 && bestWalls > 0) g[best] = g[best + 1] = g[best + w] = g[best + w + 1] = 0
  }
}
```

1. One forward pass in index order. Carving only adds floor, so earlier tiles stay satisfied. The fewest-walls block keeps the CA shape. A floor tile with no valid block (only possible beside the border) is filled to wall; filling is allowed before pass 4.
2. `fixDiagonals`: every 2×2 window `.#/#.` or `#./.#` gets its top wall carved. A diagonal-only touch is a 0 px gap for `moveCircle` ([[architecture-rocks]] §4.3); removing it keeps adjacency, LOS and collision visually consistent.
3. Ceiling: two 2×2 blocks overlapping in one tile leave a 1-tile neck; devourers may stall there (no pathfinding, [[architecture-monsters-ai-2]]). `// ponytail: 2x2 cover, not a true 2-wide medial axis; dilate floor by 1 tile if devourers stall in playtests`.

## 5. Largest region and rejection (passes 4–5)

```ts
export function largestRegion(g: Uint8Array, w: number, h: number): { keep: number; dropped: number } {
  const lab = new Int32Array(w * h), q = new Int32Array(w * h)
  let best = 0, bestSize = 0, next = 1, total = 0
  for (let s = 0; s < w * h; s++) {
    if (g[s] || lab[s]) continue
    let head = 0, tail = 0
    q[tail++] = s; lab[s] = next
    while (head < tail) {                              // explicit queue: no recursion limit
      const i = q[head++]
      for (const j of [i + 1, i + w, i - 1, i - w])    // E S W N; border walls make bounds checks unneeded
        if (!g[j] && !lab[j]) { lab[j] = next; q[tail++] = j }
    }
    total += tail
    if (tail > bestSize) { bestSize = tail; best = next } // strict >: lowest-index region wins ties
    next++
  }
  for (let i = 0; i < w * h; i++) if (!g[i] && lab[i] !== best) g[i] = 1
  return { keep: bestSize, dropped: total - bestSize }
}
```

4-connected on purpose: the same connectivity as routes and collision (§7). Rejection thresholds (**superseded 2026-10-18** → [[architecture-cave-generation-3]] §5): `keep >= 16 000`; bbox ≥ 90 % of `w` and `h` + `CELL_FLOOR_MIN = 150` per macro cell; a region tile with `ty < 18` in the root cell; `loops >= 2` after pass 8; `BEACON_DIST_BAND [510, 690]` after pass 9.

**Attempts:** `MAX_ATTEMPTS = 8`. Attempt `a` reruns passes 0–9 with `caveSeed(seed, a) = a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)` (R-111); tags are fixed, every stream is `makeRnd(hashSeed(caveSeed, tag))`. The first attempt passing every row wins. If none passes, return `fallbackCave(seed)` ([[architecture-cave-generation-2]] §6, `stats.fallback = true`, R-048); `generateCave` never throws. The ≥ 99 % no-fallback rate over seeds 1..200 is a heavy-only check (`CHECK_HEAVY=1`, R-048). Cost ≈ 55 ms per attempt, ≤ 80 ms p95; expected ≈ 1.1 attempts; one attempt per `update` (chunked, [[architecture-cave-generation-3]] §7).

## 6. Entrance room and light shaft (pass 6)

1. Candidates: region floor tiles with `ty < 18` inside the root macro cell (`macroCellOf(i, w) === root`, [[architecture-cave-generation-3]] §5), index order; keep the 16 with smallest `ty` (stable sort). Pick one with `rnd.int(0, n - 1)` from `'cave:entrance'` (exactly 1 draw).
2. `carveDisc(g, w, h, e, ENTRANCE_R = 3)`: carve tiles with `dx² + dy² <= R² + R` (rounded disc), clamped to the inner area. That is a 7-wide room (224 px), wider than the 72 px shaft light diameter ×1.5.
3. Light shaft is NOT a tile feature: it is the entrance light source (`r = 72`, [[architecture-render-2]] §5.4) plus decor. No tile char is added.
4. Safe zone: part 2 places no veins or spawns within Chebyshev 6 of the entrance. `exit = entrance`.

## 7. Path-distance BFS (passes 7, 9) and connectivity agreement

```ts
// src/world/bfs.ts – the ONE BFS; caches.ts bfsField wraps it with a blocked predicate
export function bfs4(g: Uint8Array, w: number, h: number, src: number, out = new Int32Array(w * h)): Int32Array {
  out.fill(-1)
  const q = sharedQueue(w * h), n = w * h            // one module-level Int32Array, re-allocated only on size change
  let head = 0, tail = 0
  out[src] = 0; q[tail++] = src
  while (head < tail) {
    const i = q[head++], x = i % w, d = out[i] + 1
    const nb = [x + 1 < w ? i + 1 : -1, i + w < n ? i + w : -1, x > 0 ? i - 1 : -1, i >= w ? i - w : -1] // E S W N
    for (const j of nb) if (j >= 0 && !g[j] && out[j] < 0) { out[j] = d; q[tail++] = j }
  }
  return out
}
export function shortestPath(dist: Int32Array, w: number, to: number): number[] // downhill E,S,W,N to 0; [] if dist[to] < 0
```

- `Int32Array`: `w·h = 76 800 > 32 767`. Cost O(w·h), ≈ 1.2 ms. The shared queue is scratch, not state (no value survives a call), the one exception to §1 "no module-level mutable data" ([[architecture-scale-and-economy-4]] §1.2).
- **Generator = runtime:** final `D` (pass 9) MUST equal `getDepthField(s)` of [[architecture-world-queries-2]] for the same tiles; check asserts it for 20 seeds. `bfsField` delegates to `bfs4` (refinement of world-queries-2 §1: one BFS, two callers).
- **Routes = collision:** 4-connectivity on full tiles equals physical reachability for any circle with `r < 16` ([[architecture-rocks]] §4.3). After §4 there are no diagonal-only touches, so nothing looks connected that is not. Shades with `r > 16` are not covered (accepted there).

## 8. Beacon placement, chamber, mask (pass 9)

1. `D1 = bfs4(g, entrance)` after tunnels. `B1 = argmax D1`; ties: larger squared Euclidean distance to the entrance, then lower index. No draw.
2. Copy `g`, `carveDisc(copy, B1, R)` with `R = CHAMBER_R = 3` (DEFAULT); `D2 = bfs4(copy, entrance)`. Accept if `D2[B1] >= 0.92 * D1[B1]` (the chamber must not breach a thin wall into a shortcut). Else retry `R = 2, 1`; `R = 0` carves nothing and always passes.
3. Commit. `beacon = argmax D2` (same ties); `beaconDist = D2[beacon]`; `D = D2`. Every reachable tile has `D <= beaconDist` ([[architecture-scoring-and-save]] §1). At most 4 BFS runs. Why a chamber: the Beacon is a 22 px solid with a 48 px interact radius ([[architecture-assets-sprites-2]]), the 5 s hold is fought from all sides, and the escape must start clear of rubble ([[architecture-rocks-2]] §2). A corridor tip is too cramped.

```ts
export const CHAMBER_MASK_R = 5   // DEFAULT: Chebyshev tiles around the beacon
export function beaconRoomMask(g: Uint8Array, w: number, beacon: number, D: Int32Array, beaconDist: number): number[] {
  const out: number[] = [], bx = beacon % w, by = (beacon - bx) / w, R = CHAMBER_MASK_R
  for (let y = Math.max(0, by - R); y <= by + R; y++) for (let x = Math.max(0, bx - R); x <= Math.min(w - 1, bx + R); x++) {
    const i = y * w + x
    if (i < g.length && !g[i] && D[i] >= beaconDist - 2 * R) out.push(i)
  }
  return out                                           // ascending index
}
```

- The `D` clause excludes a parallel corridor behind a thin wall that is near in space but far by path.
- Runtime: `getBeaconRoom(s): Uint8Array` in `src/world/caches.ts`, key `baseKey`, built from `world.tiles`, `world.beacon`, `getDepthField(s)`, `world.beaconDist`; `isBeaconRoom(s, i) = getBeaconRoom(s)[i] === 1`. This satisfies [[architecture-rocks]] §3.3 rule 4 and replaces its Chebyshev-6 fallback. No new State field. Check: `CaveResult.chamber` equals the set bits after `startRun`.

## 9. Loop guarantee (pass 8)
Spec: 2–3 tunnels create loops; no gates or lifts; the way out stays the full way in, so a tunnel must not halve the Beacon trip.
### 9.1 Pair selection – `pickLoopPairs`
`D0 = bfs4(g, entrance)`, `Dmax = max D0`. Triangle inequality: `pathDist(u, v) >= |D0[u] - D0[v]|`, a free lower bound. Values superseded 2026-10-18 by [[architecture-cave-generation-3]] §6 (`U = 1 000`, `SPREAD 60/40`, macro-cell pair filter, guard `max(DMIN, 0.95 Dmax0)`, 2 macro loops + `rnd.int(0, 1)` tunnels); the steps stay:

1. Pool: floor with `D0 >= 0.2 * Dmax` (the entrance fifth stays a simple descent). Draw `U` tiles `u` with `rnd.int` from `'cave:tunnels'` (exactly `U` draws, duplicates allowed).
2. Per `u`, scan floor `v` in the Chebyshev ring `3..TUN_MAX = 12` with `D0[v] >= 0.2 * Dmax`, same or graph-adjacent macro cell. `gain = |D0[u] - D0[v]| - manhattan(u, v)`. Keep the best `v` (ties: lower index) if `gain >= GAIN_MIN = 50`. Pairs joined by open floor have `gain <= 0`, so only rock-separated pairs qualify.
3. Sort by `gain` desc, then `u` asc. Draw `k` (1 draw).
4. Greedy: skip candidates whose midpoint is within Chebyshev `SPREAD` of an accepted midpoint (loops spread over zones). Carve into a copy (§9.2); commit only if `hasAlternativeRoute(copy, u, v)` (§9.3) AND the shortcut guard hold. Stop at `k`.
5. Too few loops: relax once (`GAIN_MIN = 25`, relaxed `SPREAD`) and continue down the list. Still fewer than 2 loops in total: the attempt fails §5. Cost: 1 000 × 21² ≈ 0.44 M reads + BFS ≈ 18 ms.

### 9.2 Tunnel carving – `carveTunnel`

```ts
export const TUN_W = 2 // DEFAULT: same 2x2 brush as §4; devourers fit, one 1x1 rock never seals it
export function carveTunnel(g: Uint8Array, w: number, h: number, u: number, v: number, rnd: Rnd): number {
  let x = u % w, y = (u - x) / w, n = 0
  const tx = v % w, ty = (v - tx) / w
  while (x !== tx || y !== ty) {
    const dx = tx - x, dy = ty - y
    const useX = dy === 0 || (dx !== 0 && rnd.next() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)))
    if (useX) x += Math.sign(dx); else y += Math.sign(dy)
    n += brush(g, w, h, x, y)                          // carve x..x+1, y..y+1 inside the inner area
  }
  return n                                             // tiles carved
}
```

Every step moves toward `v`: length = `manhattan(u, v) <= 24`, always terminates, ≤ 24 draws. Probability ∝ remaining |delta| gives a jittered staircase that reads as a natural crack.

### 9.3 `hasAlternativeRoute`

```ts
// true if b is reachable from a while staying > k tiles (Chebyshev) from the shortest a→b route,
// except inside the k+1 neighbourhoods of a and b, and that alternative is >= minLen steps
export function hasAlternativeRoute(g: Uint8Array, w: number, h: number, a: number, b: number,
  k = 2, minLen = 40): boolean {
  const P = shortestPath(bfs4(g, w, h, a), w, b)
  if (P.length === 0) return false
  const blk = g.slice()
  for (const i of P) dilate(blk, w, h, i, k)           // wall every tile within Chebyshev k of P
  reopen(blk, g, w, h, a, k + 1); reopen(blk, g, w, h, b, k + 1) // restore original g near a and b
  return bfs4(blk, w, h, a)[b] >= minLen
}
```

**Node- vs edge-disjoint — decision: corridor-disjoint (node-disjoint after k-dilation, k = 2):**

- Edge-disjoint routes may share tiles; one 1×1 rock on a shared tile cuts both. Proves nothing for rocks.
- Plain node-disjoint is trivial in a 2-wide corridor: its two lanes are disjoint, yet one 2×2 rock seals both. A false loop.
- k = 2 keeps the alternative ≥ 3 tiles from the first route. A rock spans ≤ 2 tiles per axis, so no single rock touches both routes outside the endpoint zones. That is the property the escape needs ([[architecture-rocks]] guarantee I gets real choices).
- `minLen = 40` rejects tiny pillar loops; a real tunnel loop is about `gain + manhattan >= 50` long.
**Soundness:** `true` is always correct (P and the alternative are witnesses). It is incomplete: a shortest path weaving between two corridors can yield `false` (exact needs Menger/max-flow). A false negative only discards one candidate. `// ponytail: greedy one-path removal; swap for 2-unit max-flow on a k-coarsened grid if false negatives starve seeds`.

**Complexity:** 2 BFS O(w·h) + dilation O(|P|·(2k+1)²) + reopen O((2k+3)²) ≈ 154 k + 25·|P| ops at 320×240, ≈ 2.5 ms. `stats.mainLoop = hasAlternativeRoute(g, w, h, entrance, beacon)` runs once on the accepted cave (R-115; stat, not a rejection).

## 10. Annotated ASCII fragment

48×10 excerpt (illustrative, not a real seed, rows compressed). `E` entrance, `B` Beacon, `=` tunnel, `^` chamber mask. Top and bottom rows stand for the forced 2-row border.

```
################################################  rows 0-1: border (MAP_BORDER=2)
####....E....####.......#########....####....###  E: entrance room, disc R=3
#####.......####...#####....####...#######...###
######.....#####...######...===....######....###  ===: tunnel 1, 2 wide; joins two arms
#######...######...######...===...#######...####       with D0 gap > 50 (gain >= 50)
####....######...#############..#######....#####  2-wide corridors (widen, §4)
####...######....#########^^^^^^^.####....######
####...=====.....#########^^^^B^^^^......#######  B: argmax D, chamber R=3, ^ = mask
####...=====.....##########^^^^^^^.....#########  tunnel 2 closes the lower loop
################################################
```

Main route `E → left arm → bottom → B`. Both tunnels pass `hasAlternativeRoute` (k = 2): sealing either corridor with a 2×2 rock leaves the other arm open.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-determinism]]
- [[architecture-rocks]]
- [[architecture-world-queries]]
- [[architecture-cave-generation-2]]
- [[architecture-cave-generation-3]]
- [[architecture-cave-generation-4]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings-3]]
- [[architecture-modules-world]]

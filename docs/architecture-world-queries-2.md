---
type: architecture
title: Last Ember – World Queries (2/2) – Caches, Distance Fields, Invalidation, HMR, Tests
description: Last Ember shared world-query API part 2 – the derived-data cache module src/world/caches.ts (solid grid, pending mask, entrance depth field, exit distance field) with keys, invalidation, memory and HMR behaviour; pathDistAt and exitDistAt; the full-recompute-versus-incremental decision with cost numbers; and unit tests for every world query.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – World Queries (2/2)

Part 2 of 2. Previous: [[architecture-world-queries]] (grid, collision, LOS, explore, sampling). Rocks: [[architecture-rocks]], [[architecture-rocks-2]]. Generator: [[architecture-cave-generation]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]] §5 (what is NOT in State). Resource lifecycle: [[architecture-resources]].

**Naming:** [[architecture-state-3]] §5 calls the module `src/world/cache.ts`. The brief and this file use `src/world/caches.ts`. The final name is **`caches.ts`**. Fix the State-3 table when the hub is written (cosmetic rename, same contents).

## 1. `src/world/caches.ts`

Rule ([[architecture-state-3]] §5): every entry is DERIVED data plus its key. Each entry is rebuildable from State at any time, and a stale or missing entry is a miss, never a bug. Getters are the only API; nobody holds a reference across steps.

```ts
type Entry<T> = { key: string; v: T }
let solidE: Entry<Uint8Array> | null = null
let pendE: Entry<Uint8Array> | null = null
let depthE: Entry<Int32Array> | null = null
let exitE: Entry<Int32Array> | null = null
let exitBufs: [Int32Array, Int32Array] | null = null      // ping-pong, length w*h (SAE4 §1.2)
let exitFlip = 0
let emptyE: Entry<Uint8Array> | null = null

const baseKey = (s: State): string => s.meta.runId + ':' + s.world.tilesHash + ':' + s.world.w + 'x' + s.world.h

export function getSolid(s: State): Uint8Array {
  const key = baseKey(s) + ':' + s.world.solidSig
  if (solidE && solidE.key === key) return solidE.v
  const n = s.world.w * s.world.h, g = new Uint8Array(n), t = s.world.tiles
  if (t.length !== n) g.fill(1)                                   // title screen / corrupt: all solid
  else for (let i = 0; i < n; i++) g[i] = t.charCodeAt(i) === 35 ? 1 : 0   // '#'
  for (const r of s.rocks) if (r.landed) for (const i of r.tiles) g[i] = 1
  solidE = { key, v: g }
  return g
}
export function getPendingMask(s: State): Uint8Array      // key baseKey + ':' + pendingSig; 1 on !landed footprints
export function getEmptyMask(s: State): Uint8Array        // key w*h; all zero (physical-grid BFS)
export function getDepthField(s: State): Int32Array       // key baseKey; BFS from entrance over BASE tiles only
export function getExitDist(s: State): Int32Array         // key baseKey + solidSig + pendingSig; BFS from exit over solid ∪ pending
export function clearCaches(): void                       // tests only
```

The shared BFS builder `bfsField(s, start, blocked: (i) => boolean, out?: Int32Array): Int32Array` is a 4-connected flood with the E, S, W, N order. It sets `-1` for unreachable or solid cells and is O(W·H). Rules ([[architecture-scale-and-economy-4]] §1.2): (1) all path fields are `Int32Array`; (2) `bfsField` and `bfs4` reuse one module-level `Int32Array` queue of length `w·h` in `src/world/bfs.ts`, re-allocated only on a size change (no 307 KB garbage per build); (3) `getExitDist` writes into `exitBufs[exitFlip]` and flips `exitFlip`, so each rebuild returns a new instance (tests 3, 11) without allocation. ponytail: ping-pong, not a pool.

### 1.1 Keys and invalidation

| Entry | Key | Invalidated by | Rebuild cost | Size |
|---|---|---|---|---|
| solid grid | `runId:tilesHash:WxH:solidSig` | new run, rock lands | 76 800 charCode reads + ≤ 800 writes (`ROCKS_MAX` 200 × 4) ≈ 0.12 ms | 76.8 KB |
| pending mask | `runId:tilesHash:WxH:pendingSig` | commit, land, shrink, cancel | `fill(0)` + ≤ 16 writes ≈ 0.02 ms | 76.8 KB |
| empty mask | `w*h` | map size change | once | 76.8 KB |
| depth field (entrance) | `runId:tilesHash:WxH` | new run only (rocks ignored: depth is measured on the descent map) | 1 BFS ≈ 1.2 ms | 307.2 KB |
| exit field (2 ping-pong buffers) | `runId:tilesHash:WxH:solidSig:pendingSig` | new run, commit, land, shrink, cancel | 1 BFS ≈ 1.2 ms | 2 × 307.2 KB |
| shared BFS queue (`bfs.ts`) | length `w*h` | map size change | once | 307.2 KB |
| route scratch (`route.ts`) | length `w*h` | map size change | once | stamp 153.6 + queue 307.2 + dist 307.2 KB |

**Total ≈ 2.38 MB** of typed arrays outside State at 320×240 (zone and beacon-room masks included, [[architecture-scale-and-economy-4]] §1.2). That is fixed, with no growth over a run.

Why `runId` is in every key: two runs on the same seed have the same `tilesHash`, and both start at `solidSig = 0`. Without `runId`, a cache built late in run A at `solidSig = k` could match run B at `solidSig = k` with different rubble. With `runId` the false hit is impossible. DEFAULT (architect).

**Writers must bump the signatures.** `quake.ts` is the only writer of `rocks[]`, `solidSig` and `pendingSig` ([[architecture-state-3]] §6). Any test that edits `rocks[]` directly must bump them too, or call `clearCaches()`.

### 1.2 Exit field: incremental vs full recompute — decision: **FULL recompute, lazily on first read**

| Option | Cost per change | Code | Risk |
|---|---|---|---|
| Full BFS from the exit | 76 800 cells ≈ 1.2 ms | 0 extra (shared `bfsField`) | none |
| Incremental "decrease" (rubble removed) | – | – | never happens: rubble is permanent |
| Incremental "increase" (cells blocked, e.g. dynamic SSSP / LPA*-style repair of the affected subtree) | typically 5–30 % of the cells | 80–120 lines, subtle ordering bugs | high; a wrong field breaks the marker and the guarantee fast-accept |

Change frequency: commits plus landings ≈ 2 × rate ≤ 3.2/s, plus rare cancels. Full cost at 76 800 cells is ≤ 3.2 × 1.2 ms ≈ **3.8 ms per simulated second** (≈ 0.4 % of CPU, [[architecture-scale-and-economy-4]] §1.6). Incremental would save < 4 ms per second for 100 lines of risky code, so it is rejected (ponytail; upgrade to a bounded-radius repair only if a profile shows a rebuild > 3 ms on the target laptop). Rules: (a) coalesce — the read is lazy, so k changes before one read cost one rebuild; (b) **≤ 1 rebuild per step**: `stepQuake` reads `getExitDist` once at its end, so render never pays a rebuild; (c) ping-pong buffers (§1).

The same decision applies to the solid grid: a full copy costs 0.12 ms, so it is not patched in place.

### 1.3 HMR behaviour

1. Editing `caches.ts` or any module that imports it re-evaluates the module. All `let` entries start as `null`.
2. The first getter call after the swap rebuilds from State alone (`world.tiles`, `rocks[]`, signatures, `runId`). At most 4 rebuilds ≈ 3 ms (solid 0.12 + pending 0.02 + depth 1.2 + exit 1.2 ms), once.
3. Nothing is disposed: typed arrays are garbage-collected. There are no listeners, timers or DOM objects, so there is no `import.meta.hot.dispose` ([[architecture-resources]], "dispose hooks: none outside main.ts").
4. The scratch buffers in `route.ts` and the marker smoothing cache in `src/render/hud-exit.ts` reset the same way. The marker snaps to the target on its first frame.
5. A generator edit does not touch the current run's `tiles` ([[architecture-state]] §4), so caches stay valid; only a new run produces new keys.

## 2. Distance accessors

```ts
// entrance path distance in tiles on the BASE map (descent depth, zones, score); -1 = unreachable/solid
export const pathDistAt = (s: State, i: number): number => getDepthField(s)[i]
// escape distance to the exit in 4-steps over base + landed + pending; -1 = blocked/unreachable
export const exitDistAt = (s: State, i: number): number => getExitDist(s)[i]
```

`playerTile(s: State): number` (= `worldToTile(s.player.y) * s.world.w + worldToTile(s.player.x)`, centre tile) lives in `src/world/grid.ts`, not here (R-051; `playerSources` likewise lives in `src/world/route.ts`, R-014): `caches.ts` imports nothing from `grid.ts`, so no cycle.

Fields are `Int32Array`: `w·h = 76 800 > 32 767`, so an `Int16Array` could overflow on a long 4-path ([[architecture-scale-and-economy-4]] §1.2). `pathDistAt` serves `trackDepth` ([[architecture-scoring-and-save]] §1), zones ([[architecture-state-2]] §1) and spawn plausibility ([[architecture-monsters-ai-2]] §5). `exitDistAt` serves the rock guarantee, the exit marker and escape spawns.

**Exit field vs player on a pending tile:** pending tiles are `-1` in the exit field. Consumers that start from the player use `playerSources` and take the minimum over sources with `E >= 0` ([[architecture-rocks]] §4.2). If all sources are pending, the marker keeps its last value and planning pauses ([[architecture-rocks-2]] §4).

## 3. Per-step cost summary (all world queries)

| Query | Calls per step | Cost each | Total |
|---|---|---|---|
| `moveCircle` | ≤ 25 movers | ≤ 72 reads | < 2 000 reads |
| `revealAround` (descent) | ≤ 1 on key change | ≤ 546 reads | ≤ 546 |
| `pathDistAt` / `exitDistAt` | ≤ 30 | O(1) after the cache hit | – |
| cache key build | ≤ 60 getter calls | 1 string concat + compare | ≈ 5 µs total |
| `routeDist` | ≤ 6 (rare), usually 0 | ≤ `ROUTE_VISIT_MAX` 19 200 visited cells (capped, early exit) | ≤ 1.8 ms worst |
| field rebuild | ≤ 1 per step | 76 800 cells | ≤ 1.2 ms |

ponytail: the key is a string concat per getter call. If profiles ever show it, cache the last `(runId, tilesHash, solidSig, pendingSig)` numbers and compare those instead.

## 4. Tests — `src/checks/world.check.ts` (DOM-free, imported by `src/checks/all.ts`)

Helper `withTiles(rows: string[]): State`: `init()`, then `world.w/h` from `rows`, `tiles = rows.join('')`, `tilesHash = fnv1a(tiles)`, `runId = 1`, entrance/exit at `'E'`, which is replaced by `'.'`, `explored = new Array(ceil(n/32)).fill(0)`, `clearCaches()`.

1. **Coordinates:** `worldToTile(0) = 0`, `(31.999) = 0`, `(32) = 1`, `(-0.01) = -1`; `tileToWorld(3) = 112`; round trip `worldToTile(tileToWorld(t)) === t` for t in 0..319.
2. **`tileAt` / `isSolidTile`:** off-map (`-1, 0`), (`w, 0`), (`0, h`) → `'#'` / true; `init()` State (tiles `''`) → all solid, no throw.
3. **Rubble:** land a rock via `commitRock` + `landRock` → `isSolidTile` true on its tiles, `solidSig` +1, and `getSolid` returns a different array instance. Then reset `runId` += 1, keeping the same hash and sig → a cache miss is proven by a different instance.
4. **Neighbours:** `forN4` on the corners of a 4×3 map yields exactly 2 indices in E, S, W, N order; an interior cell yields 4.
5. **`moveCircle`:** (a) the slide example of [[architecture-systems]] §5.2 reproduces `x = 1014.0` (±1e-6) and `hitX`; (b) a 1-tile wall, player r = 10 at 420 px/s for 60 steps toward it → never overlaps, never passes; (c) a 1-tile corridor at 240 px/s with an L-turn: the player reaches the end in ≤ 2 s holding the two keys sequentially; (d) a diagonal gap `.#/#.`: pushing diagonally for 120 steps never reaches the far tile; (e) random fuzz, 2 000 moves with random `dx, dy` in ±12 px, `r` in {9, 10, 14, 30}, from free starts on a seed-1 cave → `circleHitsSolid(end) === false` every time.
6. **`lineOfSight`:** a clear row → true; a wall in between → false; endpoints solid → still true if the middle is clear; symmetry `los(a, b) === los(b, a)` for 500 random pairs on a seed-2 cave.
7. **Explored:** `markExplored` returns true then false; bit 31 and bit 0 of word 0 both set → `JSON.parse(JSON.stringify(e))` is equal; `revealAround` with R = 170 in an open 20×20 room marks exactly the tiles whose centres are within 170 px (count equals a brute-force count); a wall between → the tile behind is not marked, the wall itself is.
8. **`nearestFloor`:** inside a 3×3 solid block with floor on the east → returns the east tile; all solid → `-1`.
9. **`sampleSpawn`:** it consumes exactly `2 · tries` draws (compare `rng.gameplay` against a manual advance); every result is free (`circleHitsSolid` false), `>= outside + r` from the origin, and has `pathDistAt >= 0`.
10. **Depth field:** on the seed-1 cave, `pathDistAt(entrance) === 0`; for every floor tile `i` and every free 4-neighbour `j`, `|d[i] - d[j]| <= 1`; `beaconDist === max(d)`; rocks do not change it.
11. **Exit field:** `exitDistAt(exit) === 0`; commit a rock → its tiles are `-1` and the field instance changes; landing then cancelling keep the 1-Lipschitz property above over non-blocked tiles; a pocket sealed by a landed rock in a hand map → `-1` inside.
12. **HMR simulation:** `clearCaches()` mid-escape (after 30 landings) → every getter returns arrays deep-equal to those before the clear (copy with `.slice()` before the clear: ping-pong buffers are reused).
13. **Budget:** 200 × `getExitDist` with alternating `pendingSig` on the seed-1 cave in `< 400 ms` (≈ 1.2 ms each, [[architecture-scale-and-economy-4]] §1.10).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-world-queries]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-cave-generation]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-4]]
- [[architecture-scoring-and-save]]
- [[architecture-monsters-ai-2]]
- [[architecture-resources]]
- [[architecture-determinism]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-modules-world]]

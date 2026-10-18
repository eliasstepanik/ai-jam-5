---
type: architecture
title: Last Ember – World Queries (1/2) – Tiles, Coordinates, Solidity, Collision, LOS, Explore
description: Last Ember shared world-query API part 1 – module layout, tileAt/isSolidAt/worldToTile/tileToWorld, neighbour helpers, circle-vs-grid collision with sliding and the substep rule at sprint and roll speeds, Bresenham lineOfSight, explored bitset and the reveal rule, nearestFloor and spawn sampling, with exact signatures, costs and unit tests.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – World Queries (1/2)

Part 1 of 2. Next: [[architecture-world-queries-2]] (`src/world/caches.ts`, `pathDistAt`, `exitDistAt`, invalidation, HMR, cache tests). Rocks and the route guarantee: [[architecture-rocks]], [[architecture-rocks-2]]. Generator: [[architecture-cave-generation]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]] §3–4, [[architecture-state-2]] §1, [[architecture-state-3]] §5. Movement contract: [[architecture-systems]] §5. Explore: [[architecture-systems-4]] §1.

All functions are pure reads of State plus derived caches, except `markExplored`, `stepExplore` and `moveCircle`'s returned position. Nothing here uses randomness, except `sampleSpawn`, which takes the caller's stream. No DOM. Repo style.

## 1. Module layout

| File | Exports | Lines (est.) |
|---|---|---|
| `src/world/grid.ts` | `TILE` (re-export of `src/core/state.ts`), `worldToTile`, `tileToWorld`, `idx`, `inMap`, `tileAt`, `isSolidAt`, `isSolidTile`, `isSolidPx`, `N4`, `forN4`, `forN8`, `playerTile` (R-051) | 70 |
| `src/world/collide.ts` | `moveCircle`, `circleHitsSolid`, `circleRectOverlap` | 90 |
| `src/world/los.ts` | `lineOfSight`, `lineOfSightPx` | 40 |
| `src/world/explored.ts` | `isExplored`, `markExplored`, `revealAround` | 60 |
| `src/world/sample.ts` | `nearestFloor`, `sampleSpawn` | 70 |
| `src/world/caches.ts` | see [[architecture-world-queries-2]] §1 | 160 |
| `src/world/route.ts` | `routeDist`, `downhill`, `playerSources` (R-014), `exitHeading(s, prevAngle)` (R-059, R-151; [[architecture-rocks]] §4.4, [[architecture-rocks-2]] §6) | 150 |

`moveCircle` and `isSolidTile` were placed in `src/systems/movement.ts` by [[architecture-systems]] §5. They **move** to `src/world/collide.ts` and `src/world/grid.ts` and are defined ONLY there. `movement.ts` does NOT re-export them; every caller imports from `src/world/` (one path, R-012). Reason: monsters (`src/entities`) and rocks import them, and `world/` must not import `systems/`. Refinement, not a contradiction.

## 2. Coordinates and tiles (`grid.ts`)

```ts
import { TILE } from '../core/state.ts'                                     // 32, defined once in core
export { TILE }
export const worldToTile = (px: number): number => Math.floor(px / TILE)   // 0..w-1 on map; negative/over off map
export const tileToWorld = (t: number): number => t * TILE + TILE / 2      // centre
export const idx = (s: State, tx: number, ty: number): number => ty * s.world.w + tx
export const inMap = (s: State, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < s.world.w && ty < s.world.h
export const tileAt = (s: State, tx: number, ty: number): TileCh =>
  inMap(s, tx, ty) ? (s.world.tiles[ty * s.world.w + tx] as TileCh) : '#'
// base + landed rubble; off map = solid; title screen (tiles '') = solid everywhere
export function isSolidTile(s: State, tx: number, ty: number): boolean {
  if (!inMap(s, tx, ty)) return true
  return getSolid(s)[ty * s.world.w + tx] === 1
}
export const isSolidAt = (s: State, i: number): boolean => getSolid(s)[i] === 1   // i must be in range
export const isSolidPx = (s: State, x: number, y: number): boolean => isSolidTile(s, worldToTile(x), worldToTile(y))
export const N4: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]   // E S W N, fixed order
export function forN4(s: State, i: number, f: (j: number) => void): void {
  const w = s.world.w, x = i % w, y = (i - x) / w
  if (x + 1 < w) f(i + 1)
  if (y + 1 < s.world.h) f(i + w)
  if (x > 0) f(i - 1)
  if (y > 0) f(i - w)
}
export function forN8(s: State, i: number, f: (j: number, diag: boolean) => void): void  // E SE S SW W NW N NE, in-map only
```

Costs: all O(1). `getSolid` is a cache hit after the first call (key compare of 2 numbers). `tileAt` uses string indexing (`tiles[i]`), and `charCodeAt` is used inside caches for speed. `tileAt` is for gameplay tests (`','` side room) and debug.

**Fixed neighbour order E, S, W, N** everywhere (BFS, downhill, push-out ties): determinism and stable test expectations depend on it.

## 3. Circle-vs-grid collision (`collide.ts`)

Signature kept from [[architecture-systems]] §5:

```ts
export type MoveRes = { x: number; y: number; hitX: boolean; hitY: boolean }
export function moveCircle(s: State, x: number, y: number, dx: number, dy: number, r: number): MoveRes
export function circleHitsSolid(s: State, x: number, y: number, r: number): boolean
export function circleRectOverlap(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean
```

Algorithm: exactly [[architecture-systems]] §5.2 steps 1–4 (axis-separated move, closest-point push per overlapped solid tile, sliding from per-axis velocity zeroing). Additions:

1. **Tile range per axis pass:** `tx0 = floor((x - r) / 32) .. tx1 = floor((x + r - 1e-9) / 32)`, the same for y. For `r ≤ 16` this is ≤ 2×2 = 4 tiles. For `r = 30` (devourer) it is ≤ 3×3 = 9.
2. **Push order:** tiles in row-major order. After the loop, a second pass on the same range resolves any remaining overlap created by the first push (corner pockets). There are at most 2 passes per axis.
3. **Centre inside solid** (`d ≤ 1e-6`): push back along `-sign(d_axis)` by the penetration, and if `d_axis = 0`, toward the free 4-neighbour with the lowest index. This is unreachable in normal play because rubble landing on the player uses push-out ([[architecture-rocks-2]] §2), but it keeps the function total.

**Substep rule (tunnelling safety):** the per-substep displacement must be `≤ 0.9 r`, `n = max(1, ceil(hypot(dx, dy) / (0.9 * r)))`. The thinnest obstacle is one tile (32 px). A circle tunnels only if a single substep jumps over `32 + 2r` px, so `0.9 r` is very conservative. It is kept because it also bounds the push depth, so pushes never resolve to the wrong side.

| Mover | Speed | px/step at 60 Hz | `0.9 r` | Substeps |
|---|---|---|---|---|
| player walk | 120 px/s | 2.0 | 9.0 | 1 |
| player sprint (escape) | 240 px/s | 4.0 | 9.0 | 1 |
| player roll | 420 px/s (126 px / 0.3 s) | 7.0 | 9.0 | 1 |
| roll + push-out stack | ≤ 420 px/s | ≤ 7.0 | 9.0 | 1 |
| lurker lunge | 560 px/s | 9.33 | 8.1 | 2 |
| devourer | ≤ 300 px/s | ≤ 5 | 27 | 1 |

Cost: ≤ 2 substeps × 2 axes × 2 passes × 9 tile reads ≈ 72 reads per mover per step. With ≤ 25 movers that is < 2 000 reads per step.

**Invariant asserted by tests:** after `moveCircle` from a non-overlapping start, `circleHitsSolid(s, res.x, res.y, r) === false` (tolerance 1e-6 px).

## 4. Line of sight (`los.ts`)

```ts
// true if no SOLID tile lies strictly between a and b (endpoints excluded); tile indices
export function lineOfSight(s: State, a: number, b: number): boolean
export function lineOfSightPx(s: State, x0: number, y0: number, x1: number, y1: number): boolean  // tiles of the two points
```

Algorithm: integer Bresenham from `(ax, ay)` to `(bx, by)` over tile coordinates. The endpoints are skipped, and each intermediate tile is tested with `isSolidAt`. Use the symmetric variant: always iterate from the lower index to the higher, so `los(a, b) === los(b, a)` (this keeps the explored memory stable when walking back). Cost O(max(|dx|, |dy|)) ≤ 6 reads for reveal, and ≤ 320 for the longest map line (`max(w, h)` at 320×240, [[architecture-scale-and-economy-4]] §1.4).

Use: memory reveal (§5), exit-marker shortcut ([[architecture-rocks-2]] §6), spawn plausibility. Not used for gameplay hits. **Stretch:** recursive shadowcasting (8 octants) to replace per-tile Bresenham in `revealAround` once raycast wall shadows are built (spec rendering stretch goal). It gives the same API, cost O(r²) total instead of O(r³).

Known artefact: a diagonal Bresenham line passes between two diagonal wall tiles. The far tile is then marked explored even though a circle cannot pass. This is accepted for memory only (cosmetic), with a `// ponytail:` note.

## 5. Explored bitset and the REVEAL rule (`explored.ts`)

```ts
export const isExplored = (e: readonly number[], i: number): boolean => ((e[i >> 5] >>> (i & 31)) & 1) === 1
export function markExplored(e: number[], i: number): boolean   // returns true if the bit was newly set
export function revealAround(s: State, x: number, y: number, R: number): number   // returns count newly set
```

`markExplored`: `const m = 1 << (i & 31), old = e[i >> 5]; if (old & m) return false; e[i >> 5] = old | m; return true` (signed int32 words, JSON-safe, [[architecture-state-2]] §1).

REVEAL rule (called by `stepExplore` of [[architecture-systems-4]] §1, which owns the skip key `world.exploreKey`):

1. `pt` = player tile. `rt = ceil(R / 32)`.
2. For `ty` in `pty - rt .. pty + rt`, `tx` in `ptx - rt .. ptx + rt`, in map: skip if already explored; skip if `(tileToWorld(tx) - x)² + (tileToWorld(ty) - y)² > R²`.
3. Solid tiles are revealed too (walls must show in memory) if LOS reaches them: `lineOfSight(s, pt, i)` with endpoints excluded, so the wall itself is not blocking.
4. `markExplored`, count.

Cost bound: R ≤ 170 px (max light) → `rt = 6` → 169 candidates, ≤ 91 inside the circle, ≤ 6 LOS reads each = ≤ 546 reads. That is only when the key changes (≈ 7.5 times per second at sprint, ≈ 4 at walk). Already-explored tiles are skipped first, so steady state is ≈ 169 bit tests. Escape skips reveal entirely (cave fully lit).

## 6. `nearestFloor` and spawn sampling (`sample.ts`)

```ts
// nearest non-solid tile (by 4-BFS steps, ties E S W N) within maxSteps; -1 if none
export function nearestFloor(s: State, i: number, maxSteps = 8): number
export type SpawnOpts = { minPx: number; maxPx: number; r: number; tries: number; outside: number /* px, 0 = no light test */ }
export function sampleSpawn(s: State, stream: StreamName, x: number, y: number, o: SpawnOpts): { x: number; y: number } | null
```

`nearestFloor`: BFS with a local `Int32Array` queue of ≤ `(2·8+1)²` entries, through solid tiles too (used to recover from bad positions, e.g. a debug teleport). Cost ≤ 289 cells.

`sampleSpawn` (used by `findSpawn` of [[architecture-monsters-ai-2]] §5, which keeps its own reject rules):

1. Repeat `tries` (DEFAULT 12) times. Each try draws exactly 2 values from `stream` (angle, distance), so stream consumption is fixed at `2 · tries`. Remaining tries still draw: DEFAULT (architect), same reason as [[architecture-rocks]] §3.2.
2. `a = u0 · 2π`, `d = minPx + u1 · (maxPx - minPx)`, `(px, py) = (x + d cos a, y + d sin a)`.
3. Reject if `circleHitsSolid(s, px, py, o.r)`, or if `o.outside > 0` and `hypot(px - x, py - y) < o.outside + o.r` (outside the light radius `R`, which the caller passes as `outside`).
4. Reject if `pathDistAt` / `exitDistAt` of the tile is `< 0` (unreachable pocket, [[architecture-world-queries-2]] §3).
5. First survivor wins. The result is the floating position, kept as is (no tile snap).

Cost ≤ 12 × (9 tile reads + 1 field read).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-world-queries-2]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-cave-generation]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-resources]]
- [[architecture-determinism]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[architecture-modules-world]]

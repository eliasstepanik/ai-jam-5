---
type: architecture
title: Last Ember – Module Tree – World
description: Authoritative src/world file list for Last Ember – every world module (cave generation passes, per-attempt generator API, leaf carve brushes, macro layout, BFS, loops, placement, caches, grid, collision, LOS, explored, sampling, route/exit heading, fallback template, validator) with NEW/EDIT, responsibility, exported signatures copied from the specs and rulings, allowed imports, spec section, size, owner area and slice; the acyclic import graph; the src/checks files that cover the world; and a conflicts-and-gaps table with resolutions.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-21T01:00:00Z
---

# Last Ember – Module Tree: World

Hub: [[architecture]], [[index]]. Spec (governs): [[last-ember-design]]. Siblings: [[architecture-modules-core]], [[architecture-modules-systems]], [[architecture-modules-render]], [[architecture-modules-ui-assets]].
Sources: [[architecture-cave-generation]] (CG1), [[architecture-cave-generation-2]] (CG2), [[architecture-cave-generation-3]] (CG3), [[architecture-cave-generation-4]] (CG4), [[architecture-rocks]] (R1), [[architecture-rocks-2]] (R2), [[architecture-world-queries]] (WQ1), [[architecture-world-queries-2]] (WQ2), [[architecture-scale-and-economy]] (SAE1), [[architecture-scale-and-economy-2]] (SAE2), [[architecture-scale-and-economy-4]] (SAE4); rulings [[architecture-rulings]], [[architecture-rulings-2]], [[architecture-rulings-3]] win over this file. Review applied 2026-10-18: [[last-ember-review-world-vs-modules]] (24 findings; R-150 … R-153).

## 0. Layer rule (global, applied here)

L0 `src/core` (types, constants, tuning, rng, math, ids, save helpers) → L1 `src/world`, `src/assets` (data-only registry) → L2 `src/entities` → L3 `src/systems` → L4 `src/render`, `src/audio`, `src/ui` → L5 `src/game.ts` facade. `src/main.ts`, `src/merge.ts` = host. Imports go only to lower layers or the same layer, acyclic. `src/checks` imports L0–L3 only, no `document`/`window`/`import.meta.env` at import time; Node ≥ 22.18 type stripping (`.ts` import extensions, no `enum`/`namespace`/parameter properties).

World rules: pure modules, no DOM, no timers, no State-held references. Module-level `let` is allowed ONLY for derived caches/scratch that rebuild from State (WQ2 §1, §1.3; R1 §4.4). `src/world` may import from `src/core` only plus other `src/world` files. Layer violations found in the specs are listed in §5 (C9, C10, C13).

Slices: **A** = playable descent by Oct 20, **B** = escape + full generator by Oct 22, **C** = polish. Owner areas: **W-gen** (generator), **W-query** (grid/collision/LOS/explore/sample), **W-cache** (caches, fields), **W-escape** (route, heading).

## 1. Query modules

| Path | St | Responsibility | Imports (allowed) | Spec | Lines | Owner | Slice |
|---|---|---|---|---|---|---|---|
| `src/world/grid.ts` | NEW | tile coords, tile/solid lookups, neighbour order, `playerTile` | core types (`State`, `TileCh`), core state (`TILE`), `./caches.ts` | WQ1 §2, WQ2 §2 (R-051) | 80 | W-query | A |
| `src/world/collide.ts` | NEW | circle-vs-grid move with slide + substeps | `./grid.ts`, core types | WQ1 §3 | 90 | W-query | A |
| `src/world/los.ts` | NEW | symmetric Bresenham LOS | `./grid.ts` | WQ1 §4 | 40 | W-query | A |
| `src/world/explored.ts` | NEW | explored bitset + reveal rule | `./grid.ts`, `./los.ts` | WQ1 §5 | 60 | W-query | A |
| `src/world/sample.ts` | NEW | nearest floor, spawn sampling (caller stream) | `./grid.ts`, `./collide.ts`, `./caches.ts`, core rng (`StreamName`) | WQ1 §6 | 70 | W-query | A |
| `src/world/caches.ts` | NEW | derived caches: solid, pending, empty, depth, exit, zone, beacon room | `./bfs.ts`, `../core/score.ts` (`depthOf`, `zoneOfDepth`, R-007), `./gen/places.ts`, core types | WQ2 §1–2, CG2 §1, CG1 §8 | 200 | W-cache | A (solid, depth), B (rest) |
| `src/world/route.ts` | NEW | escape BFS, downhill walk, player sources, exit heading | `./caches.ts`, `./grid.ts`, `./los.ts` | R1 §4.4, R2 §5–7, WQ1 §1 | 150 | W-escape | B |
| `src/world/bfs.ts` | NEW | the one grid BFS + shortest path | none | CG1 §7 | 70 | W-gen | A |

No `src/world/zones.ts` (R-007): depth/zone maths live in `src/core/score.ts` ([[architecture-modules-core]] §3.8); callers write `zoneOfDepth(depthOf(d, bd))`, no `zoneOfDist`.

Exports (signatures verbatim):

**grid.ts** (WQ1 §2): `TILE` re-exported from `src/core/state.ts` (`export { TILE } from '../core/state.ts'`; the literal 32 is defined once, in core); `worldToTile(px: number): number`; `tileToWorld(t: number): number`; `idx(s: State, tx: number, ty: number): number`; `inMap(s: State, tx: number, ty: number): boolean`; `tileAt(s: State, tx: number, ty: number): TileCh`; `isSolidTile(s: State, tx: number, ty: number): boolean`; `isSolidAt(s: State, i: number): boolean`; `isSolidPx(s: State, x: number, y: number): boolean`; `N4: readonly (readonly [number, number])[]` (E S W N); `forN4(s: State, i: number, f: (j: number) => void): void`; `forN8(s: State, i: number, f: (j: number, diag: boolean) => void): void`. Plus `playerTile(s: State): number` moved here from caches.ts (C9, R-051).

**collide.ts** (WQ1 §3): `type MoveRes = { x: number; y: number; hitX: boolean; hitY: boolean }`; `moveCircle(s: State, x: number, y: number, dx: number, dy: number, r: number): MoveRes`; `circleHitsSolid(s: State, x: number, y: number, r: number): boolean`; `circleRectOverlap(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean`. Defined only here and in `grid.ts`; every caller imports from `src/world` (R-012, no re-export from `src/systems/movement.ts`).

**los.ts** (WQ1 §4): `lineOfSight(s: State, a: number, b: number): boolean`; `lineOfSightPx(s: State, x0: number, y0: number, x1: number, y1: number): boolean`.

**explored.ts** (WQ1 §5): `isExplored(e: readonly number[], i: number): boolean`; `markExplored(e: number[], i: number): boolean`; `revealAround(s: State, x: number, y: number, R: number): number`. Caller `stepExplore` lives in systems.

**sample.ts** (WQ1 §6): `nearestFloor(s: State, i: number, maxSteps = 8): number`; `type SpawnOpts = { minPx: number; maxPx: number; r: number; tries: number; outside: number }`; `sampleSpawn(s: State, stream: StreamName, x: number, y: number, o: SpawnOpts): { x: number; y: number } | null` (exactly `2 · tries` draws).

**caches.ts** (WQ2 §1–2, CG2 §1, CG1 §8): `getSolid(s: State): Uint8Array`; `getPendingMask(s: State): Uint8Array`; `getEmptyMask(s: State): Uint8Array`; `getDepthField(s: State): Int32Array`; `getExitDist(s: State): Int32Array`; `getZoneField(s: State): Uint8Array`; `zoneAt(s: State, i: number): Zone`; `getBeaconRoom(s: State): Uint8Array`; `isBeaconRoom(s: State, i: number): boolean`; `pathDistAt(s: State, i: number): number`; `exitDistAt(s: State, i: number): number`; `clearCaches(): void` (tests; also nulls zone + beacon-room entries). Internal: `bfsField(s, start, blocked: (i) => boolean, out?: Int32Array): Int32Array` (WQ2 §1; `out` = ping-pong target) delegating to `bfs4` (CG1 §7), `baseKey(s)` = `runId:tilesHash:WxH`. `getExitDist` writes into two preallocated ping-pong buffers ([[architecture-scale-and-economy-4]] §1.2).

**route.ts** (R1 §4.4, R2 §5, §7): `routeDist(s: State, blocked: readonly number[], sources: readonly number[], pendingBlocks = true): number`; `downhill(s: State, E: Int32Array, p0: number, maxTiles: number): number[]` (R-065); `playerSources(s: State, exclude: readonly number[]): number[]` (moved from systems/rocks.ts, C10, R-014); `exitHeading(s: State, prevAngle: number): { angle: number; dist: number } | null` = R2 §6 steps 1–4 as a pure L1 function (R-059 + R-151: `prevAngle` breaks equal-descent ties; `src/ui/hud.ts` passes its smoothed angle from the resource registry `getResources().hud.exitA` (R-060; smoothing state never in a world or module `let`), the bot passes its last heading; `null` = keep the previous angle). `export const ROUTE_VISIT_MAX = 19200` (visit cap per `routeDist` call, exceeded → `-1`) plus early exit at the first tile with `0 <= E[t] < eF` ([[architecture-scale-and-economy-4]] §1.5). Scratch buffers `stamp` (`Uint16Array`), `gen`, `queue` (`Int32Array`), `dist` (`Int32Array`) are module caches.

**bfs.ts** (CG1 §7): `bfs4(g: Uint8Array, w: number, h: number, src: number, out = new Int32Array(w * h)): Int32Array`; `shortestPath(dist: Int32Array, w: number, to: number): number[]`. One module-level queue of length `w·h`, reused, re-allocated only on size change ([[architecture-scale-and-economy-4]] §1.2).

## 2. Generator modules (all W-gen; pure functions on a work grid `g: Uint8Array`, 1 = wall)

Path prefix for core from `src/world/gen/`: `../../core/`. Generator types (`CaveStats`, `CaveResult`, `GenOpts`, `CaveCore`, `SpawnHint`) live in `src/core/types.ts` (R-150, type-only, avoids a `generate` ↔ `populate`/`validate`/`fallback` type cycle); `generate.ts` re-exports them.

| Path | St | Responsibility | Imports (allowed) | Spec | Lines | Slice |
|---|---|---|---|---|---|---|
| `src/world/generate.ts` | NEW | `caveSeed`, `carveCore` (passes 0–9 of one attempt), `generateCave` (sync attempt loop for checks), `finalizeCave` (computes `stats.mainLoop` once per accepted cave, R-160), tiles string; takes a `CaveParams` (default class 3, R-164, planned) | `./gen/{macro,ca,region,places,loops,populate,fallback}.ts`, `./bfs.ts`, `./validate.ts`, core rng (`makeRnd`, `hashSeed`, `fnv1a`, `type Rnd`), core state (`MAP_W`, `MAP_H`), core types | CG1 §1–1.3, §5; CG2 §6; CG3 §4, §7; R-111 | 140 | A (passes 0–9), B (populate, fallback) |
| `src/world/gen/carve.ts` | NEW | **leaf** carving brushes: disc, 2-wide staircase tunnel, 2×2 brush; border predicate | core rng (`import type { Rnd }`) only | CG1 §2, §6.2, §9.2; R-150 | 60 | A |
| `src/world/gen/macro.ts` | NEW | macro-cell tree, floor mask (pass 0, `'cave:macro'`), spine carve (pass 2b, `'cave:spine'`), macro constants, `BEACON_DIST_BAND` | `./carve.ts`, core rng, core state (`MAP_W`, `MAP_H`) | CG3 §1–§3; SAE1 §2.2–2.3 | 140 | A |
| `src/world/gen/ca.ts` | NEW | noise fill, CA smoothing, widen, diagonal fix (passes 1–3) | `./carve.ts` (`isEdge`), core rng | CG1 §2–4 | 100 | A |
| `src/world/gen/region.ts` | NEW | largest 4-region (passes 4–5) | none | CG1 §5 | 60 | A |
| `src/world/gen/places.ts` | NEW | entrance (root-cell pool), Beacon + chamber, chamber mask (passes 6, 9) | `./carve.ts`, `./macro.ts` (`macroCellOf`), `../bfs.ts`, core rng | CG1 §6, §8; CG3 §5 | 110 | A |
| `src/world/gen/loops.ts` | NEW | macro-loop verification, loop tunnel pairs, corridor-disjoint check (pass 8) | `./carve.ts`, `./macro.ts` (`macroCellOf`, `MacroLayout`, `BEACON_DIST_BAND`), `../bfs.ts`, core rng | CG1 §9; CG3 §6 | 160 | A (`loops >= 2` is a rejection row, spec MUST) |
| `src/world/gen/pockets.ts` | NEW | pre-pass fields `wide2`, `main`, `nearMain`; dead-end pockets (depth from `T.cave.pocketDepth`, fallback ring `T.cave.fallbackPocketDepth`, R-163); dark chambers (`'cave:rooms'`) | `../../core/score.ts` (R-007), core rng/types | CG2 §2; CG4 §1 | 140 | B |
| `src/world/gen/teach.ts` | NEW | zone-1 teaching layout T1–T4, carved dark patch (`'cave:teach'`) | `./pockets.ts`, `../bfs.ts`, core rng/types | CG2 §4 | 120 | B |
| `src/world/gen/populate.ts` | NEW | per-zone quotas and count scaling, front-loading, Beacon cluster, mineral weights, spacing, ids order; widens `main` tiles that are not `wide2` after `fixDiagonals` (adds floor only, R-049 stays true, validation rule 7, R-158) | `./pockets.ts`, `./teach.ts`, `../../core/score.ts`, core rng/types/tuning | CG2 §3; CG4 §1–§3; R-158 | 190 (may pass 300 with resin, see next row) | B |
| `src/world/gen/resin.ts` | NEW, **conditional** | resin placement (Beacon cluster, chamber bundles, zone resin, front-loading) split out of `populate.ts` ONLY if `populate.ts` would pass 300 lines (planner estimate 250–320); cohesive split, no size-rule exception (R-161) | same as `populate.ts` (`./pockets.ts`, `../../core/score.ts`, core rng/types/tuning) | CG4 §1–§3; R-161 | only if needed | B |
| `src/world/gen/fallback.ts` | NEW | deterministic ring cave template from FIXED geometry (`A = 0`, six rooms at `k·60°`, no wobble, no jitter): 0 draws, tag `'cave:fallback'` only derives `cs = hashSeed(seed, 'cave:fallback')` (populate gets `a = 8`), six pockets accepted at `T.cave.fallbackPocketDepth = 5` (R-163, R-165); then populate + validate | `../bfs.ts`, `./populate.ts`, `./places.ts` (`beaconRoomMask`, R-165), `../validate.ts`, core rng/types/tuning | CG2 §6; CG4 §4; R-163, R-165 | 110 | B |
| `src/world/validate.ts` | NEW | `validateCave` invariants 1–14; takes a `CaveParams` (default class 3, R-164, planned); rule 6 cuts the line of route at 25/50/75 % (R-157) | `./bfs.ts`, `./gen/pockets.ts` (`wide2`, `main`), `./gen/places.ts` (`beaconRoomMask`, no cycle, R-165), `./gen/macro.ts` (`BEACON_DIST_BAND`), `../core/score.ts`, `../core/tuning.ts` (`T.flame.energyMax`, `T.beacon.minStartE`, `T.resin.*`), `../core/state.ts` (`MAP_W`, `MAP_H`), core types | CG2 §6.1; CG4 §5 | 190 | B |

Exports (verbatim; "call-site" = derived from a call in the spec body, no typed signature given — C14):

**generate.ts** (CG1 §1.2, §5; CG2 §0, §6; R-047, R-111, R-150): `caveSeed(seed: number, a: number): number` (= `a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)`); `carveCore(cs: number): CaveCore | null` (one attempt, passes 0–9, every stream `makeRnd(hashSeed(cs, tag))`; `null` = a rejection row of CG3 §5 failed); `generateCave(seed: number, opts: GenOpts = {}): CaveResult` (`opts.forceFail` → `fallbackCave(seed)`; will take a `CaveParams`, default class 3, R-164 planned); `finalizeCave` (new export, R-160: computes `stats.mainLoop` once per accepted cave, R-115, for both `generateCave` and the chunked game path, which does not call `generateCave`; signature is a GAP for the implementer); `MAX_ATTEMPTS = 8`. Re-exported types from core: `type CaveStats = { attempts: number; floor: number; dropped: number; beaconDist: number; loops: number; tunnelTiles: number; chamberR: number; mainLoop: boolean; fallback: boolean; ecc: number; treeDraws: number }`; `type CaveResult = { tiles: string; entrance: TilePt; exit: TilePt; beacon: TilePt; beaconDist: number; chamber: number[]; veins: Vein[]; pickups: Pickup[]; spawns: SpawnHint[]; stats: CaveStats; rngState: number }`; `type GenOpts = { skip?: readonly ('veins' | 'pickups' | 'spawns' | 'rooms')[]; forceFail?: boolean }`; `type CaveCore = { w: number; h: number; t: Uint8Array; entrance: number; beacon: number; dist: Int32Array; beaconDist: number; beaconMask: Uint8Array; chamber: number[]; stats: CaveStats }` (CG2 §0.2 with `tunnels` → `stats.loops`, R-047); `SpawnHint = { kind: MonsterKind; x: number; y: number }`. Chunked game loop (CG3 §7): `carveCore(caveSeed(seed, ui.genAttempt))` → `populate` → `validateCave`, else `fallbackCave(seed)`.

**gen/carve.ts** (leaf, R-150): `MAP_BORDER = 2`; `isEdge(x: number, y: number, w: number, h: number): boolean`; `carveDisc(g: Uint8Array, w: number, h: number, c: number, R: number): number` (`dx² + dy² <= R² + R`, inner area, tiles carved); `TUN_W = 2`; `brush(g: Uint8Array, w: number, h: number, x: number, y: number): number`; `carveTunnel(g: Uint8Array, w: number, h: number, u: number, v: number, rnd: Rnd): number`. Imports nothing from `src/world`.

**gen/macro.ts** (CG3 §1–§3, copied): `type MacroLayout = { root: number; edges: number[]; loops: [number, number][]; centre: Int32Array; depth: Int8Array; ecc: number; treeDraws: number; M: Uint8Array }`; `buildMacro(rnd: Rnd, w: number, h: number): MacroLayout` (`'cave:macro'`, draws `1 + 81 × treeDraws + 96 + 47 + loops.length`, R-110); `carveSpine(g: Uint8Array, w: number, h: number, L: MacroLayout, rnd: Rnd): number` (`'cave:spine'`); `macroCellOf(i: number, w: number): number`; constants `CELL = 40`, `MW = 8`, `MH = 6`, `CELL_INSET = 4`, `CORR_W = 8`, `CORR_OFF = 8`, `CENTRE_JIT = 6`, `ECC_MIN = 12`, `ECC_MAX = 14`, `ECC_TARGET = 13`, `TREE_TRIES = 64`, `MACRO_LOOPS = 2`, `SPINE_R = 3`, `CELL_FLOOR_MIN = 150`, `BEACON_DIST_BAND = [510, 690]` (fallback `>= 459`). `MAP_W`, `MAP_H` are re-exported from `src/core/state.ts`, never redefined.

**gen/ca.ts** (CG1 §2–4): `FILL_WALL = 0.45`; `noiseFill(g: Uint8Array, w: number, h: number, rnd: Rnd, M: Uint8Array, p = FILL_WALL): void` (always `w·h` draws); `CA_ITERS = 5`; `smooth(g: Uint8Array, w: number, h: number): Uint8Array`; `widen(g: Uint8Array, w: number, h: number): void`; `fixDiagonals` (no signature in spec, C14).

**gen/region.ts** (CG1 §5): `largestRegion(g: Uint8Array, w: number, h: number): { keep: number; dropped: number }`.

**gen/places.ts** (CG1 §6, §8): `placeEntrance`, `placeBeacon` (no signature, C14); `CHAMBER_MASK_R = 5`; `beaconRoomMask(g: Uint8Array, w: number, beacon: number, D: Int32Array, beaconDist: number): number[]`. Constants `ENTRANCE_R = 3`, `CHAMBER_R = 3`.

**gen/loops.ts** (CG1 §9, CG3 §6): `hasAlternativeRoute(g: Uint8Array, w: number, h: number, a: number, b: number, k = 2, minLen = 40): boolean`; `dilate(blk, w, h, i, k)`, `reopen(blk, g, w, h, a, k)` (call-site); `pickLoopPairs` (no signature, C14). Constants `GAIN_MIN = 50`, `SPREAD = 60` (relaxed 40), `TUN_MAX = 12`, `U = 1000`; shortcut guard `DMIN = BEACON_DIST_BAND[0]` (no second literal).

**gen/pockets.ts** (CG2 §2): `Pocket = { leaf, tiles: number[], zone, size }`; pocket depth read from `T.cave.pocketDepth` (= 10, main caves, behaviour unchanged) and `T.cave.fallbackPocketDepth` (= 5, fallback ring only) instead of a literal `POCKET_DEPTH` (R-163; keys: [[architecture-tuning]] §8); `CHAMBERS` per zone `[2, 2, 2, 2]`; field builders for `wide2`, `main`, `nearMain` (names from spec, signatures not given, C14).

**gen/teach.ts** (CG2 §4): T1–T4 placement and carved patch (no exported signature in spec, C14).

**gen/populate.ts** (CG2 §3, CG4 §1–§3): `SAFE_START = 6`; `pickSpaced(rnd: Rnd, w: number, cands: number[], n: number, gap: number, taken: number[]): number[]`; `pickMineral(rnd, z)` (call-site); `populate(core: CaveCore, cs: number, a: number, opts?: GenOpts): CaveResult | null` (`null` = failed guarantee, e.g. #14a; R-111 supersedes R-047 here, R-150). Count scaling per CG4 §1 (R-153).

**gen/fallback.ts** (CG2 §6, CG4 §4): `fallbackCave(seed: number): CaveResult` (`stats.fallback = true`; `cs = hashSeed(seed >>> 0, 'cave:fallback')`, attempt-independent; the ring is built from FIXED geometry and makes 0 draws, `populate(core, cs, 8)` for the fallback: R-163, R-165; may import `beaconRoomMask` from `gen/places.ts`).

**validate.ts** (CG2 §6.1, CG4 §5): `validateCave(res: CaveResult): { ok: boolean; why: string }` (will take a `CaveParams`, default class 3, R-164 planned; may import `beaconRoomMask` from `gen/places.ts`, R-165), rules 1–14 (w×h = `MAP_W`×`MAP_H`; rule 14 runs `distB = bfs4(…, beacon)`); `Z4_E_PER_TILE = 1.15`; `MARGIN = 15`.

Stream tags used by `src/world` (fixed per attempt, R-111 + R-152): `'cave:macro'`, `'cave:fill'`, `'cave:spine'`, `'cave:tunnels'`, `'cave:entrance'`, `'cave:rooms'`, `'cave:teach'`, `'cave:veins:' + z`, `'cave:resin'`, `'cave:plants'`, `'cave:spare'`; attempt-independent `'cave:fallback'`.

Not in `src/world` (listed for traceability): rock plan/commit/land `planRockFall(s: State): RockPlan | null`, `commitRock(s: State, plan: RockPlan): Rock`, `landRock(s: State, r: Rock): number`, `type RockPlan` → `src/systems/rocks.ts`; `stepQuake(s: State, dt: number): void` → `src/systems/quake.ts` (R2 §5; see [[architecture-modules-systems]]). Render classification `floorHash`, wall masks, decor → `src/render/mapCache.ts`, `decor.ts` (CG2 §5); exit marker drawing → `src/ui/hud.ts`, smoothing state in `getResources().hud` (R-060; no `hud-exit.ts`).

## 3. Import graph (acyclic after C9 and R-150; arrow = "is imported by")

```
core (types, state, rng, tuning, score) ──► every world file
bfs, gen/carve, gen/region              ──► (leaves inside src/world: import core only)
gen/carve ──► gen/ca, gen/macro, gen/places, gen/loops
gen/macro ──► gen/places, gen/loops, validate, generate
bfs ──► gen/places, gen/loops, gen/teach, gen/fallback, validate, caches, generate
gen/pockets ──► gen/teach ──► gen/populate ──► gen/fallback, generate
gen/pockets, gen/macro ──► validate ──► gen/fallback, generate
gen/ca, gen/region, gen/places, gen/loops ──► generate
bfs, gen/places (beaconRoomMask) ──► caches ──► grid ──► collide, los ──► explored, sample, route
gen/places (beaconRoomMask) ──► validate, gen/fallback   (R-165, no cycle: places imports only carve, macro, bfs)
```

Topological order (each file imports only earlier ones): `bfs`, `gen/carve`, `gen/region` → `gen/ca`, `gen/macro` → `gen/places`, `gen/loops`, `gen/pockets` → `gen/teach` → `gen/populate` → `validate` → `gen/fallback` → `generate`; `caches` → `grid` → `collide`, `los` → `explored`, `sample`, `route`. `gen/macro` imports neither `gen/loops` nor `gen/places`; `gen/carve` imports nothing from `src/world` (R-150). Generator types come from `src/core/types.ts`, so no type-only back edge to `generate.ts` exists. `caches.ts` must not import `grid.ts` (C9). `route.ts` must not import `src/systems` (C10). The generator never imports `caches.ts`; equality of the two BFS uses is proven by a check, not by sharing a cache (CG2 §8).

## 4. Checks covering the world

| File | Asserts | Seeds / N | Budget | Demanded by |
|---|---|---|---|---|
| `src/checks/world.check.ts` | WQ2 §4 items 1–13: coords round trip; off-map and `init` tiles solid; rubble → solid + new cache instance, `runId` miss; `forN4` order; `moveCircle` slide `x = 1014.0`, no tunnelling at 420 px/s, L-corridor at 240 px/s, diagonal gap blocked, 2 000-move fuzz r ∈ {9, 10, 14, 30}; LOS symmetry 500 pairs; explored JSON round trip + brute-force reveal count; `nearestFloor`; `sampleSpawn` draws `2·tries`; depth field 1-Lipschitz, `beaconDist = max`; exit field `-1` on pending, sealed pocket; HMR `clearCaches()` equality after 30 landings | hand maps via `withTiles`; caves seed 1, 2 | 200 × `getExitDist` < 400 ms | WQ2 §4 |
| `src/checks/cave.check.ts` | CG4 §7 tests 1–15 (test 10 compares `populate` runs on ONE shared `carveCore` result, R-159; test 15 = all 6 fallback pockets accepted on 20 seeds, R-163; owner Elias, written as chunk C4 in a fresh session, R-162): same-seed identity (1234, `parseSeed('EmberCave')`, incl. `stats.ecc`/`treeDraws`); 62 seeds valid, ≥ 50 on attempt 0, no fallback; loops (`stats.loops >= 2` + invariant 6); Beacon BFS = `beaconDist` in [510, 690]; zones monotone 1..4 (`zoneOfDepth(depthOf(d, bd))`); fallback valid (20 seeds + fixed `A = 0`), `forceFail` → fallback; placement counts by the CG4 §1 formula, rule #14, T1–T4; time budget; generator `D` = `getDepthField` and `zoneAt`; `skip: ['veins']` isolation; 11 macro layout; 12 mask draw count; 13 rejection rows; 14 loop pair filter. Plus `CaveResult.chamber` = set bits of `getBeaconRoom` after `startRun` (CG1 §8) | `0`, `1..60`, `4294967295` (62); log `ecc`, `treeDraws`, `beaconDist`, min cell floor, pockets per zone; `CHECK_HEAVY=1`: seeds 1..200, fallback ≤ 1 % (R-048) | 62 gens < 6 000 ms total, max < 200 ms ([[architecture-scale-and-economy-4]] §1.10) | CG4 §7; CG1 §7, §8 |
| `src/checks/caves.ts` | none (helper, no asserts): `caveOf(seed: number): CaveResult` memo so cave/rocks/world checks generate each seed once (SAE4 §1.10) | – | – | SAE4 §1.10 |
| `src/checks/rocks.check.ts` | R2 §7: unit cases 1–8 (corridor, loop, pocket race cancel, 2×2 shrink, damage + push-out vs roll/hurtT, diagonal gap, exit/Beacon clear zones over 1 000 plans using `isBeaconRoom` (C5), early exit + visit cap); property test (a)–(f) with independent `refReachable` oracle; determinism seed 7; end-to-end bot seed 3 with `exitHeading(s, prevAngle)`, `won` before 3 600 steps | seeds 1..12 × 150 ops (`CHECK_HEAVY=1`: 100 seeds); oracle uncapped full BFS | total < 8 000 ms (≈ 3–5 s typical) | R2 §7 |

All three `*.check.ts` export `run(): void` and are called by `src/checks/all.ts` (R-040; `src/check.ts` is not edited). They import `startRun`, `lightBeacon`, `commitRock`, `landRock` (L3) and `init()` from `src/core/state.ts` (R-010, closes C13). Combined default budget ≈ 16 s worst; `npm run check` target < 15 s, hard < 30 s ([[architecture-scale-and-economy-4]] §1.10).

## 5. Conflicts and gaps found

| Id | Side A | Side B | Wins | Exact edit |
|---|---|---|---|---|
| C1 | [[architecture-state-3]] §5 (quoted by WQ2 header): `src/world/cache.ts` | WQ2 header: `src/world/caches.ts` | `caches.ts` (WQ2 decision) | state-3 §5 table: rename `cache.ts` → `caches.ts` |
| C2 | CG2 §0.2–0.3: `CaveGen`/`CaveCore`, `carveCore(caveSeed)`, top-level `attempt`, `fallback`, `spawns: SpawnPt[]`, `beaconMask: Uint8Array`, `tunnels`; test §9.6 `{ forceFail: true }` | CG1 §1.2: `CaveResult` with `stats.attempts`, `stats.fallback`, `spawns: SpawnHint[]`, `chamber: number[]`, `stats.loops`; `GenOpts` has only `skip` | CG1 names for `CaveResult` (CG2 §0.4 defers to part 1); CG2 `SpawnPt` shape kept under name `SpawnHint`; **`CaveCore` + `carveCore(cs)` kept** as the exported per-attempt API (R-111 supersedes R-047 on this point; chunked generation needs it) | CG2 §0: `attempt` → `stats.attempts`, `fallback` → `stats.fallback`, `tunnels` → `stats.loops`; CG1 §1.2: add `forceFail?: boolean` to `GenOpts`; [[architecture-determinism]] §4: `CaveGen` → `CaveResult` |
| C3 | R2 §5 brief: `planRockFall(s, dt)` | R2 §5 decision: `planRockFall(s)` | `planRockFall(s)` (`noUnusedParameters`) | none in world; systems tree uses `planRockFall(s: State): RockPlan \| null` |
| C4 | [[architecture-systems]] §5: `moveCircle`, `isSolidTile` in `src/systems/movement.ts` | WQ1 §1: `src/world/collide.ts`, `src/world/grid.ts` | WQ1 (entities and rocks need them; L1 < L3) | systems §5: note move; no re-export from `movement.ts` (superseded by R-012: one import path, `src/world`) |
| C5 | R1 §3.3 rule 4: `isBeaconRoom(i)` else Chebyshev > 6; R2 §7 test 7 "6 of the Beacon"; CG2 §0.2 `beaconMask: Uint8Array` | CG1 §8: `beaconRoomMask(...): number[]`, runtime `getBeaconRoom(s): Uint8Array`, `isBeaconRoom(s, i)`, `CHAMBER_MASK_R = 5`, replaces fallback | CG1 | R1 §3.3 rule 4: `isBeaconRoom(s, i)` only, delete `beaconClearTiles`; R2 §7 test 7: assert `!isBeaconRoom(s, i)`; WQ2 §1: add `getBeaconRoom`, `isBeaconRoom`, `getZoneField`, `zoneAt` to the export list |
| C6 | CG1 §5: fallback = best attempt by `(loops, beaconDist)`, check ≥ 99 % no-fallback on seeds 1..200; attempt n reseeds only `'cave:fill:' + n` | CG2 §6: fallback = `fallbackCave(seed)` ring template, always valid; attempt seed `hashSeed(seed, 'cave:' + a)` for all streams; test on 62 seeds | fallback: CG2 `fallbackCave`; seeding: R-111 `caveSeed` (fill-tag reseeding retired) | CG1 §5: replace "keep the best ... `stats.fallback = true`" with "call `fallbackCave(seed)` (CG2 §6)"; move the 1..200 rate check under `CHECK_HEAVY=1` |
| C7 | CG1 §1.3: "Part 2 never changes solidity" | CG2 §4: carved dark patch turns wall into `'.'`/`','` | CG2 (adds floor only, so the monotone invariant still holds) | CG1 §1.3: "Part 2 only adds floor (teaching patch, CG2 §4); no new route to the Beacon" |
| C8 | CG1 §6.4: safe zone Chebyshev 6 around the entrance | CG2 §3.3: `dist < SAFE_START = 6` path tiles | CG2 (part 2 owns placement) | CG1 §6.4: point to CG2 §3.3 |
| C9 | WQ1 §2: `grid.ts` imports `getSolid` from `caches.ts` | WQ2 §2: `playerTile` in `caches.ts` uses `worldToTile` from `grid.ts` → cycle | acyclic layout | WQ2 §2: move `playerTile` to `grid.ts`; `caches.ts` imports nothing from `grid.ts` |
| C10 | R2 §5: `playerSources` exported from `src/systems/rocks.ts` | R2 §7 / §6: `exitHeading(s)` in `src/world/route.ts` needs the source tiles (L1 cannot import L3) | layer rule | R2 §5: move `playerSources(s: State, exclude: readonly number[]): number[]` to `src/world/route.ts`; `rocks.ts` imports it |
| C11 | CG1 §7: `bfs4` is "the ONE BFS" | R1 §4.4 `routeDist` (stamped, multi-source, early exit) is a second BFS; R2 §7 oracle a third (deliberate) | both kept: `routeDist` needs early exit and extra-blocked stamps | CG1 §7: "one full-field BFS"; `routeDist` excepted |
| C12 | CG2 §1: `depthOf`/`zoneOfDepth` "copied from [[architecture-scoring-and-save]] §1"; no file named | caches.ts + generator (L1) both need them | closed by R-007: `src/core/score.ts`; `zones.ts` not created, `zoneOfDist` not exported | none (done) |
| C13 | WQ2 §4 `withTiles` calls `init()`; AGENTS.md: `init()` lives in `src/game.ts` (L5) | checks may import L0–L3 only | closed by R-010: `init()` in `src/core/state.ts`, `game.ts` re-exports | none (done) |
| C14 | CG1 §1 lists `fixDiagonals`, `placeEntrance`, `placeBeacon`, `pickLoopPairs`; CG2 lists `pickMineral`, pocket fields, teach | no typed signatures in the specs | GAP: implementer fixes signatures in code; not invented here. Closed elsewhere: `downhill` R-065, `exitHeading` R-059/R-151, `populate`/`fallbackCave`/`carveCore` R-150, macro CG3 §1 | CG1 §1, CG2 §2–4: add typed signatures when implemented |
| C15 | CG2 §5.6: decor props (incl. stalagmite) non-blocking | [[architecture-assets-sprites-3]] §2: `prop_stalagmite` solid r = 10 | CG2 (decor not in State; making it solid needs a tiles change) | assets-sprites-3 §2: drop the solid radius, mark decor |
| C16 | R1 §1: solid grid key `tilesHash:solidSig` | WQ2 §1.1: `runId:tilesHash:WxH:solidSig` | WQ2 (runId prevents cross-run false hits) | R1 §1 rubble row: cite WQ2 key |
| C17 | CG2 §3.1 placement quotas, `T.rocks.*` (R1 §2) and validation constants | no `src/core/tuning.ts` group named for cave quotas | GAP, partly closed by [[architecture-rulings-3]] R-163: `T.cave` exists with `pocketDepth` and `fallbackPocketDepth` ([[architecture-tuning]] §8); quotas and validation constants stay gen-local DEFAULTs | core tree: `T.cave` group per tuning §8 |
| C18 | R2 §7 `CHECK_HEAVY=1` | checks have no `@types/node` stated; `process` must be read at call time, not import time | closed by R-041 (read inside `run()`) | none (done) |
| C19 | MW before 2026-10-18: import cycles macro ↔ loops ↔ places; `zones.ts`; no per-attempt API; pre-320×240 check table | CG3, CG4, R-007, R-040, R-111 | review [[last-ember-review-world-vs-modules]] | applied here; R-150 (leaf `gen/carve.ts`, generator API), R-151 (`exitHeading` `prevAngle`), R-152 (tag registry), R-153 (count rounding) |

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-core]]
- [[architecture-modules-systems]]
- [[architecture-modules-render]]
- [[architecture-modules-ui-assets]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-cave-generation-3]]
- [[architecture-cave-generation-4]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[last-ember-review-world-vs-modules]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-assets-sprites-3]]

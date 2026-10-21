---
type: architecture
title: Last Ember – Cave Generation (2/4) – Zones, Placement, Validation, Tests
description: Last Ember cave generator part 2 – zone assignment from path depth and the zone cache, dead-end pocket detection and dark chambers, per-zone placement tables for resin, plants, veins, decor and initial monsters with spacing and sub-stream tags, the zone-1 teaching layout, render classification, bounded retries with a deterministic ring-cave fallback, validateCave invariants, performance budget, cache rules and npm run check tests.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-21T01:00:00Z
---

# Last Ember – Cave Generation (2/4)

Part 2 of 4. Part 1: [[architecture-cave-generation]] (`generateCave`, `CaveResult`, CA parameters, loop tunnels, Beacon chamber mask). **320×240 rescale (2026-10-18):** [[architecture-cave-generation-3]] (macro layout, rejection) and [[architecture-cave-generation-4]] (quotas, Beacon cluster, validation #11/#13/#14, fallback, tests) govern where they differ; sources [[architecture-scale-and-economy]], [[architecture-scale-and-economy-2]], [[architecture-scale-and-economy-4]]. Hub: [[architecture]]. Spec: [[last-ember-design]] § Cave and zones. State: [[architecture-state]] §4, [[architecture-state-2]] §1–4, §10. Seeds and sub-streams: [[architecture-determinism]] §4. Depth: [[architecture-scoring-and-save]] §1. Caches: [[architecture-world-queries]], [[architecture-world-queries-2]]. Rocks: [[architecture-rocks]]. Every number is **DEFAULT (architect)** unless marked otherwise.

## 0. Assumptions about part 1 (verify when it lands)

Part 1 did not exist when this file was written. This file assumes:

1. `src/world/generate.ts` exports `caveSeed(seed: number, a: number): number`, `carveCore(cs: number): CaveCore | null` (passes 0–9) and `generateCave(seed, opts): CaveResult` (attempt loop of §6); `populate(core, cs, a, opts?)` and `fallbackCave(seed)` are exported too ([[architecture-modules-world]] §2, R-111 over R-047).
2. `CaveCore = { w: number; h: number; t: Uint8Array /* 0 '#', 1 '.', 2 ',' */; entrance: number; beacon: number; dist: Int32Array; beaconDist: number; beaconMask: Uint8Array; chamber: number[]; stats: CaveStats }` (R-047: `tunnels` → `stats.loops`; type in `src/core/types.ts`, R-150). Indices are tile indices `ty * w + tx`.
3. `CaveResult` = part 1 §1.2 (R-047): `attempt` → `stats.attempts`, `fallback` → `stats.fallback`, `spawns: SpawnHint[]` with `SpawnHint = { kind: MonsterKind; x: number; y: number }`.
4. Attempt seeding (R-111, [[architecture-rulings-3]] §1, one mechanism): `caveSeed(seed, a) = a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)` for `a ∈ 0..7`; every sub-stream of that attempt is `stream(tag) = makeRnd(hashSeed(caveSeed, tag))` with FIXED tags, so attempt 0 keeps the tag table of [[architecture-determinism]] §4 unchanged. The old `'cave:fill:' + n` suffix is retired. If part 1 differs, part 1 governs names; the algorithms here stay.

## 1. Zone assignment from depth

Definition copied from [[architecture-scoring-and-save]] §1 (governs). Home: `src/core/score.ts` (R-007; no `src/world/zones.ts`, no `zoneOfDist` export; callers write `zoneOfDepth(depthOf(d, bd))`):

```ts
export const DEPTH_MAX = 40
export function depthOf(dist: number, beaconDist: number): number {
  if (dist <= 0 || beaconDist <= 0) return 0
  return Math.floor((DEPTH_MAX * Math.min(dist, beaconDist)) / beaconDist)
}
export function zoneOfDepth(depth: number): Zone {
  return Math.min(4, 1 + Math.floor(depth / 10)) as Zone   // 0-9 -> 1, 10-19 -> 2, 20-29 -> 3, 30-40 -> 4
}
// d = -1 -> depthOf 0 -> zone 1
```

`dist` = 4-neighbour BFS steps from the entrance on the BASE tiles (rocks ignored). The generator uses `core.dist`; runtime uses `getDepthField(s)`. Both are built by the same BFS (E, S, W, N order), so they are equal (part 4 §7 test 9).

Runtime cache, added to `src/world/caches.ts` beside `getDepthField`:

```ts
let zoneE: Entry<Uint8Array> | null = null
export function getZoneField(s: State): Uint8Array {
  const key = baseKey(s)                                      // runId:tilesHash:WxH, rocks never change zones
  if (zoneE && zoneE.key === key) return zoneE.v
  const d = getDepthField(s), z = new Uint8Array(d.length), bd = s.world.beaconDist
  for (let i = 0; i < d.length; i++) z[i] = zoneOfDepth(depthOf(d[i], bd))
  zoneE = { key, v: z }
  return z
}
export const zoneAt = (s: State, i: number): Zone => getZoneField(s)[i] as Zone
```

Cost: 76 800 writes ≈ 0.2 ms, once per run. Walls and unreachable tiles read zone 1 here; render uses its own spread field (§5). `clearCaches()` also nulls `zoneE`.

## 2. Dead-end pockets and dark chambers (pass `'cave:rooms'`)

Pre-pass fields (no draws), built once per attempt on `CaveCore`:

| Field | Meaning | Cost |
|---|---|---|
| `wide2[i]` | 1 if tile `i` is in at least one all-floor 2×2 block | 4 × 76 800 reads |
| `main` | tile list entrance → Beacon: from the Beacon, step to the first E, S, W, N neighbour with `dist = d - 1`; reversed | ≤ 1 000 steps |
| `nearMain[i]` | 1 if Chebyshev distance to a `main` tile ≤ 3 | ≤ 1 000 × 49 writes |

Pocket detection:

1. **Leaves:** floor tiles `L` with `dist[L] > 0`, not in `beaconMask`, and every floor 4-neighbour `j` has `dist[j] <= dist[L]`. Scan in index order.
2. **Flood:** from `L` over floor tiles with `dist >= dist[L] - POCKET_DEPTH` (`POCKET_DEPTH = T.cave.pocketDepth = 10` for main caves, unchanged behaviour; the fallback ring uses `T.cave.fallbackPocketDepth = 5`; **amended by [[architecture-rulings-3]] R-163**, key in [[architecture-tuning]] §8). A shared `stamp: Int32Array` (stamp = leaf ordinal) bounds the work.
3. **Reject** if the flood reaches a tile with `dist > dist[L]` (bump, not a dead end), touches `main` or `beaconMask`, has size outside `12..90` tiles, or its **neck** (flood tiles with `dist = dist[L] - POCKET_DEPTH`) has more than 4 tiles.
4. **Dedupe:** a leaf already stamped by an accepted pocket is skipped. Result: `Pocket = { leaf, tiles: number[], zone: zoneOfDepth(depthOf(dist[leaf], bd)), size }` in leaf index order.

Dark chambers:

1. Stream `rnd = makeRnd(hashSeed(caveSeed, 'cave:rooms'))`.
2. Per zone 1..4, take its pockets, and choose up to `CHAMBERS[z - 1]` with `rnd.int` (remove chosen from the list). The zone-1 teaching chamber (§4) counts toward zone 1.
3. Write `t[i] = 2` (`','`) for every chosen pocket tile. Unchosen pockets stay `'.'` and become "off-path" loot candidates.
4. **Loot bundle per dark chamber** (best loot in the cave): 1 plant on its deepest wide tile, 1 resin (large in zones 3–4, else small), and the first vein of its zone on a chamber wall with `pieces = 2`. Bundles are placed by the passes of §3 in the order given there; they count toward the zone quotas.

`CHAMBERS` max per zone: **2 / 2 / 2 / 2** (zone 1 includes the teaching patch). Pockets found per zone at 320×240: to be re-measured (the 3–6 per zone of the old CA map no longer holds; logged by [[architecture-cave-generation-4]] §7 test 11).

## 3. Placement tables

### 3.1 Per-zone quotas

**Superseded 2026-10-18** → [[architecture-cave-generation-4]] §1–§3 ([[architecture-scale-and-economy-2]] §3): resin near/off-path split, front-loaded near-path resin in the first 60 % of each zone, plants 2/2/3/3, veins 10/9/8/7 at D\* 600, counts `round(density × bd/4 / 100)`, Beacon cluster 1 large + 2 small at `[bd − 28, bd − 10]` ≤ 6 from `main` (replaces the single Beacon resin). Unchanged rows:

| Item | Zone 1 | Zone 2 | Zone 3 | Zone 4 | Tag | Placement rule |
|---|---|---|---|---|---|---|
| veins (counts: part 4 §1) | | | | | `'cave:veins:<z>'` | wall with a floor 4-neighbour `stand` |
| vein pieces | 1 | 1 | 2 | 2 | – | chamber vein always 2 |
| decor props | ≤ 1 / 12 floor | same | same | same | `'decor'` (render) | §5 |
| initial monsters | 1 lurker (teaching) | 0 | 0 | 0 | `'cave:teach'` | §3.4 |

State ceilings: pickups ≤ 60, veins ≤ 80 ([[architecture-scale-and-economy-4]] §1.1).

### 3.2 Mineral weights per vein (rarer deeper)

Fewer veins per zone deeper, and the weights shift toward strontium:

| Zone | sodium | copper | strontium |
|---|---|---|---|
| 1 | 0.55 | 0.35 | 0.10 |
| 2 | 0.45 | 0.35 | 0.20 |
| 3 | 0.35 | 0.35 | 0.30 |
| 4 | 0.30 | 0.30 | 0.40 |

`pickMineral(rnd, z)`: one draw `u = rnd.next()`, cumulative compare in `MINERALS` order. Guarantee pass (no draw): if after all zones a mineral has 0 veins, the last-placed vein of the deepest zone with ≥ 2 veins is switched to it (validation needs every mineral ≥ 1).

### 3.3 Spacing and exclusions (Chebyshev tiles unless noted)

| Rule | Value |
|---|---|
| safe start: no item, vein or spawn with `dist < SAFE_START` | 6 path tiles (teaching ranges start at 7) |
| resin ↔ resin / plant ↔ plant / vein ↔ vein (wall tiles) | ≥ 10 / ≥ 12 / ≥ 4; inside the Beacon cluster ≥ 3 |
| nothing inside `beaconMask` | except the Beacon itself |
| pickups need `wide2` | "no pickups in corridors narrower than 2 tiles" |
| vein stand must be reachable floor (`dist >= 0`) | the wall tile itself is `'#'` |

### 3.4 Order and draws (deterministic)

1. Pre-pass fields (§2), no draws.
2. `'cave:rooms'`: pockets → chambers (teaching chamber chosen first, §4).
3. `'cave:teach'`: teaching resin, vein, lurker spawn (§4).
4. `'cave:veins:1'..'cave:veins:4'`: per zone, chamber veins first, then the rest. Candidates = wall tiles in index order with a floor 4-neighbour of zone `z`; `stand` = first such neighbour in E, S, W, N order.
5. `'cave:resin'`: Beacon cluster FIRST ([[architecture-cave-generation-4]] §3), then chamber bundles, then zones 1..4 large before small (near-path on front-loaded slots, part 4 §2), then ≤ 3 rule-#14b zone-4 smalls.
6. `'cave:plants'`: chambers first, zone 4 down to 1.
7. `startRun` assigns ids from `meta.nextId` in array order: `veins`, then `pickups`, then `spawns` (via `spawnMonster`).

Slot filler, shared by every pass:

```ts
// picks up to n tiles from cands (index order) with Chebyshev spacing vs taken; 24 tries per slot
export function pickSpaced(rnd: Rnd, w: number, cands: number[], n: number, gap: number, taken: number[]): number[] {
  const out: number[] = []
  for (let k = 0; k < n && cands.length > 0; k++) {
    for (let t = 0; t < 24; t++) {
      const c = cands[rnd.int(0, cands.length - 1)], cx = c % w, cy = (c - cx) / w
      if (taken.every((o) => Math.max(Math.abs(o % w - cx), Math.abs(((o - (o % w)) / w) - cy)) >= gap)) {
        out.push(c); taken.push(c); break
      }
    }
  }
  return out
}
```

A short slot is not an error; §6 validation enforces the minimums. `bob` of each pickup = one extra `rnd.next() * 2π` from the pass's own stream.

## 4. Safe start and the zone-1 teaching layout

Goal: within the first ~25 path tiles the player meets light refuel, a vein, a dark room and one shade, in that order, before the director's zone-1 spawns build up.

| Element | Placement | Fallback if no candidate |
|---|---|---|
| T1 resin (small) | `main` tile with `dist` in `[7, 11]`, `wide2`; first in `main` order drawn by `rnd.int` | widen to `[7, 20]`; `main` always has such tiles |
| T2 vein `copper`, 2 pieces | wall 4-adjacent to a `main` tile with `dist` in `[12, 20]` | any wall with a floor neighbour, `dist` in `[8, 40]`, zone 1 |
| T3 dark patch | zone-1 pocket with leaf `dist <= 40`, chosen in `'cave:rooms'` | carve (below; scan window widened to `[15, 60]` by [[architecture-rulings-3]] R-156) |
| T3 loot | 1 plant (zone-1 plant quota) | – |
| T4 lurker spawn | floor tile, all 8 neighbours floor, `dist` in `[14, 24]`, Euclid 8–16 tiles from the entrance, not on `main` | allow `main`; then `dist` in `[14, 40]` |

Copper for T2: its flame keeps the radius and widens the perfect window, so the first toss never punishes. Euclid ≥ 8 tiles keeps the lurker outside the start light (170 px + 60 px gap ≈ 7.2 tiles) and inside `despawnPx = 560` (≤ 24 path tiles ≈ ≤ 768 px straight, so also require Euclid ≤ 16 tiles = 512 px). Its `lungeCd` starts from `T.monsters.lurker.lungeCdStartS`.

**Carved dark patch** (when zone 1 has no pocket): scan `main` tiles with `dist` in `[15, 60]` in order (**amended by [[architecture-rulings-3]] R-156**: was `[15, 30]`, which passes T3 on only 29/62 seeds; `[15, 60]` is needed for the ≥ 50/62 attempt-0 rule of [[architecture-cave-generation-4]] §7 test 2); for each, try the 4 directions E, S, W, N; the 3×3 block one step beyond the wall neighbour must be all wall, and every 4-neighbour of the block except the attachment tile must be wall (no break-through, so no new shortcut). Carve the wall neighbour as `'.'` and the block as `','`; set `dist` locally by BFS from the attachment (all values ≤ 34 < `beaconDist`). The first success wins; no draw. If none succeeds, the attempt fails (§6).

Initial monsters elsewhere: **none.** Pre-placed shades in zones 2–4 would be deleted at once by the despawn rule (`!seen && dist > 560 px`, [[architecture-monsters-ai-2]]). The director spawns by zone weights ([[architecture-tuning-2]]).

## 5. Render classification (no gameplay stream)

Built in `src/render/mapCache.ts`, keyed by `tilesHash`, from `world.tiles` only:

1. **Wall mask** per `'#'` tile: bit N 1, E 2, S 4, W 8 set if that neighbour is floor (`'.'` or `','`); off-map counts as wall. Frame = mask ([[architecture-assets-sprites-2]] §2.1).
2. **Inner corners**: for corner k (0 NE, 1 SE, 2 SW, 3 NW), set if both orthogonal neighbours are wall and the diagonal is floor. Store a 4-bit value per wall.
3. **Render zone**: floors take `zoneAt`; walls take the max zone of any 8-neighbour floor, spread by an 8-neighbour BFS so interior rock gets the nearest floor's zone. Picks `tile_z<zone>_*`.
4. **Floor variant**: `v = floorHash(tx, ty, w, seed) & 15` → 0–9 → 0, 10–12 → 1, 13–14 → 2, 15 → 3.

```ts
export const floorHash = (tx: number, ty: number, w: number, seed: number): number =>
  step32((hashSeed(seed, 'floor') ^ Math.imul(ty * w + tx, 0x9e3779b1)) >>> 0)[1]
```

5. **Decor props** (`'decor'`, stateless hash per tile, never `s.rng`): candidate = floor, `wide2`, not `main`, not within 3 of a pickup, vein stand, entrance or Beacon; place if `floorHash(...'decor') % 12 === 0`. Zone sets: 1 stalagmite, bones; 2 stalagmite, bones, puddle; 3 stalagmite, roots, mushroom, puddle; 4 stalagmite, mushroom, bones. Dark chambers use `spec_chamber` decals on 1 tile in 8.
6. **Props are non-blocking in v1.** Decor is not in State ([[architecture-state-2]] §1), so it must not collide. This overrides the `prop_stalagmite` solid radius 10 in [[architecture-assets-sprites-3]] §2 (conflict flagged; making it solid needs a State/tiles change).

## 6. Failure handling

```ts
export const MAX_ATTEMPTS = 8
export function generateCave(seed: number, opts: GenOpts = {}): CaveResult {
  for (let a = 0; a < MAX_ATTEMPTS && !opts.forceFail; a++) {
    const cs = caveSeed(seed, a)                              // R-111
    const core = carveCore(cs)
    const res = core && populate(core, cs, a, opts)           // §2-§4; null on a failed guarantee
    if (res && validateCave(res).ok) return res
  }
  return fallbackCave(seed)                                    // always valid, see below
}
```

Expected: ≈ 1.1 attempts per seed, ≥ 50 of 62 test seeds on attempt 0 ([[architecture-cave-generation-4]] §7 test 2). Attempts are pure in `(seed, a)`, so the same seed always ends on the same attempt. In the game the loop is chunked, one attempt per `update` ([[architecture-cave-generation-3]] §7); `generateCave` stays the synchronous form for checks.

**Fallback ring cave** (`fallbackCave(seed)`). **Amended by [[architecture-rulings-3]] R-163, R-165:** the ring is built from FIXED geometry (`A = 0`, six rooms at `k·60°`, no wobble, no angle jitter), so it makes **0 draws** (the former "4 draws" of R-152 and the planner's 8 draws are both superseded); the tag `'cave:fallback'` (`hashSeed(seed >>> 0, 'cave:fallback')`) is used only to derive `cs`. The steps below that mention `A`, `φ` or `rnd.int` describe the superseded wobble variant and are kept as history. Steps 1, 3, 4, 6 at 320×240 → [[architecture-cave-generation-4]] §4 (centre `(160, 120)`, `rx 148`, `ry 108`, chord `y 119..121`, column 160, Beacon `(160, 222)`, accept `beaconDist >= 459`). Shape:

1. All wall `w×h`. Centre `(cx, cy)`, radii `rx`, `ry`.
2. Ring corridor: carve every tile where `q = hypot((x - cx) / rx', (y - cy) / ry')` is in `[1 - 2/ry', 1 + 2/ry']` (≈ 4 tiles wide), with `rx' = rx + A sin(3θ + φ)`, `ry' = ry + A sin(3θ + φ)`, `A = rnd.int(0, 3)`, `φ = rnd.next() * 2π`, `θ = atan2`.
3. Chord: horizontal corridor 3 tall at `y = cy - 1..cy + 1`, from the left ring to the right ring (second loop).
4. Entrance: topmost ring floor tile in column `cx`. Beacon chamber: 7×7 room centred at `(cx, cy + ry - 6)` merged into the bottom of the ring; Beacon = its max-`dist` tile (BFS, lowest index tie).
5. Six dead-end pockets: 4×4 rooms attached outward to the ring at angles `θk = k·60° + rnd.int(0, 20)°`, `k = 0..5`, each via a 2-wide, 3-long stub. They become chambers by §2. **R-163:** no wobble and no jitter (fixed `k·60°`); the six pockets are detected at `T.cave.fallbackPocketDepth = 5` (probe: 200/200 seeds at depth 4, 5, 6; 0/200 at 10 with the spec wobble).
6. Then the normal `populate` (Beacon cluster in the chamber band) + `validateCave`. **R-165 (DEFAULT, architect):** `populate` for the fallback gets `cs = hashSeed(seed, 'cave:fallback')`, `a = 8`. Distance ≈ 511 ≥ fallback floor 459. The former "retry with `A = 0`" is now the only variant (see the R-163 note above); that fixed parameter set is the test case of part 4 §7 test 6. Known leftover risk (R-163): the ring yields exactly 6 chamber plants = the rule-11 minimum, no slack; verify in chunk C2. `res.fallback = true`, logged once with `console.warn` by `startRun` (not in the pure generator).

### 6.1 `validateCave(res): { ok: boolean; why: string }` – every invariant

| # | Invariant | How |
|---|---|---|
| 1 | Size | `tiles.length === w * h === 76 800`; alphabet only `#`, `.`, `,` |
| 2 | Border | every edge tile is `'#'` |
| 3 | Connected | one BFS from the entrance reaches EVERY floor tile (no orphan regions) |
| 4 | Entrance | floor, `dist = 0`, all 8 neighbours floor (spawn space) |
| 5 | Beacon reachable | Beacon floor, `dist = beaconDist = max(dist)`, `510 <= beaconDist <= 690` (`BEACON_DIST_BAND`); fallback `459 <= beaconDist <= 690` ([[architecture-cave-generation-4]] §5) |
| 6 | Loops exist | for each `main` quarter between 20 % and 80 % of the path, block tiles within Chebyshev 2 of that segment; ≥ 1 of the 3 quarter-tests still reaches the Beacon (a real bypass, not a 2×2 cycle). **Amended by [[architecture-rulings-3]] R-157:** the line-of-route test cuts the segment at the 25 / 50 / 75 % points instead of blocking the whole segment (whole-segment reading fails 8/62 seeds, quarter-point cuts pass 62/62) |
| 7 | Corridors wide enough | every `main` tile is `wide2` (fits r = 16 movers; devourer r = 30 may brush walls, it slides). **Amended by [[architecture-rulings-3]] R-158:** `fixDiagonals` runs after `widen` in `ca.ts` and can carve lone tiles, so `populate` widens those `main` tiles (adds floor only, R-049 stays true); otherwise 4/62 seeds (19, 53, 56, 59) fail |
| 8 | Zones monotone | `zoneOfDepth(depthOf(dist, bd))` along `main` never decreases; first is 1, last is 4 |
| 9 | Items on floor | every pickup tile and vein `stand` is floor with `dist >= 0`; every vein `tile` is `'#'` 4-adjacent to its `stand`; plants on `','` |
| 10 | Spacing | all rules of §3.3, re-checked |
| 11 | Counts | resin ≥ 24, large resin ≥ 4, plants ≥ 6, veins ≥ 24, each mineral ≥ 1 vein, pickups ≤ 60, veins ≤ 80 |
| 12 | Teaching | T1–T4 present with the ranges of §4 |
| 13 | Beacon chamber | mask tiles hold no item; Beacon cluster present (3 resin, 1 large) |
| 14 | Winnable | 14a/14b with `Z4_E_PER_TILE = 1.15`, `MARGIN = 15` → [[architecture-cave-generation-4]] §5 |

## 7. Performance budget (≤ 80 ms p95 at 320×240, mid laptop, one attempt)

**Superseded 2026-10-18** → [[architecture-cave-generation-4]] §6 (phase table, ≈ 55–57 ms per attempt, worst 8 + fallback ≈ 470 ms, render tile maps 4–8 ms on the first world frame). **Chunking is built** ([[architecture-cave-generation-3]] §7): `ui.genPending` / `ui.genAttempt`, one attempt per `update`, `Carving the cave…`, pure in `(seed, attempt)`, no wall clock.

## 8. Cache rules for derived data

| Data | In State (by `startRun`) | Derived cache |
|---|---|---|
| `tiles`, `tilesHash`, `entrance`, `exit = entrance`, `beacon`, `beaconDist` | yes | – |
| `veins[]`, `pickups[]`, teaching lurker in `monsters[]`, `rng.cave` | yes | – |
| depth field | no | `getDepthField`, key `runId:tilesHash:WxH` |
| zone field | no | `getZoneField`, same key (§1) |
| solid grid | no | `getSolid`, key `+ ':' + solidSig` |
| exit field | no | `getExitDist`, key `+ solidSig + pendingSig` |
| `main`, `wide2`, pockets, Beacon mask, `attempt`, `fallback` | no (generator-local, discarded) | none; dark chambers survive as `','` tiles |
| wall masks, inner corners, render zones, floor variants, decor | no | `mapCache.ts` / `decor.ts`, key `tilesHash` |

`startRun` never primes caches from the generator's arrays (ponytail: a 1.2 ms BFS is cheaper than a second source of truth); part 4 §7 test 9 proves both BFS agree.

## 9. Tests – `src/checks/cave.check.ts` (DOM-free, `npm run check`)

**Superseded 2026-10-18** → [[architecture-cave-generation-4]] §7 (tests 1–14 at 320×240: ≥ 50 of 62 seeds on attempt 0, total < 6 000 ms, max attempt < 200 ms, log `ecc` / `treeDraws`, band 510–690, quotas by formula, rule #14, new macro, mask-draw, rejection and pair-filter tests).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-cave-generation]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-rocks]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai-2]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-cave-generation-3]]
- [[architecture-cave-generation-4]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings-3]]
- [[architecture-rulings]]
- [[architecture-modules-world]]

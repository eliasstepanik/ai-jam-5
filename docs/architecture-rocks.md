---
type: architecture
title: Last Ember – Falling Rocks and Route Guarantee (1/2) – Model, Cadence, Selection, Guarantee
description: Last Ember escape-phase falling rocks part 1 – rock model (1x1/2x2 footprints, telegraph, damage, rubble as solid mutation), cadence ramp after the Beacon, candidate selection with corridor bias and exclusion zones, and THE route guarantee (4-connected BFS with fast-accept on the cached exit field, detour cap, budgets, complexity).
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Falling Rocks and Route Guarantee (1/2)

Part 1 of 2. Next: [[architecture-rocks-2]] (landing, races, push-out, `planRockFall` API, exit marker, tests). Shared queries and caches: [[architecture-world-queries]], [[architecture-world-queries-2]]. Cave generator: [[architecture-cave-generation]]. Hub: [[architecture]]. Spec (governs): [[last-ember-design]]. State (governs names): [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. Cadence slot: [[architecture-systems-4]] §2 (that file says this file governs where they differ). Randomness: [[architecture-determinism]]. Values: [[architecture-tuning-2]] §5.

Spec contract: rocks are telegraphed by a shadow about 1 s before impact, may block paths, and **a clear route from the player to the exit must exist at all times**. Escape = always sprint (240 px/s) + roll (0.3 s, 126 px, i-frames vs bites only). Every value marked **DEFAULT (architect)** is an architect decision.

## 1. Rock model (uses `Rock` of [[architecture-state-2]] §5 unchanged)

| Aspect | Rule |
|---|---|
| Footprint | `size: 1` = 1 tile; `size: 2` = 2×2 tiles with top-left anchor `(tx, ty)`, tiles `tx..tx+1, ty..ty+1`. `tiles[]` holds the 1 or 4 indices in order TL, TR, BL, BR |
| Centre | size 1: `(tx*32 + 16, ty*32 + 16)`; size 2: `((tx+1)*32, (ty+1)*32)` (shared corner) |
| Telegraph | `t` starts at `T.escape.rockWarnS = 1.0` (**spec**), counts down; shadow circle drawn with radius `size * 16 * (0.6 + 0.4 * (1 - t))` px and alpha `0.35 + 0.45 * (1 - t)` (render only) |
| Impact | at the first step with `t <= 0` (60 steps after commit) |
| Damage area | the footprint RECT `[tx*32, (tx+size)*32) × [ty*32, (ty+size)*32)` exactly, tested circle-vs-rect with the player radius 10 px. Rationale: what hurts is exactly what becomes solid; no invisible ring |
| Damage | 1 HP (`T.rocks.damageHp = 1`), uses the hurt invulnerability (`hurtT`); roll i-frames do NOT protect (**brief**, [[architecture-systems-3]] §6) |
| Rubble | `landed = true`, footprint tiles become SOLID through the derived solid grid (key `tilesHash:solidSig`, [[architecture-world-queries-2]] §1); `world.solidSig += 1` |
| Crater/dust | cosmetic: `emit('rockLand', x, y, size)`; particles and the crack decal live in `src/render/particles.ts` (outside State) |
| Cancelled rock | removed from `rocks[]`, emits `rockLand` with `a = 0` (dust puff only, no rubble) |
| Cap | `T.escape.rocksMax = 200` LANDED rocks (`ROCKS_MAX`, [[architecture-scale-and-economy-3]] §2.1); pending telegraphs are capped separately (§2) |

State additions (additive, no version bump; add to `init()` and `DEFAULT_*`):

| Field | Type | Default | Writer | Purpose |
|---|---|---|---|---|
| `world.pendingSig` | number | `0` | `src/systems/quake.ts` | +1 on every commit, landing, shrink and cancel; cache key of the escape field (pending rocks are blocked in it) |
| `director.escapeT` | number (s) | `0` | `src/systems/quake.ts` | elapsed escape time, `+= dt` in `stepQuake`; drives the ramp |
| `Rock.shrunk` | boolean | `false` | `src/systems/quake.ts` | true if a 2×2 was shrunk to 1×1 at impact (cosmetic + test) |

`landed` rocks stay in `rocks[]` forever (cap 200). Pending rocks are those with `!landed`.

## 2. Cadence (owned by `stepQuake`, [[architecture-systems-4]] §2, refined here)

Rate in rocks/s as a function of `e = director.escapeT`:

```
rate(e) = T.rocks.rateStart + (T.rocks.rateEnd - T.rocks.rateStart) * min(1, e / T.rocks.rampS)
next quakeT = max(T.rocks.minIntervalS, randRange(s, 'gameplay', 0.75, 1.25) / rate(e))
```

| Constant (`T.rocks`, new group in `src/core/tuning.ts`) | Value | Status |
|---|---|---|
| `rateStart` / `rateEnd` | 0.6 / 1.6 rocks/s | FINAL, unchanged ([[architecture-scale-and-economy-3]] §2.1) |
| `rampS` | 80 s | FINAL ([[architecture-scale-and-economy-3]] §2.1); an escape is 80–120 s at D 510–690 (104 s at D\* 600), so the rate keeps rising to the finish |
| `minIntervalS` | 0.4 s | DEFAULT; guarantees ≤ 1 landing per step (§5 budget) |
| `retryS` | 0.25 s | DEFAULT; `quakeT` after `planRockFall` returned `null` |
| `pendingMax` | 4 | FINAL, unchanged; max simultaneous telegraphs (1.6/s × 1 s warn = 1.6 expected, 4 is headroom) |
| `p2Start` / `p2End` | 0.15 / 0.40 | DEFAULT; chance of a 2×2, ramped like `rate` |
| first rock | `quakeT = T.escape.firstRockS = 1.5` s set by `lightBeacon` | **brief**, [[architecture-systems-2]] §5 |

`T.escape.rockIntervalS` is **deleted** (rule R-056, [[architecture-rulings]]): this ramp is the only cadence. Worked: `e = 0` → mean interval 1.67 s; `e = 40` → rate 1.1/s, mean 0.91 s; `e ≥ 80` → mean 0.625 s. Expected rocks for `T ≥ rampS`: `N(T) = 1.6 T − 0.5 · 80 = 1.6 T − 40` → 88 at 80 s, 126 at 104 s (D\*), 152 at 120 s (DMAX). `ROCKS_MAX` 200 is reached only after `(200 + 40) / 1.6 = 150 s`, so it never cuts the cadence inside an 80–120 s escape ([[architecture-scale-and-economy-3]] §2.1).

## 3. Candidate selection (`src/systems/rocks.ts`, called by `planRockFall`)

Inputs: escape field `E = getExitDist(s)` (BFS distance to the exit over base solid + landed + PENDING footprints, [[architecture-world-queries-2]] §2), player sources `src = playerSources(s, [])` (§4.2), `p0` = the source with the lowest `E` (ties: lowest index).

### 3.1 Route sample

`downhill(s: State, E: Int32Array, p0: number, maxTiles: number): number[]` and `playerSources(s: State, exclude: readonly number[]): number[]` live in `src/world/route.ts` (R-065, R-014).

1. `route = downhill(s, E, p0, T.rocks.lookahead = 28)`: repeat from the current tile: pick the 4-neighbour (order E, S, W, N) with `E[n] === E[cur] - 1`; stop at the exit or after 28 tiles. `L = route.length`.
2. `fullRoute = downhill(s, E, p0, Infinity)` marked into a stamp array (used by the fast accept in §4.3). Cost O(E[p0]) ≤ a few hundred.

### 3.2 Draw exactly 8 candidates (fixed RNG consumption)

Each candidate draws exactly **5** gameplay values `u0..u4`, whether or not they are used, so the stream advances by `40` per `planRockFall` call regardless of BFS outcomes (determinism stays stable if the BFS code changes). DEFAULT (architect).

```
mode  = u0 < T.rocks.routeModeP (0.75) && L >= 6 ? 'route' : 'ambient'
route:   j = 5 + floor(u1 * (min(L - 2, 20) - 5 + 1))        // 5..20 tiles ahead (0.7–2.7 s of sprint)
         d = route[j+1] - route[j-1] as (dx, dy); perp = (-sign(dy), sign(dx)) or (0, 1) if zero
         o = round((u2 * 2 - 1) * T.rocks.lateralTiles)       // -2..2
         anchor = route[j] + o * perp
ambient: a = u1 * 2π; r = 4 + u2 * 8 tiles; anchor = p0 + round(r * (cos a, sin a))
size  = u3 < p2(e) ? 2 : 1
u4    = tie-break jitter in [0, 0.01) added to the score
```

### 3.3 Cheap filters (O(size²) each, reject on first failure)

1. Every footprint tile on the map and `!solidGrid[i]` and not in any pending footprint.
2. Every footprint tile `E[i] >= 0` (rocks only fall where the player can go; no wasted telegraphs in sealed pockets).
3. Not near the exit: Chebyshev distance from every footprint tile to `world.exit` `> T.rocks.exitClearTiles = 5` (**brief**). Since exit = entrance (spec), this also covers the entrance.
4. Not in the Beacon chamber: if [[architecture-cave-generation]] exports a chamber mask (`isBeaconRoom(i)`), use it; otherwise Chebyshev distance to `world.beacon` `> T.rocks.beaconClearTiles = 6`. DEFAULT (architect).
5. Not on the player: circle-vs-rect distance from player centre to the footprint rect `>= 10 + T.rocks.playerGapPx (16)` px. A rock is never spawned onto the player; he can only run INTO a shadow.
6. No pickup centre inside the footprint (plants still heal in escape).

### 3.4 Score and order

`score = 2 * onRoute + narrow + u4`, where `onRoute = 1` if any footprint tile is in `route`, `narrow` = number of solid 4-neighbours of the footprint tiles that are outside the footprint (0..8 for 1×1 counts max 4; 2×2 max 8, divided by 2 to normalise). This is the **corridor bias**: rocks prefer chokepoints near the route, which is where blocking is dramatic. Survivors are sorted by score descending (stable by candidate index) and tested in order by §4.

## 4. THE GUARANTEE

### 4.1 Invariant

**I:** from the player's source tiles there is a 4-connected path of free tiles to the exit tile in the grid `G = base solid ∪ landed footprints ∪ pending footprints`.

- Commit rule: a candidate is committed only if I holds in `G ∪ candidate`.
- Impact rule ([[architecture-rocks-2]] §1): at landing, I is re-checked from the player's CURRENT sources with the landing footprint solid; on failure the rock shrinks or is cancelled.
- Only landings change physical solidity, and every landing re-checks I, so a physical route exists at every step. Pending rocks are treated as blocked so that two telegraphs can never jointly cut the route (each commit was checked with the others blocked).

### 4.2 Sources and target

`playerSources(s, extra)` = every tile overlapped by the player circle (closest-point distance `< r`), at most 4, that is not solid in `G` and not in `extra`. Pending tiles under the player count as sources (he may stand in a shadow). Target = the exit tile (always free: never inside a footprint by §3.3 rule 3). If the source list is empty, I fails.

### 4.3 Connectivity: 4- vs 8-connectivity — DEFAULT (architect): **4-connected, full tiles**

- Player radius 10 px < half tile 16 px. Two edge-adjacent free tiles share a 32 px opening ≥ 20 px diameter, so every 4-connected tile path is physically walkable at sprint speed, including 1-tile corridors and L-turns (route width ≥ 1 tile holds by construction).
- Two free tiles that touch only at a corner, with both orthogonal tiles solid, have a 0 px gap: `moveCircle`'s closest-point test ([[architecture-systems]] §5.2) never lets the circle through. 8-connectivity would therefore call such a pocket "reachable" when it is not: **unsafe**. 8-connectivity with the "both orthogonals free" rule is equivalent to 4-connectivity for reachability, so it adds code for nothing.
- Conclusion: 4-connected reachability on full tiles equals physical reachability for any circle with `r < 16`. Shades (`r` up to 30) are not covered and do not need to be.

### 4.4 Algorithm — decision: **fast accept on the cached exit field, else one-directional BFS from the sources with early exit**

| Option | Typical cost | Worst | Code | Verdict |
|---|---|---|---|---|
| Full BFS from player, early exit at exit | visits ≈ all cells closer than the exit (≈ 40–100 % of reachable cave) | 76 800 cells | 25 lines | used as fallback, **with early exit by proof + visit cap** (below) |
| Bidirectional BFS | ≈ ½ of the above on open maps, less gain in corridor caves | 76 800 | +30 lines, two frontiers, meet test | rejected: gain < 2×; the cap already bounds cost |
| Recompute the exit field with the candidate blocked | always 76 800 (< 1.2 ms) | 76 800 | reuse | rejected: never early-exits |
| **Fast accept**: candidate does not touch `fullRoute` (the downhill path in the current `E`) → that path still exists in `G ∪ candidate` → I holds, detour 0 | O(size²) after O(path) setup | – | 10 lines | **CHOSEN first stage** (exact, not a heuristic) |

```ts
// src/world/route.ts — scratch buffers are module caches (derived, rebuildable), never State
let stamp = new Uint16Array(0)
let gen = 0
let queue = new Int32Array(0)
let dist = new Int32Array(0)
export const ROUTE_VISIT_MAX = 19_200   // ponytail: visit cap = old 160×120 map (≈ 0.3 ms); exceeded → -1 (conservative)

// pendingBlocks = false gives the PHYSICAL grid used at impact ([[architecture-rocks-2]] §1)
export function routeDist(s: State, blocked: readonly number[], sources: readonly number[], pendingBlocks = true): number {
  const w = s.world.w, n = w * s.world.h
  if (stamp.length !== n) { stamp = new Uint16Array(n); queue = new Int32Array(n); dist = new Int32Array(n); gen = 0 }
  gen += 2; if (gen >= 65534) { stamp.fill(0); gen = 2 }           // gen = visited, gen + 1 = extra-blocked
  const solid = getSolid(s), pend = pendingBlocks ? getPendingMask(s) : getEmptyMask(s)
  const E = getExitDist(s)
  let eF = Infinity                                                  // min E over the blocked footprint
  for (const i of blocked) { stamp[i] = gen + 1; if (E[i] >= 0 && E[i] < eF) eF = E[i] }
  const goal = s.world.exit.ty * w + s.world.exit.tx
  let head = 0, tail = 0
  for (const i of sources) if (stamp[i] !== gen + 1 && stamp[i] !== gen) { stamp[i] = gen; dist[i] = 0; queue[tail++] = i }
  while (head < tail) {
    const i = queue[head++]
    if (i === goal) return dist[i]
    if (E[i] >= 0 && E[i] < eF) return dist[i] + E[i]                // early exit by proof (below)
    if (head > ROUTE_VISIT_MAX) return -1                            // cap exceeded = not reachable
    const x = i % w
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && x === w - 1) || (k === 2 && x === 0)) continue
      const j = i + (k === 0 ? 1 : k === 1 ? w : k === 2 ? -1 : -w)
      if (j < 0 || j >= n || stamp[j] === gen || stamp[j] === gen + 1 || solid[j] || pend[j]) continue
      stamp[j] = gen; dist[j] = dist[i] + 1; queue[tail++] = j
    }
  }
  return -1
}
```

`getPendingMask(s)` is a cached `Uint8Array` of pending footprint tiles keyed by `pendingSig` ([[architecture-world-queries-2]] §1). Sources are exempt from the pending test (they are enqueued directly). The goal is checked on dequeue so `dist` is exact.

**Early exit by proof and visit cap** ([[architecture-scale-and-economy-4]] §1.5, binding). With `F = blocked` and `eF = min{E[f] : f ∈ F, E[f] >= 0}` (`+∞` if none): the first dequeued tile `t` with `E[t] >= 0 && E[t] < eF` ends the search. Proof: `E` strictly decreases along `downhill(E, t)`, every tile of `F` has `E ≥ eF > E[t]`, and `E` already blocks all pending tiles, so that route avoids `F` and every pending shadow. It holds for both `pendingBlocks` modes (a strict route is also a physical route). The result `dist[t] + E[t]` is an upper bound of the true distance, so the detour cap (§4.5) can only be stricter. `ROUTE_VISIT_MAX = 19 200` dequeued cells per call: exceeding it returns `-1`, which is conservative for every caller (plan → candidate rejected; landing → shrink → cancel; push-out → next target → cancel). Cancelling never traps the player, so the guarantee holds; only rocks whose detour needs > 19 200 visited cells (> 25 × DMAX) are lost.

### 4.5 Detour cap ("last route" rule) — DEFAULT (architect)

Openness alone allows a rock to turn a 40-tile route into a 300-tile one, which feels like a soft-lock even though it is not. Rule: `d0 = min(E[i])` over sources with `E[i] >= 0` (current route length in steps, same metric as `routeDist`; if no source has `E >= 0` because all stand on pending tiles, `d0 = routeDist(s, [], src)` and fast accept is skipped); accept only if `d1 = routeDist(...)` satisfies `d1 >= 0 && d1 - d0 <= max(T.rocks.detourMaxTiles = 12, floor(T.rocks.detourMaxFrac (0.5) * d0))`. When only one route remains, any candidate on it fails I and is rejected, so the last route is never cut; the detour cap additionally keeps an alternative route "reasonable". Fast-accepted candidates have detour 0.

### 4.6 Per-call procedure and budget

1. Return `null` if landed count `>= rocksMax` or pending count `>= pendingMax` or `src` empty.
2. Draw 8 candidates (§3.2), filter (§3.3), score and sort (§3.4).
3. For each survivor: fast accept → return it. Else if `bfsUsed < T.rocks.bfsTestsMax (3)`: `bfsUsed += 1`, run `routeDist`; pass → return it. Else skip.
4. None passed → return `null` (`stepQuake` sets `quakeT = retryS`).

Complexity ([[architecture-scale-and-economy-4]] §1.5): `routeDist` visits ≤ `ROUTE_VISIT_MAX` = 19 200 cells (capped), 4 neighbour reads each ≈ 77 k reads ≈ 0.3 ms in V8 (DEFAULT estimate; measured in the check of [[architecture-rocks-2]] §6); typical early exit within < 200 cells. Worst per call: setup O(path ≤ 1 000) + 3 capped BFS ≈ 0.9 ms; typical ≤ 0.1 ms because lateral and ambient candidates fast-accept. Amortisation: `planRockFall` runs only when `quakeT` expires (≥ 0.4 s apart) and is deferred one step when a landing in the same step already ran a BFS ([[architecture-rocks-2]] §5).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rocks-2]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-cave-generation]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning-2]]
- [[architecture-determinism]]
- [[architecture-monsters-ai-2]]
- [[architecture-rulings]]
- [[architecture-scale-and-economy-3]]
- [[architecture-scale-and-economy-4]]

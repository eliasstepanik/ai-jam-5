---
type: architecture
title: Last Ember – Falling Rocks and Route Guarantee (2/2) – Impact, Races, API, Exit Marker, Tests
description: Last Ember escape-phase falling rocks part 2 – impact re-validation with shrink/cancel, player damage and push-out, monsters under rocks, pathological cases, the planRockFall/commitRock/landRock API and stepQuake sketch, per-step budget, directional exit marker maths, P2 safe-route glow, and the exact npm run check property test.
tags: [project, ai-jam-5, architecture, last-ember, world]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Falling Rocks and Route Guarantee (2/2)

Part 2 of 2. Previous: [[architecture-rocks]] (model, cadence, selection, guarantee I, `routeDist`). Queries and caches: [[architecture-world-queries]], [[architecture-world-queries-2]]. Generator: [[architecture-cave-generation]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. Systems: [[architecture-systems]], [[architecture-systems-3]], [[architecture-systems-4]].

## 1. Impact (`landRock`) — re-validation, shrink, cancel

Why: the commit test used the player's position 1 s ago. During the telegraph the player may run THROUGH a shadow into a pocket whose only way out is that shadow. A pending tile is walkable, so this is legal. Landing it would trap him. Every landing therefore re-checks.

`routeDist(s, blocked, sources, pendingBlocks)` is the BFS of [[architecture-rocks]] §4.4 with one extra flag: `pendingBlocks = false` treats pending tiles as free (the PHYSICAL grid). Impact uses the physical grid on purpose: only landed rubble stops a body, so an unrelated pending shadow must not cancel this rock. **Failure semantics:** `routeDist` returns `-1` both for "no route" and for "visit cap `ROUTE_VISIT_MAX` = 19 200 exceeded" ([[architecture-rocks]] §4.4, [[architecture-scale-and-economy-4]] §1.5). Every caller treats `-1` the same, which is conservative: plan → reject the candidate; landing → shrink → cancel; push-out → next target → cancel. A cancel never traps the player.

Steps for rock `r` with footprint `F` (runs at the first step with `r.t <= 0`):

1. `over = circleRectOverlap(p.x, p.y, 10, rectOf(r))`.
2. **Not overlapping:** `src = playerSources(s, F)`. Fast pass: `src.some((i) => E[i] >= 0)` (E blocks all pending including `F`, so a source with `E >= 0` proves a route that avoids `F`). Else `ok = routeDist(s, F, src, false) >= 0`. ok → step 5.
3. **Overlapping (player under the rock):** apply damage (§2). Then choose a push target (§2). Found → move the player, step 5. None → step 4.
4. **Shrink / cancel:** size 2 only. Order the 4 tiles by descending distance from the player centre (ties TL, TR, BL, BR). For each tile `t` not overlapped by the player: `routeDist(s, [t], playerSources(s, [t]), false) >= 0` → shrink: `size = 1`, `tiles = [t]`, centre = tile centre, `shrunk = true`, step 5. All fail, or size 1 → **cancel**: splice `r` from `rocks[]`, `pendingSig += 1`, `emit('rockLand', r.x, r.y, 0)` (dust only). Done.
5. **Land:** `r.landed = true`, `r.hit = true`, `world.solidSig += 1`, `world.pendingSig += 1`, monsters under it (§3), `emit('rockLand', r.x, r.y, r.size)`, `addShake(s, 'rockLand', max(0, 1 - dist / 400))`.

BFS count per landing: 0 (fast pass, typical) to 6 (not overlapping: 1 + 4 shrink tries = 5; overlapping: 2 push tests + 4 shrink tries = 6). Shrink is preferred over cancel so a 2×2 still lands something visible. Damage happens before shrink/cancel, so a rock that lands on the player always hurts. The spec says the player got hit; it does not care whether the rubble stayed.

## 2. Player damage and push-out

Damage (when `over`): `landRock` calls `hurtPlayerHp(s, 'rock')` from `src/systems/combat.ts` (R-058, R-148; contract in [[architecture-systems-3]] §4.1). No inline damage code here. That function skips if `debug.god` or `p.hurtT > 0`, else applies `T.rocks.damageHp` (1), the `T.hurt.*` timers, `stats.damageTaken`, `emit('hpHit')` and `addShake(s, 'hpHit')`. `roll.invuln` is ignored (**brief**: rolls never dodge rocks). `damagePlayer(s, m)` (monster-shaped) is not used.

Push-out target, so the player can never be sealed inside or behind rubble:

1. Ring = tiles 4-adjacent to `F` and not in `F` (4 tiles for 1×1, 8 for 2×2), on the map, `!solid[i]`.
2. Sort the ring by push distance (closest point of the tile interior rect shrunk by `r = 10` to the player centre), ties by `E[i]`, then by index.
3. Pick the first with `E[i] >= 0`. If none, test at most the 2 closest with `routeDist(s, F, [i], false) >= 0` (cap exceeded = `-1` = next target, §1).
4. Move: `p.x = clamp(p.x, tx*32 + 10, tx*32 + 22)`, `p.y = clamp(p.y, ty*32 + 10, ty*32 + 22)`. The circle is now fully inside one free tile, so it overlaps nothing solid. Velocity is kept. A roll in progress keeps rolling.

Push distance is at most 32 + 10 px for 1×1, which reads as a "knocked aside" stumble. Render shows dust at the old position.

## 3. Monsters under a rock

Any monster whose circle overlaps `rectOf(r)` at landing enters `dying` (`emit('monsterDie')`). It does not count toward `stats.kills`. DEFAULT (architect): this is a cheap and readable bonus, and it avoids shades stuck inside solid rubble. Monsters never block commits and are never part of the route test.

## 4. Pathological cases (all covered by §1 and [[architecture-rocks]] §4)

| Case | Outcome |
|---|---|
| One-tile corridor is the only route | candidates on it fail BFS (`-1`) and are rejected. Off-route and behind-the-player candidates are accepted, so the corridor stays open |
| Two candidates would jointly block | the first is committed. Its tiles are pending = blocked in `G`, so the second fails its test |
| Player in a dead end off the route | sources lie in the pocket and the route runs back out. A rock at the pocket mouth fails the test. Rocks deeper in the pocket are allowed |
| Player runs through a shadow into a pocket | §1 step 2 fails → shrink or cancel |
| Player stands in a shadow at impact | damage + push-out toward the exit side |
| Player stands on two shadows, all sources have `E < 0` | `planRockFall` returns `null` (rocks pause ≤ 1 s); impact uses the physical test |
| Exit pocket | exit clear zone of 5 tiles (Chebyshev) means rocks never land near the win tile |
| Beacon chamber | excluded ([[architecture-rocks]] §3.3 rule 4), so the escape always starts with a clean exit from the chamber |
| Cap reached (`ROCKS_MAX` 200 landed; not reached inside an 80–120 s escape) | `planRockFall` returns `null`. `stepQuake` keeps `quakeT` ticking and emits a cosmetic `rockLand` with `a = 0` at a random visible floor tile. That draw uses the cosmetic stream |
| Hot swap during a telegraph | rocks live in State. Caches rebuild from `solidSig`/`pendingSig` ([[architecture-world-queries-2]] §1) |
| Win in the same step as an impact | step order: `stepQuake` (#11) runs before `checkEnd` (#16). Damage can kill → lose has priority ([[architecture-systems-4]] §3.1) |

## 5. API (`src/systems/rocks.ts`) and `stepQuake` (`src/systems/quake.ts`)

```ts
export type RockPlan = { tx: number; ty: number; size: 1 | 2; tiles: number[]; x: number; y: number }

export function planRockFall(s: State): RockPlan | null      // read-only except the gameplay stream (40 draws)
export function commitRock(s: State, plan: RockPlan): Rock    // push + pendingSig + emit('rockWarn')
export function landRock(s: State, r: Rock): number           // §1; returns BFS runs used (0..6)
// playerSources(s: State, exclude: readonly number[]): number[] lives in src/world/route.ts (R-014); rocks.ts imports it
```

**Signature decision:** the brief asked for `planRockFall(s, dt)`. Planning needs no `dt`, because cadence and timers live in `stepQuake`. An unused parameter also fails `noUnusedParameters`, so the final signature is `planRockFall(s)`. [[architecture-systems-4]] §2 wrote `planRockFall(...)`, so this is consistent with it. DEFAULT (architect).

```ts
// src/systems/quake.ts
export function stepQuake(s: State, dt: number): void {
  const d = s.director
  d.escapeT += dt
  d.quakeT -= dt
  let bfs = 0
  for (const r of s.rocks.slice()) {                 // copy: landRock may splice a cancelled rock
    if (r.landed) continue
    r.t -= dt
    if (r.t <= 0) bfs += landRock(s, r)
  }
  if (d.quakeT > 0) return
  if (bfs > 0) { d.quakeT = dt; return }             // amortise: never plan in a step that ran a landing BFS
  const plan = planRockFall(s)
  d.quakeT = plan ? nextInterval(s) : T.rocks.retryS // nextInterval = [[architecture-rocks]] §2
  if (plan) commitRock(s, plan)
}
```

`rocks.ts` holds plan, commit and land. `route.ts` holds `routeDist` and `downhill`. Each stays well under 300 lines.

**Per-step budget (worst case):** landings are at least 15 steps apart (commits are spaced ≥ `retryS` 0.25 s, and every rock has the same 1.0 s warn), so a step has at most 1 landing (≤ 6 BFS, rare) OR at most 1 plan (≤ 3 BFS). An exit-field rebuild can come on top (≤ 1 full BFS per step, lazy and coalesced, [[architecture-world-queries-2]] §1.2). Binding allowances ([[architecture-scale-and-economy-4]] §1.5): plan ≤ 3 capped BFS, landing ≤ 6 capped BFS, never both, plus ≤ 1 full exit-field rebuild of 76 800 cells. **Hard worst case: 6 × 0.3 ms (capped at `ROUTE_VISIT_MAX` 19 200 visits) + 1.2 ms ≈ 3.0 ms.** That is inside the 16.7 ms frame beside render (≈ 5 ms) and AI, and happens a few times per second at most. Typical step: 0 BFS; a typical plan or landing exits early within < 200 cells.

## 6. Directional exit marker (render-only, `src/render/hud-exit.ts`)

**Field:** `E = getExitDist(s)`, the strict field (pending tiles are blocked), so the arrow steers around live shadows as well as rubble.

**Direction along the shortest remaining route, not the straight line:**

1. `p0` = the source tile with the lowest `E >= 0`. If none exists (player inside pending shadows), keep the previous angle and distance (module cache). Stop.
2. Walk `downhill` K = 4 tiles from `p0` (`K = T.hud.exitLookTiles`, DEFAULT 4). Among equal-descent neighbours, prefer the one whose direction is closest to `prevAngle` (no flicker on diagonals), then the order E, S, W, N. Steps 1–4 are the pure L1 function `exitHeading(s: State, prevAngle: number): { angle: number; dist: number } | null` in `src/world/route.ts` (R-059, R-151): `src/ui/hud.ts` passes its smoothed angle `a` from `getResources().hud.exitA` (R-060), the bot passes its last heading; `null` = step 1 found no source.
3. Shortcut while straight is visible: from `k = K` down to 1, take the first route tile `q_k` with `lineOfSight(s, p0, q_k)` true ([[architecture-world-queries]] §4). Target point = centre of `q_k`. This removes the zig-zag of 4-connected paths.
4. `target = atan2(qy - p.y, qx - p.x)`.
5. **Smoothing** (module cache, frame-rate independent): `fdt = clamp(s.meta.time - lastTime, 0, 0.1)`, `a += wrapPi(target - a) * (1 - exp(-12 * fdt))`. A snap happens when `|wrapPi(target - a)| > 2.5` rad (the route reversed after a rock). The cache resets when `runId` changes.
6. **Distance:** `E[p0]` tiles, shown as an integer with the suffix `m`, 1 tile = 1 m. Display rule: `round` and update at most every 0.1 s, so the number does not flicker.
7. Exit on screen (inside the view rect, margin 24 px): draw a pulsing ring on the exit tile instead of the arrow ([[architecture-systems-4]] §3).

Cost per frame: 1 cached field read, ≤ 4 downhill steps, ≤ 4 LOS rays of ≤ 4 tiles each. Negligible.

**P2 – safe route glow:** draw the first 40 tiles of `downhill(E, p0)` as an additive soft dot trail. Alpha is `0.25 * (1 - k/40)` and pulses at 1.5 Hz. It is skipped when `settings`/debug disables it. Cost is 40 `drawImage` calls per frame. This is optional, after playtesting: it can make the escape too easy.

## 7. Tests — `src/checks/rocks.check.ts` (DOM-free, imported by `src/checks/all.ts`)

Reference oracle `refReachable(s, srcTiles, pendingBlocks)`: an independent 15-line BFS that builds its own grid from `world.tiles` + landed `rocks` (+ pending if asked). It shares no code with `routeDist` or the caches.

**Unit cases (hand-built `tiles` strings, 12×6 maps, via a `withTiles(s, rows)` helper):**

1. One-tile corridor `#....P....X#` style. Every candidate on the corridor between P and X → `planRockFall` never returns it. A candidate behind P → accepted.
2. Two-route loop. Commit a rock on route A. A candidate on route B is now rejected (pending blocks).
3. Pocket race. Commit a rock at the pocket mouth while the player is outside, move the player into the pocket, land the rock → cancelled (size 1) and `rocks.length` drops by 1.
4. 2×2 shrink. A 2-wide mouth, a 2×2 rock, the player inside → shrunk to the tile that keeps the route open, `shrunk === true`.
5. Player under a 1×1 → `hp` −1, player pushed, circle overlaps no solid tile, `refReachable` is true. With `roll.invuln > 0`: still −1. With `hurtT > 0`: no damage, still pushed.
6. 4-connectivity: a diagonal-only gap `.#/#.` is reported unreachable by both `routeDist` and the oracle.
7. Exit and Beacon clear zones: 1 000 plans, no footprint tile within Chebyshev 5 of the exit or 6 of the Beacon.
8. Early exit and cap ([[architecture-rocks]] §4.4): on a two-route loop, `routeDist` with a footprint on route A returns a value `>=` the oracle distance and `>= 0`, after visiting fewer cells than a full BFS; on an open 320×240 floor map with the exit at (0, 0), `blocked = [tile (3, 0)]` (so `eF = 3`) and the source at (319, 239), `routeDist` called directly returns `-1` (the cap is hit long before a tile with `E < 3`) while the oracle says reachable: cap exceeded = conservative `-1`.

**Property test (the guarantee):**

- Seeds `1..12` (`generateCave`, real 320×240 maps, 12 generations ≈ 0.7 s). Per seed: `startRun(s, String(seed))`, `lightBeacon(s)`, then 150 operations from a check-local `mulberry32(seed ^ 0x9e3779b9)` (not the gameplay stream):
  - 50 %: teleport the player to a random tile `i` with `refReachable(s, [i], false)` (it may be inside a shadow), then `planRockFall` → `commitRock` if not null.
  - 50 %: pick a random pending rock, set `t = 0`, run `landRock`.
- After EVERY operation assert:
  - (a) `refReachable(s, sources, false)` (physical route exists).
  - (b) after a commit, `refReachable(s, sources, true)` (strict I).
  - (c) the player circle overlaps no solid tile.
  - (d) landed count ≤ `ROCKS_MAX` (200) and pending count ≤ 4.
  - (e) every footprint obeys the filters.
  - (f) the JSON round trip of `rocks` is equal.
- Determinism: run seed 7 twice → `JSON.stringify(s.rocks)` and `s.rng.gameplay` are equal.
- Oracle: `refReachable` stays a full, **uncapped** 76 800-cell BFS (≈ 1–1.5 ms, independent, no early exit), run ≈ 2× per op; it must never share the cap, or a capped false `-1` would go unnoticed.
- Budget ([[architecture-scale-and-economy-4]] §1.10): 12 × 150 = 1 800 ops × (≤ 0.9 ms plan/land + ≈ 2 × 1.2 ms oracle) ≈ 2.5–4.5 s + 12 generations ≈ 0.7 s. Assert the measured total `< 8000 ms` with `performance.now()` (Node global, DOM-free). `CHECK_HEAVY=1` (read inside `run()`, R-041): 100 seeds × 150 ops (≈ 40 s), local only; CI never sets it.

**End-to-end bot:** seed 3, `debug.god = true`, escape for 3 600 steps with scripted input that steers along the marker angle (§6 steps 1–4, reused as the pure function `exitHeading(s, prevAngle)` in `src/world/route.ts`, the bot feeding back its last heading, so render and test share it). Assert `meta.screen === 'won'` before step 3 600. This proves the route is walkable by the real collision code at 240 px/s.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-rocks]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-cave-generation]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning-2]]
- [[architecture-determinism]]
- [[architecture-render]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[architecture-modules-world]]

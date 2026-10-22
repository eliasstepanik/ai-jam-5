---
type: architecture
title: Last Ember – Determinism Architecture (PRNG, Streams, Seeds)
description: Seeded PRNG for Last Ember – mulberry32 core, FNV-1a hashing, three streams (cave, gameplay, cosmetic) stored in State, tag-hashed sub-streams for stable cave generation, ?seed= parsing and sanitising, seed display and copy URL, pure functions required for property tests, and the grep check that bans Math.random in simulation code.
tags: [project, ai-jam-5, architecture, last-ember, state, determinism]
timestamp: 2026-10-22T20:00:00Z
---

# Last Ember – Determinism Architecture

Hub: [[architecture]]. State fields referenced here: [[architecture-state]] §7, [[architecture-state-2]] §8. Seed URL and end screen: [[architecture-scoring-and-save]]. Spec: [[last-ember-design]] (seed in the URL, new random seed per run).

## 1. Goals

| Goal | Guarantee |
|---|---|
| Same seed = same cave | `generateCave(seed)` is pure; same input, deep-equal output, on every browser |
| Adding a feature does not reshuffle the cave | each generation pass draws from its own tag-hashed sub-stream (§4) |
| Same seed + same input script = same run | `update` uses only State + `Input` + injected streams; check in `npm run check` (§7) |
| Cosmetics never change gameplay | cosmetic randomness has its own stream (or a stateless hash) and gameplay never reads it (§6) |
| Hot swaps keep the random sequence | stream states are plain `number`s in `s.rng`, so they survive JSON and swaps |

Determinism is "same JS engine family" determinism: only integer ops (`Math.imul`, `>>>`, `^`) feed the PRNG. Float math (`Math.sin`, `Math.hypot`) is used for movement but is deterministic for identical inputs within one browser, which is enough for replays in tests (Node) and seed sharing (the cave uses integer-only generation, §4).

## 2. Core PRNG and hash – `src/core/rng.ts`

mulberry32: 32-bit state, one `number`, period 2^32, fast, good enough for a game. DEFAULT (architect), chosen over sfc32 because its whole state is ONE uint32, which is trivial to store in State.

```ts
// Advance a mulberry32 state. Returns [nextState, uint32 output].
export function step32(a: number): [number, number] {
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [a, (t ^ (t >>> 14)) >>> 0]
}

// FNV-1a 32-bit over a string (UTF-16 code units).
export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193)
  return h >>> 0
}

// Derive an independent stream seed from (seed, tag). Final avalanche (murmur3 fmix32).
export function hashSeed(seed: number, tag: string): number {
  let h = fnv1a(tag) ^ Math.imul(seed >>> 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
```

### Stream API

Two flavours with the same algorithm:

```ts
// 1) Stored stream: state lives in s.rng[name]. Used by update().
export type StreamName = 'gameplay' | 'cosmetic'
export function rand(s: State, name: StreamName): number {          // float in [0, 1)
  const [next, out] = step32(s.rng[name])
  s.rng[name] = next
  return out / 4294967296
}
export const randRange = (s: State, n: StreamName, lo: number, hi: number): number => lo + (hi - lo) * rand(s, n)
export const randInt = (s: State, n: StreamName, lo: number, hiIncl: number): number => lo + Math.floor(rand(s, n) * (hiIncl - lo + 1))
export const chance = (s: State, n: StreamName, p: number): boolean => rand(s, n) < p
export function pick<T>(s: State, n: StreamName, xs: readonly T[]): T { return xs[randInt(s, n, 0, xs.length - 1)] }

// 2) Local stream: a closure for pure generation code (no State yet). Used by generateCave().
export type Rnd = { next: () => number; int: (lo: number, hiIncl: number) => number; state: () => number }
export function makeRnd(seed: number): Rnd {
  let a = seed >>> 0
  const next = (): number => { const r = step32(a); a = r[0]; return r[1] / 4294967296 }
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), state: () => a }
}
```

The local stream closure holds state inside ONE pure function call; it never outlives that call and is never module-level, so it does not violate the "no game state in module variables" rule.

## 3. The three streams

| Stream | Stored in | Seeded (in `startRun`) | Advanced by | Used for |
|---|---|---|---|---|
| `cave` | `s.rng.cave` (record only) | sub-streams `hashSeed(seed, 'cave:<pass>')` inside `generateCave` | only `generateCave` (pure) | walls, tunnels, entrance/Beacon choice, veins, pickups, side rooms; `s.rng.cave` stores the `'cave:spare'` sub-stream state for any LATER cave-derived gameplay draw (unused in v1; field kept so adding one does not need a version bump) |
| `gameplay` | `s.rng.gameplay` | `hashSeed(seed, 'gameplay')` | `update()` systems via `rand(s, 'gameplay')` | spawn positions, monster kinds, orbit direction, lunge timing jitter, rock positions and sizes, quake interval |
| `cosmetic` | `s.rng.cosmetic` | `hashSeed(seed, 'cosmetic')` | `update()` only, via `rand(s, 'cosmetic')` | screen-shake direction, toast text variations (eye flicker phase is derived from `monster.id` in render, no draw) (pickup `bob` is set by the generator from `'cave:resin'`/`'cave:plants'`, so it is cave data) |

Restore: nothing to restore; a hot swap keeps `s.rng` (numbers) and the next draw continues the exact sequence. Dev `R` resets to `init()` (all `0`, title screen). Title screen draws nothing.

**Render-side randomness** (particle spread, spark jitter) does NOT use a stored stream, because `render` must not write State. It uses a stateless hash: `noise(fx.seq, i) = step32(hashSeed(e.seq, 'p') + i)[1] / 2^32`, or the particle pool's own module-local mulberry32 (cosmetic, outside State, allowed to reset on swap). Light flicker uses `Math.sin(meta.time * freq + phase)`, no randomness at all.

## 4. Sub-stream seeding for generation

`generateCave(seed)` (`src/world/generate.ts`) runs passes in the fixed order of [[architecture-cave-generation-3]] §4 (pass 0 `'cave:macro'` first). The table below is an append-only **tag registry**; its row order has no meaning ([[architecture-rulings-3]] R-121). Attempt `a` uses `caveSeed = a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)`, and each pass creates its own `makeRnd(hashSeed(caveSeed, tag))` with the fixed tags below; attempt 0 equals `hashSeed(seed, tag)` (R-111):

| Pass | Tag | Draws |
|---|---|---|
| 1 cellular automata fill | `'cave:fill'` | initial wall noise (45 % wall, DEFAULT architect), 5 smoothing iterations (4-5 rule) |
| 2 largest region + border | – | no draws |
| 3 loop tunnels (2–3) | `'cave:tunnels'` | count, endpoints, wiggle |
| 4 entrance | `'cave:entrance'` | choose among floor tiles in the top 15 % rows nearest the map edge |
| 5 path field + Beacon | – | BFS; Beacon = max distance floor tile; ties broken by lowest tile index (no draw) |
| 6 side rooms (`,`) | `'cave:rooms'` | dead-end pockets marked as side rooms |
| 7 veins | `'cave:veins:<zone>'` per zone 1..4 | vein count and mineral type per zone |
| 8 resin | `'cave:resin'` | positions along the path |
| 9 plants | `'cave:plants'` | positions on `,` tiles |
| 10 decor (render only) | `'decor'` | built outside `generateCave`, in `src/render/decor.ts` |
| spare | `'cave:spare'` | none; its state goes to `s.rng.cave` |
| 0 macro tree + mask (runs FIRST in every attempt) | `'cave:macro'` | macro-cell tree and floor mask ([[architecture-scale-and-economy]] §2.2) |
| 2b spine carve (after CA, before pass 4) | `'cave:spine'` | spine discs and 2-wide tunnels along macro edges ([[architecture-scale-and-economy]] §2.3) |
| teaching placements (per attempt) | `'cave:teach'` | `makeRnd(hashSeed(caveSeed, 'cave:teach'))`: teaching spots T1–T4 + first lurker ([[architecture-cave-generation-2]] §3.4 step 3; R-152) |
| fallback cave (attempt-independent) | `'cave:fallback'` | `hashSeed(seed >>> 0, 'cave:fallback')`, 0 draws (fixed ring geometry; the tag only derives the `populate` seed `cs`, passed with `a = 8`), used only by `fallbackCave(seed)` ([[architecture-cave-generation-2]] §6; R-152, R-163, R-165 in [[architecture-rulings-3]]) |

Rule: **a new pass gets a NEW tag** appended at the end of the table. Changing pass 7 cannot move walls from pass 1, and adding pass 11 cannot move anything earlier. Changing a pass's own logic changes only that pass's output. Within a pass, iterate tiles in index order so results do not depend on object-key order.

Generation uses integer math only (BFS, counts, `rnd.int`), so the same seed gives the same cave in Node (check) and every browser. Output type:

```ts
export type CaveGen = {
  tiles: string; entrance: TilePt; beacon: TilePt; beaconDist: number
  veins: Vein[]; pickups: Pickup[]; rngState: number // 'cave:spare' state
}
```

Entity ids for generated veins/pickups are assigned by `startRun` from `meta.nextId` in array order, not by the generator, so the generator stays independent of State.

## 5. Seed parsing and sanitising – `parseSeed`

```ts
export const SEED_MAX_LEN = 32
export function sanitizeSeedText(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, SEED_MAX_LEN)
}
export function parseSeed(text: string): number {
  const t = sanitizeSeedText(text)
  if (/^\d{1,10}$/.test(t) && Number(t) <= 4294967295) return Number(t) >>> 0 // plain digits: literal
  return fnv1a(t.toLowerCase())                                                // text: case-insensitive hash
}
```

| Input `?seed=` | `seedText` | `seed` |
|---|---|---|
| `123` | `'123'` | `123` |
| `0007` | `'0007'` | `7` (display keeps `0007`) |
| `9999999999` (> uint32) | `'9999999999'` | `fnv1a('9999999999')` |
| `Ember Cave!` | `'EmberCave'` | `fnv1a('embercave')` |
| `<script>` | `'script'` | `fnv1a('script')` |
| empty, missing, or all chars stripped | – | **invalid: random** |
| longer than 32 chars | first 32 kept | hash of that |

Random seed (default source, every new run without `?seed=`): `crypto.getRandomValues(new Uint32Array(1))[0]`, shown as decimal `seedText = String(seed)`. `crypto` is fine here: `startRun` is called from input handling, before simulation; it is not a draw inside `update` systems. In `npm run check` `startRun` is always called with an explicit seed text.

Read `?seed=` once on page load (`new URLSearchParams(location.search).get('seed')`) in `src/ui/platform.ts` `platformStep` (R-003) when leaving the title screen. "Restart on a new seed" from the end screen ignores the URL seed and draws a random seed (spec: "by default every run uses a new random seed"); "Retry this seed" (second menu item) reuses `meta.seedText`.

**Display and copy:** HUD-free; the seed shows on the pause, dead and won screens as `SEED 123` (or the text). Copy link button builds `location.origin + location.pathname + '?seed=' + encodeURIComponent(seedText)`, calls `navigator.clipboard.writeText` in a try/catch (itch.io iframes may block it); on failure it shows the URL as selectable text in a toast. On run start, `history.replaceState(null, '', '?seed=' + encodeURIComponent(seedText))`, wrapped in try/catch (sandboxed iframe). Format details: [[architecture-scoring-and-save]] §5.

## 6. Rules (binding)

1. **No `Math.random` and no `crypto` in simulation code.** Simulation = `src/core`, `src/world`, `src/entities`, `src/systems` (and `src/game.ts`'s `update`). The only exception is `randomSeed()` in `src/core/seed.ts`, called from `startRun`.
2. **No wall clock** (`Date.now`, `performance.now`) in simulation code. Time is `meta.steps / 60`.
3. **Gameplay never reads the cosmetic stream.** A value drawn from `'cosmetic'` must not flow into a gameplay field (position, timer, hp, energy, spawn). Reviewers check that `rand(s, 'cosmetic')` results are written only to cosmetic fields (`fx.shake*`, `fx.flare`, toast text, `fx.events[].a` for cosmetic kinds).
4. **Cosmetic draw count must not depend on frame rate or rendering.** Only `update` advances the cosmetic stream; `render` uses stateless noise. So a run behaves the same with or without a visible tab.
5. **Iteration order is array order.** Never iterate an object's keys to decide gameplay; never sort with a comparator that returns 0 for distinct entities without a tie-break on `id`.
6. **Draw counts must not depend on cosmetic or debug flags.** E.g. `debug.reveal` must not skip a gameplay draw.

## 7. Pure functions and property tests (`npm run check`)

File: `src/checks/determinism.check.ts`, exports `run(): void`, called via `src/checks/all.ts` ([[architecture-rulings]] R-040). DOM-free, no `node:` imports (R-039). Replay rows drive `startRun` then `step` from `src/systems/step.ts`, never `update` (R-038).

| Function | Property asserted |
|---|---|
| `step32`, `fnv1a`, `hashSeed` | known vectors: `fnv1a('') === 0x811c9dc5`, `fnv1a('a') === 0xe40c292c`; outputs are uint32 integers |
| `rand` | 10 000 draws all in `[0, 1)`; mean in `[0.48, 0.52]` |
| `parseSeed` | every row of the §5 table; output always integer `0..2^32-1`; `parseSeed(String(n)) === n` for 100 random uint32 |
| `generateCave(seed)` | same seed twice deep-equal; 20 seeds: entrance and Beacon are floor, Beacon reachable, `beaconDist >= 459` (fallback floor, [[architecture-scale-and-economy-4]] §2), every vein's `stand` is reachable floor, every pickup on reachable floor, `tiles.length === 76800` |
| sub-stream isolation | `generateCave` with the veins pass disabled through a test-only option `{ skip: ['veins'] }` yields the same `tiles` |
| `update` replay | `a = init(); startRun(a,'777')`, `b` same; run both 1 800 steps with the same scripted `Input`; `JSON.stringify(a) === JSON.stringify(b)` |
| cosmetic isolation | run `a` and `b` as above but set `b.rng.cosmetic` to a different value first; all gameplay groups (`player` minus cosmetic timers, `monsters` minus `seen`, `rocks`, `world`, `meta.phase`) are deep-equal after 1 800 steps |
| `migrate` idempotency | see [[architecture-state-3]] §7 |
| `computeScore`, `depthOf` | see [[architecture-scoring-and-save]] §7 |

### Grep guard – `scripts/check-guard.ts`

Lives in `scripts/check-guard.ts`, outside the tsconfig `include` ([[architecture-rulings]] R-039, R-040: `node:fs` under `src/` fails `tsc` with TS2307, verified). Run as the last step of `npm run check` (`… && node scripts/check-guard.ts`). Node built-ins only, no dependency:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
const SIM_DIRS = ['src/core', 'src/world', 'src/entities', 'src/systems']
const BANNED = /\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bcrypto\./
const ALLOW = new Set(['src/core/seed.ts']) // randomSeed() only
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [] // folders appear slice by slice
  return readdirSync(dir).flatMap((f) => {
    const p = dir + '/' + f
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}
for (const f of [...SIM_DIRS.flatMap(walk), 'src/game.ts']) {
  if (ALLOW.has(f)) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (BANNED.test(line)) throw new Error(`check failed: ${f}:${i + 1} uses non-injected randomness/clock`)
  })
}
```

`npm run check` runs from the repo root, so relative paths resolve; missing directories are skipped by `existsSync`. `src/core/storage.ts` may call `new Date().toISOString()` for `Best.at` (I/O, R-024); the regex does not match `new Date()`, so it needs no allow-list entry unless it switches to `Date.now`. ponytail: line-based grep, catches aliases like `const r = Math.random` too but not `Math['random']`; good enough for a jam, add an AST check if someone gets clever.

## 8. Open questions

- Is a replay feature wanted? Not in the spec. The design supports one (seed + input log), but none is built (YAGNI).
- Float determinism across browsers is not guaranteed for movement; only the cave is cross-browser identical. Shared seeds therefore share the cave, items and Beacon, not monster behaviour. That matches the spec ("runs can be shared").

## Related

- [[architecture]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-scoring-and-save]]
- [[architecture-resources]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[index]]
- [[architecture-cave-generation-3]]
- [[architecture-rulings-3]]

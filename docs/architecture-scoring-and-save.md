---
type: architecture
title: Last Ember – Scoring and Save Architecture
description: Precise definition of depth (0–40 normalised path distance to the Beacon), every score input, worked score examples, run-time measurement, RunResult and personal-best data models, localStorage keys with schema versioning and failure handling, shareable seed URL format and the end-screen field list for Last Ember.
tags: [project, ai-jam-5, architecture, last-ember, state, scoring]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – Scoring and Save Architecture

Hub: [[architecture]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. Seeds: [[architecture-determinism]]. Spec (governs the formula): [[last-ember-design]] § End screen and score. Resolves open item #7 of [[last-ember-open-questions]] (pending saile2204 confirmation).

## 1. Definition of `depth` (DEFAULT, architect)

**`depth` = the deepest point reached, as normalised path distance from the entrance toward the Beacon, an integer 0..40.**

```ts
// src/systems/depth.ts
export const DEPTH_MAX = 40
export function depthOf(dist: number, beaconDist: number): number {
  if (dist <= 0 || beaconDist <= 0) return 0                       // entrance tile, or unreachable (-1)
  return Math.floor((DEPTH_MAX * Math.min(dist, beaconDist)) / beaconDist)
}
export function zoneOfDepth(depth: number): Zone {
  return Math.min(4, 1 + Math.floor(depth / 10)) as Zone           // 0-9 -> 1, 10-19 -> 2, 20-29 -> 3, 30-40 -> 4
}
```

- `dist` = BFS step count (4-neighbour) from the entrance tile on the ROCK-FREE map (`world.tiles` only). Field cached outside State ([[architecture-state-3]] §5).
- `beaconDist` = `dist` of the Beacon tile. The Beacon is the reachable floor tile with the largest `dist`, so every reachable tile has `dist <= beaconDist`, and standing on the Beacon gives exactly `depth = 40`.
- `trackDepth(s)` runs every step in phase `descent` AND `escape`: `d = distField[playerTile]`; if `d > stats.maxPathDist` then `stats.maxPathDist = d`, `stats.maxDepth = depthOf(d, beaconDist)`, `stats.deepestZone = zoneOfDepth(stats.maxDepth)`. Also `meta.zone = zoneOfDepth(depthOf(d, beaconDist))` (current zone, drives ambient colour and spawns).
- **Zones and depth share one metric.** Zone boundaries are depth 10, 20, 30. This is the same rule that places monsters (Lurker zone 1+, Stalker zone 2+, Devourer zone 3–4) and mineral rarity, so the score number and the world's difficulty agree.
- HUD shows the CURRENT depth (`depthOf(dist of player tile)`), not the max, so the player sees the way back shrink.

Why this and not "max zone × 10 + progress within zone": they are the same number here (zone = depth band), and path distance is what the spec's "deeper or out?" tension is about. Straight-line distance was rejected: a tunnel that bends back near the entrance would read as shallow. Raw tile count was rejected: it depends on cave size and would make scores differ between seeds; normalising to 0..40 makes every seed's Beacon worth exactly `4000`.

## 2. Score inputs

| Formula term | Source | Exact meaning |
|---|---|---|
| `depth` | `player.stats.maxDepth` | int 0..40, §1; max reached during the run including escape |
| `win` | `result.won` | `true` only if the player reached the exit tile in phase `escape` |
| `seconds` | `Math.floor(meta.steps / 60)` | int, simulated playing time, §3 |
| `minerals_used` | `player.stats.mineralsUsed` | int, pieces TOSSED into the flame. +1 per toss that consumed a piece. Mining, carrying, shake-off and pieces left in the hotbar do NOT count |
| `hp_left` | `player.hp` at run end | int 0..5. Death: always 0 (death means hp reached 0). Win: pips left |

```ts
// src/systems/score.ts (pure)
export type ScoreInput = { depth: number; won: boolean; seconds: number; mineralsUsed: number; hpLeft: number }
export type ScoreParts = { depth: number; win: number; time: number; minerals: number; hp: number; total: number }
export function computeScore(i: ScoreInput): ScoreParts {
  const p = {
    depth: i.depth * 100,
    win: i.won ? 1000 : 0,
    time: Math.max(0, 600 - i.seconds),
    minerals: i.mineralsUsed * 25,
    hp: i.hpLeft * 50,
  }
  return { ...p, total: p.depth + p.win + p.time + p.minerals + p.hp }
}
```

Exactly the approved formula `score = depth*100 + (win ? 1000 : 0) + max(0, 600 - seconds) + minerals_used*25 + hp_left*50`.

## 3. Time measurement

- `meta.steps += 1` once per `update` call **only while `meta.screen === 'playing'`**. Screens `paused`, `help`, `title`, `dead`, `won` do not count. The host clamps tab-away frames (`MAX_FRAME = 0.25`), and a hidden tab runs no rAF, so wall time outside play never leaks in.
- `seconds = Math.floor(steps / 60)`. Never wall clock (rule 2 of [[architecture-determinism]] §6). HUD-free; the end screen shows `mm:ss` from the same integer.
- Auto-pause: `blur` clears keys in the host; Last Ember additionally switches `playing -> paused` when `Escape` is pressed. ponytail: no auto-pause on blur (needs a host hook); the clamp already prevents time jumps.

## 4. Worked examples

Refined 2026-10-18 for the 320×240 map (6–8 minute runs; mid timeline zone borders 77 / 154 / 231 / 308 s, hold to 313 s, escape to 417 s). Rows A–H are [[architecture-scale-and-economy-3]] §4; the formula is unchanged.

| Case | depth | won | seconds | minerals used | hp left | depth pts | win | time | minerals | hp | **score** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A: death in zone 2 | 15 | no | 115 | 1 | 0 | 1500 | 0 | 485 | 25 | 0 | **2010** |
| B: death in zone 3 | 25 | no | 193 | 3 | 0 | 2500 | 0 | 407 | 75 | 0 | **2982** |
| C: death in zone 4 | 35 | no | 270 | 5 | 0 | 3500 | 0 | 330 | 125 | 0 | **3955** |
| D: death in escape, Beacon lit | 40 | no | 380 | 6 | 0 | 4000 | 0 | 220 | 150 | 0 | **4370** |
| E: slow win | 40 | yes | 480 | 6 | 2 | 4000 | 1000 | 120 | 150 | 100 | **5370** |
| F: mid win | 40 | yes | 417 | 6 | 3 | 4000 | 1000 | 183 | 150 | 150 | **5483** |
| G: fast win | 40 | yes | 360 | 8 | 3 | 4000 | 1000 | 240 | 200 | 150 | **5590** |
| H: perfect win (expert, DMIN) | 40 | yes | 307 | 12 | 5 | 4000 | 1000 | 293 | 300 | 250 | **5843** |
| I: instant suicide | 0 | no | 25 | 0 | 0 | 0 | 0 | 575 | 0 | 0 | **575** |

Sanity:

- Ordering A < B < C < D < E < F < G < H holds: going deeper always beats dying early. One depth unit (15 path tiles at D\* 600, ≈ 4 s of walking, ≈ 7.7 s at mid pace) is worth 100; the same time costs only 4–8 time points.
- Any win beats any realistic death: worst win (565 s, hp 1, 0 minerals) = **5085**; best realistic death (escape, ≈ 350 s, 15 minerals) = 4000 + 250 + 375 = **4625**.
- Range ≈ 2000–5850 for real runs (old ≈ 500–6000). **Time weight shift:** wins now score 35–293 time points (old 403–483). Between a slow and a fast win the gap is ≈ 120 pts = 2.4 HP pips = 4.8 minerals, so HP and minerals now outweigh speed between wins; a plant detour (+50, −8) is always score-positive.
- Case I shows the known quirk of the approved formula: a death still earns the time term, so a 0-depth suicide gets 575. It never beats real progress (depth 6 already out-scores it). **Open:** apply the time term only on a win? That needs saile2204's approval because the formula is approved; until then the code follows the spec exactly.

## 5. RunResult, end of run, shareable seed

```ts
export type RunResult = {
  won: boolean
  depth: number         // stats.maxDepth
  zone: Zone            // stats.deepestZone
  seconds: number       // floor(steps / 60)
  mineralsUsed: number
  hpLeft: number
  parts: ScoreParts     // includes total
  seed: number
  seedText: string
  kills: number; parries: number; perfectParries: number // flavour line
  isNewBest: boolean
  prevBest: number      // previous best score, 0 if none
  endAt: number         // meta.time (s) when endRun ran; end-screen input lockout of 0.5 s
}
```

`DEFAULT_RESULT` (for `migrate`) has every field zero/false/`''`, `zone: 1`, `parts` all `0`. `endRun(s, won)` in `src/core/run.ts`: builds `result`, sets `meta.screen = won ? 'won' : 'dead'`, emits `'win'`/`'death'`, then calls `commitBest(s)` from `src/ui/storage.ts` (§6). Trigger: death when `player.hp <= 0` after `damagePlayer`; win when `meta.phase === 'escape'` and the player tile is within 1 tile of `world.exit`.

Share URL: `<base>?seed=<encodeURIComponent(seedText)>`, base = `location.origin + location.pathname`. Example `https://example.itch.zone/html/123/index.html?seed=8812` or `?seed=EmberCave`. Seed text rules: [[architecture-determinism]] §5. **Open (unverified):** itch.io serves HTML5 games in an iframe on a different origin; the page's query string is probably NOT forwarded into the iframe, so a `?seed=` on the itch page URL may never reach the game. Verify on the first itch upload. Mitigation already in State: the title screen has a seed text field (`ui.seedInput`), and the end screen shows the seed text for typing. Define `SHARE_BASE` (the public itch page URL) once it exists and show "Seed 8812 – enter it on the title screen" as the share text.

## 6. Personal best and settings in `localStorage`

Keys (module constants in `src/ui/storage.ts`):

| Key | Value |
|---|---|
| `last-ember:best` | `JSON.stringify(Best)` |
| `last-ember:settings` | `JSON.stringify(SettingsRecord)` |

```ts
export type Best = {
  v: 1               // schema version of the stored record
  score: number
  depth: number
  seconds: number
  won: boolean
  mineralsUsed: number
  hpLeft: number
  seedText: string
  at: string         // ISO 8601 date of the run, from new Date().toISOString() in storage.ts (UI layer, not simulation)
}
export type SettingsRecord = { v: 1; volume: number; muted: boolean; lastSeed: string }
export const DEFAULT_BEST: Best = { v: 1, score: 0, depth: 0, seconds: 0, won: false, mineralsUsed: 0, hpLeft: 0, seedText: '', at: '' }
```

`State.best: Best | null` mirrors the stored record (`null` = no best yet). `State.settings` mirrors `SettingsRecord` (plus the State-only `loaded` flag).

Rules:

1. **Every access is in try/catch.** `localStorage` may be missing (Node check), blocked (Safari private mode, sandboxed iframe, third-party storage blocked on itch.io), or throw `SecurityError`/`QuotaExceededError`. On any throw: `s.ui.storageOk = false`, push toast `'Saving disabled in this browser'` once, continue. The game never depends on storage.
2. **Load** (`loadBest`, `loadSettings`), once per page session (guarded by `settings.loaded`, [[architecture-state-2]] §9): `JSON.parse` in try/catch; accept only if `typeof v === 'object'` and `v.v === 1` and the numeric fields are finite numbers; then `fill(DEFAULT_BEST, v)`. Otherwise treat as absent. Never delete an unreadable key (a newer build may own it).
3. **Schema versioning.** A breaking change bumps `v` to 2 and the key stays the same; loaders accept `v === 1` and convert to 2 in code, or ignore older versions. Key names never change.
4. **Commit best** (`commitBest(s)`): new run is better if `score > best.score`, or equal score and `seconds < best.seconds`. Then set `result.isNewBest`, `result.prevBest`, update `s.best`, write the key. Size is about 200 bytes, so quota is not a practical risk; quota errors follow rule 1.
5. **Save settings** on change of volume/mute and at run start (`lastSeed`). Debounce not needed (rare events).
6. Only the local best is stored. No history, no name, no network (spec: no leaderboard).

## 7. End-screen fields (`dead` and `won`)

| Row | Content | Source |
|---|---|---|
| Title | `THE EMBER DIED` / `YOU ESCAPED` | `result.won` |
| Depth | `Depth 25 / 40 · Zone 3` | `result.depth`, `result.zone` |
| Time | `Time 3:13` | `result.seconds` as `m:ss` |
| Minerals used | `Minerals used 3` | `result.mineralsUsed` |
| HP left | `HP left 1` (win only; death shows nothing) | `result.hpLeft` |
| Score | `Score 2982` with breakdown `depth 2500 · escape 0 · time 407 · minerals 75 · hp 0` | `result.parts` |
| Personal best | `NEW BEST!` or `Best 4370` | `result.isNewBest`, `s.best.score` |
| Flavour | `Parries 9 (perfect 3) · Kills 12` | `result` |
| Seed | `Seed 8812` + `[C] Copy link` | `result.seedText`, §5 |
| Actions | `[Enter] New run` (random seed) · `[T] Retry seed` · `[Esc] Title` | `ui.cursor` for mouse/arrow selection |

Restart is one press (spec). Input lockout: end-screen actions are ignored until `meta.time - endAt >= 0.5` s, so a held attack click cannot skip the screen. `endAt` is `RunResult.endAt` (§5). `meta.time` is used because `meta.steps` stops outside `playing`.

Checks in `src/checks/score.check.ts`: every row of the §4 table equals `computeScore` output; `depthOf(0, n) === 0`, `depthOf(n, n) === 40`, `depthOf(-1, n) === 0`, monotonic in `dist`; `zoneOfDepth` boundaries 9→1, 10→2, 29→3, 30→4, 40→4; a `Best` round trip through a fake storage object with a throwing `setItem` sets `storageOk = false` without throwing.

## Related

- [[architecture]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-resources]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[index]]
- [[architecture-scale-and-economy-3]]

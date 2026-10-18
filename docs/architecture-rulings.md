---
type: architecture
title: Last Ember – Architecture Rulings (binding conflict resolutions)
description: Part 1 of 2 – the single binding answer for every conflict found between the Last Ember architecture files (module trees and topical specs). Precedence order, layer rule, and global rulings R-001 to R-065 for layering and file placement, core/state/save, checks and tooling, world and cave generation, rocks and the escape route, each with severity, winner, exact edit in the losing file and who applies it.
tags: [project, ai-jam-5, architecture, last-ember, rulings]
timestamp: 2026-10-17T23:00:00Z
---

# Last Ember – Architecture Rulings (1/2)

Part 1 of 2. Part 2: [[architecture-rulings-2]] (systems and AI, render and audio, UI/assets/host, consolidated State additions, owner decisions, gaps). Hub: [[architecture]], [[index]]. Product spec: [[last-ember-design]].

Sources of the conflicts: the "Conflicts and gaps" sections of [[architecture-modules-core]] §5, [[architecture-modules-world]] §5, [[architecture-modules-systems-2]] §2, [[architecture-modules-render-2]] §5, [[architecture-modules-ui-assets-2]] §5, plus [[architecture-systems-4]] §6–§7, the supersede notes in [[architecture-rocks]] §2 and [[architecture-cave-generation-2]] §0 and §5.6. Local ids from those files (core C1, world C5, MS-7, render C2, ui C11 …) are cited so a builder can trace each ruling.

## 0. Rule of precedence (binding for builders)

1. [[last-ember-design]] – the product. Outranks everything.
2. This file and [[architecture-rulings-2]].
3. `architecture-modules-*` – file ownership, layers, signatures.
4. Topical specs – state, systems, tuning, monsters-ai, world, render, resources, ui, assets.
5. Older text.

Inside one rank, the newer and more specific spec wins where two authors chose incompatible numbers. Each ruling says so where it applies.

**Layer rule (binding):** L0 `src/core` → L1 `src/world` + `src/assets` (data only) → L2 `src/entities` → L3 `src/systems` → L4 `src/render` + `src/audio` + `src/ui` → L5 `src/game.ts`. Host: `src/main.ts`, `src/merge.ts` (game code imports them with `import type` only). A module imports from lower layers or its own layer, without cycles. Type-only cycles count as cycles. `src/checks/*` import L0–L3 only and never touch the DOM or `import.meta.env` at import time.

**How to apply:** the builder of the FIRST PR that touches an area applies every edit for that area in the KB (edit the losing file, add `Superseded by [[architecture-rulings]] R-nnn`), in the same session as the code. Severity: **B** = blocker (build, check or layer breaks, or two APIs cannot both be built), **M** = major (behaviour or API divergence between builders), **m** = minor (naming, docs, wording).

Counts (both files): B 18, M 35, m 54 – total 107 rulings (R-001–R-107; R-102–R-107 are the 320×240 scale rulings in part 2 §8.1). Owner decisions: 6 (OD-1–OD-6, part 2 §10); no ruling in either table is left as OWNER-DECISION, except that R-105 is ruled but its `main.ts` edit still needs owner approval (with the OD-1 batch).

## 1. Layering and file placement

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit (file §: old → new) | Applies |
|---|---|---|---|---|---|---|
| R-001 | B | run lifecycle | [[architecture-state-2]] §10, [[architecture-scoring-and-save]] §5, [[architecture-systems]] §1.1 #16 and §3, [[architecture-systems-4]] §3.1: `src/core/run.ts`; layer rule: it calls `generateCave`, `emit`, `commitBest` (core C3, MS-3) | `startRun(s, seedText)`, `endRun(s, won)`, `checkEnd(s)` live in `src/systems/run.ts` (L3). | those 4 files + [[architecture-determinism]] §6 rule 1: `src/core/run.ts` → `src/systems/run.ts` | first systems-flow PR |
| R-002 | B | fixed-step driver | [[architecture-systems]] §1, §1.3 and [[architecture-state-3]] §6: `src/core/step.ts`; layer rule (core C5, MS-1) | `step(s: State, input: Input, dt: number): void` lives in `src/systems/step.ts`; it alone writes `meta.steps`, `meta.time`. | systems §1, §1.3; state-3 §6 clock row: `src/core/step.ts` → `src/systems/step.ts` | first systems-flow PR |
| R-003 | B | screen machine location | [[architecture-modules-systems]] S2 / MS-2: `src/systems/screens.ts`; [[architecture-modules-ui-assets]] §2 and ui C7: `src/ui/screens.ts` `uiStep`, drop the systems file | Split. Pure state machine `stepScreens(s: State, input: Input): boolean` in `src/systems/screens.ts` (L3, called first by `step`, checkable). DOM effects (clipboard write, `?seed` read and write, `res.ui.copyResult`) in `src/ui/platform.ts` `platformStep(s: State): void` (L4), which absorbs `src/ui/url.ts`. `src/ui/screens.ts` and `uiStep` are NOT created. | modules-ui-assets §1 `update` row and §2 rows `screens.ts`, `url.ts`; modules-ui-assets-2 C7 → "superseded by R-003"; [[architecture-ui]] §2, [[architecture-ui-2]] §3 "from `src/ui/screens.ts`" → "`platformStep` consumes the `copyLink` event"; [[architecture-systems-2]] §4 owner → `src/systems/screens.ts` | first UI PR |
| R-004 | B | monster step layer | [[architecture-monsters-ai]] header, §3: `stepMonsters`, `ai-*.ts`, `separate` in `src/entities/`; they import L3 (MS-4) | `stepMonsters`, `pipeline`, `updateStuck`, `separate` → `src/systems/monsters.ts`; brains → `src/systems/ai-*.ts`; entities keep `spawnMonster`, `seek`, `blend`, `devourerMul`. | monsters-ai header and §3 paths; [[architecture-monsters-ai-2]] §1 header (`devourerMul` → `src/entities/monster.ts`) | first AI PR |
| R-005 | B | storage location | [[architecture-state-3]] §5–6, [[architecture-scoring-and-save]] §6, [[architecture-modules-ui-assets]] §2 row: `src/ui/storage.ts`; core C4 | `loadSettings`, `loadBest`, `commitBest`, `saveSettings`, `type Store` live in `src/core/storage.ts` (L0, storage touched only inside function bodies, in `try`). | the three spec paths → `src/core/storage.ts`; modules-ui-assets §2: delete the `storage.ts` row | first save PR |
| R-006 | B | score types | scoring §2, §5, §6: `ScoreParts` in systems, `Best`/`DEFAULT_BEST` in ui; core C1 | Types in `src/core/types.ts`; `computeScore`, `DEFAULT_BEST`, `DEFAULT_RESULT` in `src/core/score.ts`. | scoring §2/§5/§6 file names | first save PR |
| R-007 | M | depth/zone maths | world C12: `src/world/zones.ts` (proposal); core C2: `src/core/score.ts`; [[architecture-state-2]] §1 one-arg `depthOf(dist)`, `zoneOf(dist)` | `DEPTH_MAX`, `depthOf(dist, beaconDist)`, `zoneOfDepth(depth)` in `src/core/score.ts`. `src/world/zones.ts` is NOT created; `zoneOfDist` is not exported (callers write `zoneOfDepth(depthOf(d, bd))`). | modules-world §1 zones row deleted, imports of caches/populate/validate/pockets → `../core/score.ts`; [[architecture-cave-generation-2]] §1 file; state-2 §1 call form | first world PR |
| R-008 | B | noise helpers | [[architecture-render]] §2, [[architecture-render-2]] §1: `src/render/noise.ts`; L1 `images.ts` and `audio/sfx.ts` need it (render C2) | `hash2`, `vnoise`, `quantAngle` live in `src/core/noise.ts`. | render §2 row, render-2 §1 heading, [[architecture-resources]] §7 check list → `src/core/noise.ts` | first render PR |
| R-009 | M | toast helper layer | [[architecture-ui-2]] §1, §8: systems write toasts and `ui.denyT` "via ui helper"; ui C11 proposes `src/systems/toast.ts`; core C15: L0 storage pushes a toast | `toast(s: State, text: string): void` lives in `src/core/state.ts` (usable by L0 storage and L3 systems). `ui.denyT` is written directly by `src/systems/flame.ts`. No `src/systems/toast.ts`. | ui-2 §1 toast row and §8 `ui.denyT` writer "flame.ts via ui helper" → "flame.ts"; state-3 §6 `ui.*` row: add "toasts: `toast()` in core/state.ts, any layer ≤ L3" | first UI PR |
| R-010 | M | State factory name | MS-19 and world C13: `initState()` from L0; core §3.2: `init()` in `src/core/state.ts` | One name: `init(): State` in `src/core/state.ts`; `game.ts` re-exports it; checks import it from `../core/state.ts`. No `initState` symbol. | modules-systems-2 §1 rule bullet and §3 intro, [[architecture-world-queries-2]] §4 `withTiles`: `initState()` → `init()` from core | first check PR |
| R-011 | m | `initPlayer` | MS-18 / [[architecture-modules-systems]] E1 `src/entities/player.ts`; core §3.2 `src/core/state.ts` | Core wins (`init` needs it, L0 cannot import L2). E1 is not created. | modules-systems §2 E1 → "deleted, see R-011" | first systems PR |
| R-012 | M | `moveCircle`/`isSolidTile` | [[architecture-systems]] §5 and modules-systems S5: in `movement.ts`; world C4: `src/world/collide.ts`, `grid.ts`, with a re-export from movement | Defined ONLY in `src/world/collide.ts` / `src/world/grid.ts`. NO re-export: every caller imports from world (one path). | systems §5, modules-systems S5 bullets, modules-world §1 collide sentence "re-exports" → removed | first movement PR |
| R-013 | M | tile LOS | MS-10 proposes `losTiles(s, a, b)` in `light.ts`; [[architecture-world-queries]] §4 `lineOfSight(s, a, b)` | `lineOfSight` / `lineOfSightPx` in `src/world/los.ts` are the only LOS. `losTiles` is not created. | [[architecture-monsters-ai]] §4 `losTiles(s, m, p)` → `lineOfSightPx(s, m.x, m.y, p.x, p.y)`; modules-systems S7, S8 | first AI PR |
| R-014 | M | `playerSources` | [[architecture-rocks-2]] §5 API: in `src/systems/rocks.ts`; world C10: L1 `exitHeading` needs it | `playerSources(s, exclude)` lives in `src/world/route.ts`; `rocks.ts` imports it. | rocks-2 §5 API block: move the line, note "from route.ts" | first rocks PR |
| R-015 | M | rocks module | modules-systems §1 diagram "L1 … planRockFall" and S20 "calls world planRockFall"; rocks-2 §5 and modules-world §2: `src/systems/rocks.ts` | `src/systems/rocks.ts` (L3, new row S23) exports `RockPlan`, `planRockFall`, `commitRock`, `landRock`; imports world route/caches, fx, combat. | modules-systems §1 diagram (remove `planRockFall` from L1), S20 text, add S23 | first rocks PR |
| R-016 | m | shared maths | MS-5 `wrapPi` in combat, MS-6 `segDist`, core G1 `clamp` | `clamp`, `wrapPi`, `segDist` in `src/core/math.ts`. | [[architecture-systems-3]] §3 `wrapPi` definition → import | first combat PR |
| R-017 | M | `shakeOffset` twice | systems-4 §5: `src/systems/camera.ts` `shakeOffset(s): {x, y}`; modules-render view.ts `shakeOffset(s): [number, number]` | One function in `src/systems/camera.ts` returning `{ x: number; y: number }`. Render imports it and scales by 0.4 when `settings.reducedFlash`. | modules-render §3 `view.ts` row: remove `shakeOffset`; [[architecture-render]] §4.4 | first render PR |
| R-018 | M | zoom helpers | modules-render §3 cites `src/core/view.ts viewZoomCss(h)` (absent from the core tree); render `keys.ts` has `deviceZoom` | New `src/core/view.ts`: `VIEW_H_DEV = 480`, `deviceZoom(ch: number): number`, `viewZoomCss(h: number): number`. `keys.ts` imports them. **Superseded by R-131** ([[architecture-rulings-3]]): `viewZoomCss(h: number, dpr: number)`. | modules-core §2 add row; modules-render `keys.ts` row | first render PR |
| R-019 | m | `images.ts`, `placeholders-*.ts` | L1 = data only (ui C9) | Paths stay in `src/assets/`, ranked L4: importable only from render, ui, `game.ts`. | none (already in modules-ui-assets) | – |
| R-020 | B | `resources.ts` imports audio | [[architecture-host-changes]] §2: imports `createAudio` from `../audio/engine.ts`; [[architecture-resources]] §2: type-only (ui C8) | `resources.ts` imports `sprites.ts`/`sounds.ts` with `import type` only. | host-changes §2 code block → "superseded by resources §2–3" | first assets PR |
| R-021 | m | audio file paths | [[architecture-assets-pipeline]] §2: `src/assets/audio.ts`, `synth*.ts`; resources §0: `src/audio/*` (ui C10) | `src/audio/{engine,mixer,music,sfx,synth,synth-2,trigger}.ts`. | pipeline §2 tree | first audio PR |

## 2. Core, state, save

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-022 | B | `fill()` frozen defaults | [[architecture-state-3]] §3 `return def` hands frozen/shared `DEFAULT_*` to live State (core C10) | On every default path `fill` returns `typeof def === 'object' && def !== null ? structuredClone(def) : def`. | state-3 §3 code | first state PR |
| R-023 | B | unused `Json` type | state-3 §3 declares `type Json`; `noUnusedLocals` fails `npm run build` (core C11) | Delete it. | state-3 §3: remove the line | first state PR |
| R-024 | m | `Best.at` clock | [[architecture-determinism]] §6 rule 2 forbids `Date`; scoring §6 `Best.at = new Date().toISOString()` (core C4) | Allowed in `src/core/storage.ts` only (I/O, not simulation); the grep guard allow-lists that file. | determinism §6 rule 2: add the exception | first save PR |
| R-025 | M | settings key and default | [[architecture-assets-audio]] §4 master 0.8, §8 key `last-ember:audio` with group levels; [[architecture-resources-3]] §3 and scoring §6 `last-ember:settings`, volume 0.7 (render C12, ui C3) | Key `last-ember:settings`, `volume` default 0.7, no group sliders. `SettingsRecord = { v: 1; volume: number; muted: boolean; lastSeed: string; reducedFlash: boolean }`. | assets-audio §4 default 0.7, §8 → "superseded by R-025"; modules-core §3.1 `SettingsRecord` | first save PR |
| R-026 | m | settings save name | scoring §6 rule 5 names no function (core G2) | `saveSettings(s: State, store?: Store): void`. | scoring §6 rule 5 | first save PR |
| R-027 | m | injectable store | scoring §6 has no store param; §7 check needs one (core C14) | Every storage function takes optional `store?: Store`. | scoring §6 signatures | first save PR |
| R-028 | M | empty seed | state-2 §10 step 1 "text empty"; determinism §5 "all chars stripped" (core C12) | Random seed when `sanitizeSeedText(seedText) === ''`; store the sanitised text in `meta.seedText`. | state-2 §10 step 1 | first run PR |
| R-029 | M | URL seed type | [[architecture-host-changes-2]] §6 `readSeed(): number \| null`, `writeSeed(seed: number)`; [[architecture-ui]] §7 text seeds (ui C5) | `readSeed(): string \| null` (lower-cased, `[a-z0-9-]`, ≤ `SEED_MAX_LEN`) and `writeSeed(seed: string): void` in `src/ui/platform.ts` (R-003). Hashing stays in `src/core/seed.ts`. | host-changes-2 §6 | first UI PR |
| R-030 | m | `history.replaceState` | state-2 §10 step 7 lists it inside `startRun` (core C13) | Not in `startRun`. `platformStep` writes the URL when `meta.runId` changes. | state-2 §10 step 7 | first UI PR |
| R-031 | m | score weights | tuning §1.1 `T.score.*`; scoring §2 literals (core C8) | `computeScore` reads `T.score`; values equal the scoring literals; the check pins the table. | scoring §2 code | first save PR |
| R-032 | m | constant names | state §8 / state-2 §2 `RING_MARGIN[kind]`, `LUNGE_CD_START[kind]` (core C9) | Use `T.monsters[kind].ringMarginPx`, `.lungeCdStartS`, `.contactS`. | state-2 §2 spawn-default text | first AI PR |
| R-033 | m | tuning file size | [[architecture-tuning]] §1: one file; 300-line limit (core C7) | Types in `src/core/tuning-types.ts`, values in `src/core/tuning.ts`. | tuning §1 "File:" line | first tuning PR |
| R-034 | m | `MINERALS` | state §5 "types.ts or state.ts"; modules-render-2 §1 trigger "src/world/* (verify)" | `src/core/state.ts` (core C17). | modules-render-2 §1 trigger imports | first audio PR |
| R-035 | m | rng seeding writer | state-3 §6 `rng.*` only via `rand*()`; state-2 §10 step 6 seeds directly (core C18) | Both: `startRun` may seed the streams. | state-3 §6 row: add "plus seeding in startRun" | first run PR |
| R-036 | m | run id / tiles hash | modules-render-2 G9, G10: field names unknown | Use `meta.runId` ([[architecture-state]] §6) and `world.tilesHash` ([[architecture-state-2]] §1); both exist. | modules-render-2 G9, G10 → closed | – |
| R-037 | M | `meta.phase` writer | MS-24: owner unverified | Writers: `src/systems/run.ts` (reset in `startRun`) and `src/systems/beacon.ts` (`lightBeacon`). | state-3 §6 add row | first Beacon PR |

## 3. Checks and tooling

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-038 | B | checks call `update` | state-3 §7 #2, determinism §7: checks call `update` from `game.ts` (L5) (core C6) | Checks call `startRun` then `step` from `src/systems/step.ts`. | state-3 §7 #2, determinism §7 rows | first check PR |
| R-039 | B | `node:` imports in `src/checks` | modules-core §4: checks use `node:assert`, `node:fs`; repo `tsconfig.json` has `types: ["vite/client"]`, includes `src`, no `@types/node` → `tsc --noEmit` fails | No `node:` imports under `src/`. Checks use a local `ok(cond, msg)` (as in `src/check.ts`) and `JSON.stringify` equality. The determinism grep guard moves to `scripts/check-guard.ts` (outside `include`). No `@types/node`. | modules-core §4 intro and determinism row; core C19 wording; determinism §7 grep row → `scripts/check-guard.ts` | first check PR |
| R-040 | B | check entry wiring | modules-core §4: `src/check.ts` EDIT imports check files; [[architecture-modules-ui-assets-2]] §1/§3: `check.ts` unchanged, `src/checks/all.ts` with side-effect imports; modules-systems-2 §1: each file exports `run()` | `src/check.ts` unchanged. Each `*.check.ts` exports `run(): void`, has no side effect on import, and throws on failure. `src/checks/all.ts` imports every `run`, calls them in order, prints `checks ok`. `check` = `node src/check.ts && node src/checks/all.ts && node scripts/check-assets.ts && node scripts/check-guard.ts`. | modules-core §4 `check.ts` row; modules-ui-assets-2 §2 scripts, §3 code sample | first check PR |
| R-041 | M | `CHECK_HEAVY` | rocks-2 §7, world C18: `process` read at import time; no Node types | Read inside `run()`: `(globalThis as { process?: { env: Record<string, string \| undefined> } }).process?.env.CHECK_HEAVY`. | rocks-2 §7, [[architecture-cave-generation]] §5 | first world check PR |
| R-042 | M | storage in checks | state-2 §9: first step loads storage; Node has no `localStorage` (core C16) | Checks set `s.settings.loaded = true` after `startRun`. | state-3 §7 #2 | first check PR |
| R-043 | M | checks importing L4 | [[architecture-resources]] §7 and modules-render-2 §2: checks import `src/render/keys.ts`, `src/audio/trigger.ts`, `src/ui/layout.ts` (ui C6) | Layer rule wins. `render.check.ts` covers only `src/core/noise.ts` and `src/core/view.ts`. `audio.check.ts` is NOT created: `TRIGGERS`/`SYNTH` completeness is tsc-enforced, `SOUNDS` id format goes to `scripts/check-assets.ts`. Key/bucket formulas stay browser-verified. | modules-render-2 §2 table; resources §7 list | first render PR |
| R-044 | m | check file names | modules-ui-assets-2 §3 example `rng.check.ts`; modules-core §4 `determinism.check.ts` | Core names win; the ui-assets sample is illustrative. Systems checks use the MS-20 split. | ui-assets-2 §3 sample | first check PR |
| R-045 | B | JSON import | tsconfig (read 2026-10-17) lacks `resolveJsonModule`; `images.ts` does `import atlas from './atlas.json'` (ui G4) | Add `"resolveJsonModule": true` to `tsconfig.json` in the PR that adds `atlas.json`. **Superseded by R-137** ([[architecture-rulings-3]]): not needed (`moduleResolution: bundler` implies it); optional for explicitness, severity m. | modules-ui-assets-2 §1 tsconfig row → REQUIRED | first assets PR |

## 4. World and cave generation

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-046 | m | cache file name | state-3 §5 `src/world/cache.ts`; WQ2 `caches.ts` (world C1) | `src/world/caches.ts`. | state-3 §5 table | first world PR |
| R-047 | M | generator result type | [[architecture-cave-generation-2]] §0: `CaveGen`/`CaveCore`, `carveCore`, `spawns: SpawnPt[]`, `beaconMask`; [[architecture-cave-generation]] §1.2 `CaveResult` (world C2) | `CaveResult` and `GenOpts` of CG1 §1.2, plus `forceFail?: boolean`. `SpawnHint = { kind: MonsterKind; x: number; y: number }` in core types. | CG2 §0 names per world C2; CG1 §1.2 `GenOpts`; [[architecture-determinism]] §4 `CaveGen` → `CaveResult` | first world PR |
| R-048 | M | fallback cave | CG1 §5: best attempt, `stats.fallback`; CG2 §6: `fallbackCave(seed)` template; attempt seeding differs (world C6) | Fallback = `fallbackCave(seed)` (never invalid). Attempt seeding = ~~CG1 fill-tag reseeding~~ **superseded by R-111** ([[architecture-rulings-3]]: `caveSeed(seed, a)` re-hash, fixed tags). The 1..200 rate check runs only with `CHECK_HEAVY=1`. | CG1 §5; CG2 §6 sketch | first generator PR |
| R-049 | m | part-2 solidity | CG1 §1.3 "part 2 never changes solidity"; CG2 §4 carves a dark patch (world C7) | Part 2 may add floor only. | CG1 §1.3 sentence | generator PR B |
| R-050 | m | entrance safe zone | CG1 §6.4 Chebyshev 6; CG2 §3.3 path dist < 6 (world C8) | CG2 §3.3. | CG1 §6.4 → pointer | generator PR B |
| R-051 | B | grid/caches cycle | WQ1 §2 `grid.ts` imports `caches.ts`; WQ2 §2 `playerTile` in caches uses `grid.ts` (world C9) | `playerTile(s)` lives in `grid.ts`; `caches.ts` imports nothing from `grid.ts`. | WQ2 §2 | first world PR |
| R-052 | m | "one BFS" | CG1 §7; `routeDist` is a second BFS (world C11) | One full-field BFS (`bfs4`); `routeDist` is the allowed early-exit exception. | CG1 §7 wording | – |
| R-053 | M | Beacon chamber mask | [[architecture-rocks]] §3.3 rule 4: `isBeaconRoom(i)` else Chebyshev 6, `beaconClearTiles`; CG2 §0.2 `beaconMask: Uint8Array`; CG1 §8 `beaconRoomMask(...): number[]`, `getBeaconRoom(s)`, `isBeaconRoom(s, i)`, `CHAMBER_MASK_R = 5` (world C5) | CG1 §8. Rocks use `isBeaconRoom(s, i)` only; `T.rocks.beaconClearTiles` is not created. | rocks §3.3 rule 4; rocks-2 §7 test 7 → `!isBeaconRoom(s, i)`; WQ2 §1 export list adds `getBeaconRoom`, `isBeaconRoom`, `getZoneField`, `zoneAt` | first rocks PR |
| R-054 | m | stalagmite solidity | [[architecture-assets-sprites-3]] §2 `prop_stalagmite` solid r 10; CG2 §5.6 decor non-blocking (world C15) | Decor is non-blocking. | assets-sprites-3 §2: drop the solid radius | first art PR |
| R-055 | m | solid-grid key | rocks §1 `tilesHash:solidSig`; WQ2 §1.1 `runId:tilesHash:WxH:solidSig` (world C16) | WQ2 key. | rocks §1 rubble row | first rocks PR |

## 5. Rocks, escape route, exit marker

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-056 | M | rock cadence | [[architecture-systems-4]] §2 and [[architecture-tuning-2]] §5: `quakeT = randRange(0.9, 1.8)` (`T.escape.rockIntervalS`); rocks §2: ramp 0.6→1.6 rocks/s over 60 s, `minIntervalS` 0.4, `pendingMax` 4, `retryS` 0.25 | Rocks §2 wins (newer, more specific; it declares the supersede). New group `T.rocks` in `src/core/tuning.ts`; `T.escape.rockIntervalS` is deleted. | tuning-2 §5 remove `rockIntervalS` row and add the `T.rocks` table; [[architecture-tuning]] §1.1 type; systems-4 §2 sketch → "see rocks-2 §5" (done: systems-4 §2 now cites [[architecture-rocks]] §2) | first escape PR |
| R-057 | m | `planRockFall` signature | rocks-2 §5 brief `planRockFall(s, dt)`; systems-4 `planRockFall(...)` (world C3, MS-9) | `planRockFall(s: State): RockPlan \| null`; `stepQuake` is the rocks-2 §5 sketch. | systems-4 §2 | first escape PR |
| R-058 | M | rock damage path | rocks-2 §2: damage inline in `landRock`; MS-8: shared `hurtPlayerHp(s)` in combat | `landRock` calls `hurtPlayerHp(s)` (combat.ts). Its guard is `debug.god \|\| hurtT > 0`; roll i-frames never apply. | rocks-2 §2 first paragraph; systems-4 §2 last paragraph | first escape PR |
| R-059 | M | exit direction maths | systems-4 §3: best 4-neighbour; [[architecture-ui-2]] §1.1: 6 tiles ahead; rocks-2 §6: downhill K = 4 + LOS shortcut + smoothing | Rocks-2 §6 wins (newest, most specific). Steps 1–4 are `exitHeading(s): { angle: number; dist: number } \| null` in `src/world/route.ts` (`null` = keep the previous angle). | systems-4 §3 exit-marker bullet; ui-2 §1.1 direction bullet → "`exitHeading` (rocks-2 §6)" | first escape PR |
| R-060 | M | exit marker drawing | rocks-2 §6: `src/render/hud-exit.ts`, ring on the exit when on screen; ui-2 §1.1: `src/ui/hud.ts`, arrow above the exit, bob, label; modules-render-2 G7: "no draw spec" | Drawn in `src/ui/hud.ts` with ui-2 §1.1 placement, label `EXIT n m` and pulse. No `hud-exit.ts`, no ring. Smoothing (rocks-2 §6 step 5) and the 0.1 s distance update (step 6) keep their state in the registry `getResources().hud = { exitA, lastT, runId, dist, distT }`, never in a module `let`. | rocks-2 §6 header, step 7; modules-render-2 G7 → closed; [[architecture-resources]] §2 `Resources` type adds `hud` | first escape PR |
| R-061 | m | exit look-ahead key | rocks-2 §6 `T.hud.exitLookTiles` (default 4) not in tuning | Add `T.hud.exitLookTiles = 4`. | tuning §1.1, tuning-2 | first escape PR |
| R-062 | m | rock state additions | rocks §1 adds `world.pendingSig`, `director.escapeT`, `Rock.shrunk`; not in systems-4 §6 | Accepted; listed in [[architecture-rulings-2]] §9. | systems-4 §6 → pointer | first escape PR |
| R-063 | m | cosmetic dust at cap | rocks-2 §4: random visible floor tile from the cosmetic stream; render must not draw rng | `stepQuake` (L3) draws it and emits `rockLand a = 0`. Render never draws. | none | – |
| R-064 | m | monsters under rocks | rocks-2 §3 enters `dying` directly | Use `setDying(s, m)` (R-073 in part 2). | rocks-2 §3 | first escape PR |
| R-065 | m | `downhill` types | R1 §3.1, R2 §6 give no types (world C14) | `downhill(s: State, E: Int32Array, p0: number, maxTiles: number): number[]` (Int32 per R-103, [[architecture-scale-and-economy-4]] §1.2). | rocks §3.1 | first rocks PR |

## Related

- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-systems-2]]
- [[architecture-modules-render]]
- [[architecture-modules-render-2]]
- [[architecture-modules-ui-assets]]
- [[architecture-modules-ui-assets-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-resources]]
- [[architecture-resources-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-sprites-3]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-ui]]
- [[architecture-ui-2]]

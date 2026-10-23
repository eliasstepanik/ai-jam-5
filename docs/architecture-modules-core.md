---
type: architecture
title: Last Ember – Module Tree – Core
description: Authoritative src/core file list for Last Ember (layer L0) – every core file with status, responsibility, exported signatures copied from the State, determinism, scoring/save and tuning specs, allowed imports, size, hot-swap class, owner and slice; the src/checks files covering core; conflicts and gaps between specs and the global layer rule; required State additions.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-23T09:00:00+02:00
---

# Last Ember – Module Tree: Core

Hub: [[architecture]]. Spec (gameplay governs): [[last-ember-design]]. Sibling module trees: [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-render]], [[architecture-modules-ui-assets]]. Field-level truth stays in [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]; this file only says WHERE each piece lives. Where this file moves a symbol away from the path a spec names, the row is marked and the reason is in §5.

## 1. Layer rule (binding, applies to every module tree)

L0 `src/core` (types, constants, tuning, rng, math, ids, save/storage helpers that do not touch the DOM at import) → L1 `src/world`, `src/assets` (data-only registry) → L2 `src/entities` → L3 `src/systems` → L4 `src/render`, `src/audio`, `src/ui` → L5 `src/game.ts` facade. `src/main.ts` and `src/merge.ts` are host; game code imports them only with `import type`. A module imports only from lower layers or its own layer, without cycles (type-only cycles count as cycles). `src/checks/*` may import L0–L3 only and must not touch `document`, `window` or `import.meta.env` at import time.

Core-specific rules:

- No core file reads `document`, `window`, `location`, `history`, `localStorage` or `import.meta.env` at module top level. `src/core/storage.ts` touches storage only inside function bodies, inside `try`.
- Node ≥22.18 type stripping (`npm run check`): `.ts` extensions in every import, `import type` for types (`verbatimModuleSyntax`), no `enum`, `namespace` or parameter properties (`erasableSyntaxOnly`), no unused locals or types (`noUnusedLocals`). Source: repo `tsconfig.json`.
- Determinism guard covers `src/core` ([[architecture-determinism]] §6, §7): no `Math.random`, `Date.now`, `performance.now`, `crypto.` except `src/core/seed.ts`.

## 2. File list (summary)

Status: all core files are NEW (the repo has only `main.ts`, `merge.ts`, `check.ts`, `game.ts`). Kind: HS = hot-swappable (imported by `game.ts`, re-evaluated on save), CO = check-only, H = host. Owner area for every row: core. Slices: A = by Oct 20, B = by Oct 22, C = polish.

| Path | Status | Responsibility | Kind | Slice | ~Lines |
|---|---|---|---|---|---|
| `src/core/types.ts` | NEW | all State, entity, id, score and save TYPES; no runtime code | HS (erased) | A | 250 |
| `src/core/state.ts` | NEW | `STATE_VERSION`, shape constants, `MINERALS`, `init()`, `initPlayer()`, `flameOut()` | HS | A | 80 |
| `src/core/rng.ts` | NEW | mulberry32 `step32`, `fnv1a`, `hashSeed`, stored-stream and local-stream API | HS | A | 45 |
| `src/core/seed.ts` | NEW | seed text sanitising/parsing, `randomSeed()` (only `crypto` user) | HS | A | 25 |
| `src/core/tuning-types.ts` | NEW | `Tuning`, `Z4`, `MonsterTune`, `MineralTune` types (split from tuning.ts, C7) | HS (erased) | A | 75 |
| `src/core/tuning.ts` | NEW | the `T` object literal, `zt`, `deg` | HS | A | 230 |
| `src/core/math.ts` | NEW (proposed) | `clamp` (G1) | HS | A | 5 |
| `src/core/migrate.ts` | NEW | deep default `fill`, `migrate`, entity `DEFAULT_*` templates | HS | A | 110 |
| `src/core/score.ts` | NEW | depth metric, `computeScore`, `DEFAULT_BEST`, `DEFAULT_RESULT` (moved here, C1, C2) | HS | A | 70 |
| `src/core/storage.ts` | NEW | `localStorage` mirrors for best and settings, try/catch, injectable store (moved here, C4) | HS | B | 90 |
| `src/core/grid.ts` | PLANNED (D4, [[ADR-123-2-5d-view]]; contract in [[architecture-modules-render]] sibling table) | pure 2.5D helpers `floorVariant`, `faceKind`, `footRow`, `dirIndex` (moved out of L4 `src/render/keys.ts` so `src/checks/render.check.ts` can cover them under R-043) | HS | D | 40 |
| `src/merge.ts` | UNCHANGED | host: `mergeState(mod, old)` calls `migrate` when exported | H | – | 16 |
| `src/check.ts` | UNCHANGED | host check entry (`mergeState` asserts); check wiring is `src/checks/all.ts` (R-040) | CO | – | 35 |

Not created under core (decisions, see §5): `src/core/run.ts` (C3, moves to L3), `src/core/step.ts` (C5), an ids module (`s.meta.nextId++` inline, YAGNI), URL/seed-link helpers (they read `location`/`history`; they live in `src/ui/platform.ts` `platformStep`, R-003, [[architecture-determinism]] §5).

## 3. Per-file contracts

### 3.1 `src/core/types.ts` – types only

Spec: [[architecture-state]] §5–§8, [[architecture-state-2]] §1–§9, [[architecture-scoring-and-save]] §2, §5, §6. Imports: none. Erased at runtime; every importer uses `import type`.

Exports (exact shapes in the cited sections, copy verbatim):

- Ids ([[architecture-state]] §5): `MonsterKind`, `MineralId`, `FlameKind`, `PickupKind`, `Phase`, `Screen`, `Zone`, `TileCh`, `ParryGrade`, `TilePt`.
- Top level and player ([[architecture-state]] §6–§8): `State`, `Meta`, `Player`, `Swing`, `Parry`, `Roll`, `Mining`, `Stats`.
- World and entities ([[architecture-state-2]] §1–§6): `World`, `MonsterAi`, `Monster`, `Pickup`, `Vein`, `Rock`, `Director`, `Cam`.
- FX, rng, ui ([[architecture-state-2]] §7–§9): `FxEventKind`, `FxEvent`, `Fx`, `Rng`, `Toast`, `Ui`, `Settings`, `Debug`.
- Score and save ([[architecture-scoring-and-save]] §2, §5, §6; moved from `src/systems/score.ts` and `src/ui/storage.ts`, C1): `ScoreInput = { depth: number; won: boolean; seconds: number; mineralsUsed: number; hpLeft: number }`, `ScoreParts = { depth: number; win: number; time: number; minerals: number; hp: number; total: number }`, `RunResult`, `Best`, `SettingsRecord = { v: 1; volume: number; muted: boolean; lastSeed: string; reducedFlash: boolean; quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3' }` (R-025; `quality` default `'auto'`, any other stored value loads as `'auto'`, R-142).
- Generator types (R-150; shapes in [[architecture-modules-world]] §2 generate.ts): `CaveStats`, `CaveResult`, `GenOpts`, `CaveCore`, `SpawnHint`. Held here so `src/world/generate.ts`, `gen/populate.ts`, `gen/fallback.ts` and `validate.ts` share them without a type-only cycle; `generate.ts` re-exports them.

Why one file: `State` references `Best` and `RunResult`; keeping all types together avoids a type-only cycle with `score.ts`. Split by group (`types-entities.ts`) only if it passes 300 lines.

### 3.2 `src/core/state.ts`

Spec: [[architecture-state]] §3, §5, §6, §8; [[architecture-state-2]] §7, §9, §10. Imports: `import type` from `./types.ts`; `T` from `./tuning.ts`.

| Export | Signature / value | Spec |
|---|---|---|
| `STATE_VERSION` | `export const STATE_VERSION = 1` | [[architecture-state]] §6 |
| `MINERALS` | `export const MINERALS: readonly MineralId[] = ['sodium', 'copper', 'strontium']` | [[architecture-state]] §5 (state.ts option chosen, C17) |
| `TILE`, `MAP_W`, `MAP_H` | `32`, `320`, `240` | [[architecture-state]] §3, [[architecture-scale-and-economy]] §2.2 |
| `FX_EVENTS_MAX` | `32` | [[architecture-state-2]] §7 |
| `HELP_PAGES` | `3` | [[architecture-state-2]] §9 |
| `init` | `export function init(): State` | [[architecture-state-2]] §10 (body verbatim) |
| `initPlayer` | `initPlayer(): Player` (return type implied; "Default" column of [[architecture-state]] §8) | [[architecture-state-2]] §10 |
| `flameOut` | `export const flameOut = (p: Player): boolean => p.energy <= 0` | [[architecture-state]] §8 |

`TILE`, `MAP_W`, `MAP_H` are defined ONLY here; `src/world/grid.ts` (`TILE`) and `src/world/gen/macro.ts` (`MAP_W`, `MAP_H`) re-export them, never a second literal (review finding 19). Shape constants stay outside `T` on purpose: changing `MAP_W`/`MAP_H` needs a `STATE_VERSION` bump ([[architecture-state-3]] §2), so they are not live-tunable. `init()` stays pure and cheap: no cave generation, no storage, no draws.

### 3.3 `src/core/rng.ts`

Spec: [[architecture-determinism]] §2 (code verbatim). Imports: `import type { State } from './types.ts'`.

- `step32(a: number): [number, number]`
- `fnv1a(str: string): number`
- `hashSeed(seed: number, tag: string): number`
- `type StreamName = 'gameplay' | 'cosmetic'`
- `rand(s: State, name: StreamName): number`
- `randRange(s: State, n: StreamName, lo: number, hi: number): number`
- `randInt(s: State, n: StreamName, lo: number, hiIncl: number): number`
- `chance(s: State, n: StreamName, p: number): boolean`
- `pick<T>(s: State, n: StreamName, xs: readonly T[]): T`
- `type Rnd = { next: () => number; int: (lo: number, hiIncl: number) => number; state: () => number }`
- `makeRnd(seed: number): Rnd`

### 3.4 `src/core/seed.ts`

Spec: [[architecture-determinism]] §5, §6 rule 1. Imports: `fnv1a` from `./rng.ts`.

- `SEED_MAX_LEN = 32`
- `sanitizeSeedText(raw: string): string`
- `parseSeed(text: string): number`
- `randomSeed(): number`. The name and file are from §6 rule 1. The body is `crypto.getRandomValues(new Uint32Array(1))[0]` (§5). The return type is implied. This is the only `crypto` use, and it is allow-listed in the grep guard.

### 3.5 `src/core/tuning-types.ts` and `src/core/tuning.ts`

Spec: [[architecture-tuning]] §1 (shape), §1.3 (helpers), §2–§7 and [[architecture-tuning-2]] (values).

- `tuning-types.ts`: `export type Z4 = [number, number, number, number]`, `export type MonsterTune`, `export type MineralTune`, `export type Tuning`, all as in [[architecture-tuning]] §1.1. Imports: `import type { MonsterKind, FlameKind } from './types.ts'`.
- `tuning.ts`: `export const T = { ... } satisfies Tuning`, `export const zt = (v: Z4, zone: number): number => v[Math.min(4, Math.max(1, zone)) - 1]`, `export const deg = (d: number): number => (d * Math.PI) / 180`. Imports: `import type { Tuning, Z4 } from './tuning-types.ts'`. No other functions, no `as const`, nobody assigns into `T`. Re-export `export type { Tuning } from './tuning-types.ts'` so `[[architecture-tuning]]` callers keep one import path.

### 3.6 `src/core/math.ts` (proposed)

`export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))`. Callers named in the specs are `telegraph(m)` ([[architecture-state-2]] §2) and parry `u` ([[architecture-tuning]] §6). `tuning.ts` must not hold it (tuning §1: "no functions except zt, deg"). Imports: none. Add more helpers only when two callers need them.

### 3.7 `src/core/migrate.ts`

Spec: [[architecture-state-3]] §1–§3. Imports: `init`, `STATE_VERSION` from `./state.ts`; `DEFAULT_BEST`, `DEFAULT_RESULT` from `./score.ts`; `import type` from `./types.ts`.

| Export | Signature | Note |
|---|---|---|
| `fill` | `export function fill(def: unknown, old: unknown, path = ''): unknown` | apply C10 (clone defaults), C11 (drop `Json`) |
| `migrate` | `export function migrate(old: unknown): State` | re-exported by `src/game.ts` |
| `DEFAULT_MONSTER`, `DEFAULT_PICKUP`, `DEFAULT_VEIN`, `DEFAULT_ROCK`, `DEFAULT_FX_EVENT`, `DEFAULT_TOAST` | frozen objects, full field sets of `Monster`, `Pickup`, `Vein`, `Rock`, `FxEvent`, `Toast` | exported for the key-set check ([[architecture-state-3]] §7 #5) |

Internal, not exported: `isObj`, `ELEMENT_DEFAULTS`, `resetKeep(fresh: State, old: unknown): State`. `migrate` never mutates `old` and never reads Input, the DOM or storage.

### 3.8 `src/core/score.ts`

Spec: [[architecture-scoring-and-save]] §1, §2, §5, §6. Moved from `src/systems/depth.ts` and `src/systems/score.ts` (C1, C2). Imports: `import type` from `./types.ts`; `T` from `./tuning.ts`.

- `export const DEPTH_MAX = 40`
- `export function depthOf(dist: number, beaconDist: number): number`
- `export function zoneOfDepth(depth: number): Zone`
- `export function computeScore(i: ScoreInput): ScoreParts`. The body is the §2 formula, with weights read from `T.score` (C8).
- `export const DEFAULT_BEST: Best` (§6 literal verbatim)
- `export const DEFAULT_RESULT: RunResult`: every field zero, `false` or `''`, `zone: 1`, `parts` all `0` (§5).

`trackDepth(s)` stays in `src/systems/depth.ts` ([[architecture-modules-systems]]). `zoneAt(s, i)` in `src/world/caches.ts` (L1, R-046) imports `depthOf`/`zoneOfDepth` from here; so do `gen/pockets.ts`, `gen/populate.ts` and `validate.ts` (R-007, no `zoneOfDist`). That import is why these functions must be in L0.

### 3.9 `src/core/storage.ts`

Spec: [[architecture-scoring-and-save]] §6 (rules 1–6), [[architecture-state-2]] §9. Moved from `src/ui/storage.ts` (C4). Imports: `fill` from `./migrate.ts`; `DEFAULT_BEST` from `./score.ts`; `import type` from `./types.ts`.

| Export | Signature | Spec |
|---|---|---|
| `loadSettings` | `loadSettings(s: State, store?: Store): void` | §6 rule 2; `store` param is C14 |
| `loadBest` | `loadBest(s: State, store?: Store): void` | §6 rule 2 |
| `commitBest` | `commitBest(s: State, store?: Store): void` | §6 rule 4 |
| `saveSettings` | `saveSettings(s: State, store?: Store): void` (G2: §6 rule 5 has no name for it) | §6 rule 5 |
| `type Store` | `Pick<Storage, 'getItem' \| 'setItem'>` | C14 |

Module constants (not exported): `'last-ember:best'`, `'last-ember:settings'`. The default store resolves to `globalThis.localStorage` INSIDE the `try`, so a missing global becomes `storageOk = false` and never a crash. `Best.at` uses `new Date().toISOString()`, which is the storage I/O exception (C4).

## 4. Checks covering core

All are CO, slice A. They import L0–L3 only. No `node:` imports under `src/` (R-039): they use a local `ok(cond, msg)` and `JSON.stringify` equality; the grep guard lives in `scripts/check-guard.ts`. No shared helper module is needed except the input script.

| File | Status | Asserts | Demanded by |
|---|---|---|---|
| `src/checks/input.ts` | NEW | none. Exports `scriptedInput(k: number): Input`, with fresh `Set`s and `import type { Input } from '../main.ts'` | [[architecture-state-3]] §7 #2 |
| `src/checks/state.check.ts` | NEW | #1 `init()` is JSON-safe and round-trips. #2 the same after 600 scripted steps (tree walk: no `undefined`, `NaN`, `Infinity`, non-plain objects; C19). #3 `migrate` is idempotent on 7 inputs and fills defaults. #4 `migrate(midRun)` equals `midRun`. #5 `DEFAULT_*` key sets equal spawned entities. #6 JSON is under 300 000 chars ([[architecture-scale-and-economy-4]] §1.1) | [[architecture-state-3]] §7 |
| `src/checks/determinism.check.ts` | NEW | `fnv1a`/`step32`/`hashSeed` vectors. `rand` range and mean. Every row of the `parseSeed` table. `generateCave` purity and invariants. Sub-stream isolation. 1 800-step replay equality. Cosmetic isolation. Grep guard over `src/core`, `src/world`, `src/entities`, `src/systems`, `src/game.ts` (skip missing dirs with `existsSync`) | [[architecture-determinism]] §7 |
| `src/checks/score.check.ts` | NEW | §4 table equals `computeScore`. `depthOf` edges and monotonicity. `zoneOfDepth` boundaries. Fake store with a throwing `setItem` sets `storageOk = false` without throwing | [[architecture-scoring-and-save]] §7 |
| `src/checks/all.ts` | NEW | none itself: imports `run` from `state.check.ts`, `determinism.check.ts`, `score.check.ts` (and the world/systems checks), calls them in order, prints `checks ok`. Each `*.check.ts` exports `run(): void`, no side effect on import. `src/check.ts` stays UNCHANGED; `npm run check` = `node src/check.ts && node src/checks/all.ts && …` | R-040 |

Mid-run checks call `startRun` and the L3 step function, never `update` from `src/game.ts` (C6). They also set `s.settings.loaded = true` before stepping (C16).

## 5. Conflicts and gaps found

| Id | Side A (file § – says) | Side B (file § – says) | Wins | Exact edit |
|---|---|---|---|---|
| C1 | [[architecture-scoring-and-save]] §2, §6: `ScoreParts`/`computeScore` in `src/systems/score.ts`; `Best`/`DEFAULT_BEST` in `src/ui/storage.ts` | [[architecture-state-2]] §9 and [[architecture-state-3]] §3: `State.best`/`result` and core `migrate` need `Best`, `RunResult`, `DEFAULT_BEST`, `DEFAULT_RESULT` (L0 must not import L3/L4) | layer rule | scoring §2/§5/§6: types go to `src/core/types.ts`, runtime to `src/core/score.ts` |
| C2 | [[architecture-state-2]] §1: `zoneOf(dist)`, one-arg `depthOf(dist)` | [[architecture-scoring-and-save]] §1: `depthOf(dist, beaconDist)`, `zoneOfDepth(depth)` in `src/systems/depth.ts` | scoring names; location `src/core/score.ts` (L1 `zoneAt` needs it) | state-2 §1: change the text to `zoneOfDepth(depthOf(dist, beaconDist))`. scoring §1: change the file header to `src/core/score.ts` |
| C3 | [[architecture-state-2]] §10, scoring §5: `startRun`/`endRun` in `src/core/run.ts` | layer rule: they call `generateCave` (L1), `emit` (L3), `commitBest` | layer rule | move to `src/systems/run.ts` (L3). Edit state-2 §10, state-3 §6, scoring §5 and determinism §6 rule 1 ("called from startRun in src/systems/run.ts") |
| C4 | [[architecture-state-3]] §5, §6, scoring §6: `src/ui/storage.ts` | layer rule L0 "save/storage helpers"; `run.ts` (L3) must call `commitBest` | layer rule: `src/core/storage.ts` | edit those 3 paths. Determinism §6 rule 2: add "except `Best.at` in `src/core/storage.ts` (I/O, not simulation)" |
| C5 | [[architecture-state-3]] §6: clocks owned by `src/core/step.ts` (no API given) | layer rule: an orchestrator calling systems cannot be L0 | layer rule | no `core/step.ts`. The L3 sim step writes `meta.steps`/`meta.time` ([[architecture-modules-systems]]). Edit state-3 §6 row |
| C6 | state-3 §7 #2 and determinism §7 "update replay": the checks call `update` | layer rule: checks import L0–L3; `game.ts` is L5 | layer rule | checks call the L3 step that `game.ts` `update` delegates to (name owned by [[architecture-modules-systems]]). Edit both check rows |
| C7 | [[architecture-tuning]] §1: type and values in one `src/core/tuning.ts` | 300-line rule: type ~75 plus values ~230 | file rule | split the types into `src/core/tuning-types.ts`. Edit the "File:" line in tuning §1 |
| C8 | tuning §1.1: `T.score.{depthPts,winPts,timeCapS,mineralPts,hpPts}` | scoring §2: `computeScore` uses literals 100/1000/600/25/50 | one source: `computeScore` reads `T.score`. Values must equal the spec; `score.check` pins the table | scoring §2 code |
| C9 | state §8 / state-2 §2: `SWING_ACTIVE`…, `RING_MARGIN[kind]`, `LUNGE_CD_START[kind]`, `PERFECT_AT[kind]` | tuning §1: `T.*` names; `RING_MARGIN`/`LUNGE_CD_START` are not mapped explicitly | tuning: `T.monsters[kind].ringMarginPx`, `.lungeCdStartS`, `.contactS` | state-2 §2 spawn-default text. `FX_EVENTS_MAX` stays a `state.ts` const |
| C10 | state-3 §3 `fill`: `return def` for missing or mismatched slots | runtime: this hands shared or frozen `DEFAULT_*` (and `DEFAULT_RESULT.parts`) objects to live State, so mutation throws or aliases | fix | in `fill`, return `typeof def === 'object' && def !== null ? structuredClone(def) : def` on default paths. Idempotency is unchanged |
| C11 | state-3 §3: `type Json = ...` declared | `tsconfig.json` `noUnusedLocals`: an unused type fails `npm run build` | tsconfig | delete the `Json` line |
| C12 | state-2 §10 step 1: random seed "if text is empty" | determinism §5 table: "all chars stripped" also means random | determinism | `startRun` tests `sanitizeSeedText(seedText) === ''` and stores the sanitised text in `meta.seedText` |
| C13 | state-2 §10 step 7: `history.replaceState` listed inside `startRun` | the same step says it is "a host-side effect in the input handler"; checks run `startRun` in Node | input handler (`src/ui/screens.ts`) | move the call out of the `startRun` step list |
| C14 | scoring §6: `commitBest(s)`, no store parameter | scoring §7: the check needs a fake store with a throwing `setItem` | both: add optional `store?: Store` | scoring §6 signatures |
| C15 | scoring §6 rule 1: storage pushes a toast | state-3 §6: `ui.*` owned by `src/ui/screens.ts` | scoring | state-3 §6 row: add "`ui.storageOk` and the storage toast: `src/core/storage.ts`" |
| C16 | state-2 §9: first `update` calls `loadSettings`/`loadBest` | checks run in Node (no `localStorage`; newer Node warns) | checks stay pure | state-3 §7 #2: set `s.settings.loaded = true` after `startRun` |
| C17 | state §5: `MINERALS` in `types.ts` or `state.ts` | – | `state.ts` (keeps `types.ts` erasable-only) | none |
| C18 | state-3 §6: `rng.*` only through `rand*()` | state-2 §10 step 6: `startRun` seeds the streams directly | both | state-3 §6 row: add "plus seeding in `startRun`" |
| C19 | state-3 §7 #1: JSON round trip deep-equals the state | `node:assert` `deepStrictEqual` treats `-0` and `0` as different; JSON turns `-0` into `0` | tree walk plus `assert.deepEqual` (loose) | state-3 §7 #1/#2 wording |
| G1 | no spec names a math module; state-2 §2 and tuning §6 use `clamp` | – | proposal | `src/core/math.ts` `clamp` only |
| G2 | scoring §6 rule 5 does not name the settings save function | – | proposal | `saveSettings(s, store?)` |
| G3 | tuning §6: `parry.hitstopS` freeze | no State timer exists for it | State addition (§6) | add `fx.hitstop` |

## 6. State additions required

None of these needs a `STATE_VERSION` bump (all additive, [[architecture-state-3]] §2). Each one goes into `types.ts`, into its default (`init`/`initPlayer`/spawn), and into its `DEFAULT_*` template in the same edit.

| Field | Type, default | Demanded by | Writer |
|---|---|---|---|
| `player.swing.buffer` | `number` s, `0` | [[architecture-tuning]] §6 `swing.bufferS` | `src/systems/combat.ts` |
| `Pickup.size` | type per [[architecture-systems-4]] §6; `DEFAULT_PICKUP` must include it | [[architecture-tuning]] §4 `resin.largeE` | generator ([[architecture-modules-world]]) |
| `fx.hitstop` | `number` s, `0` (G3, proposal) | [[architecture-tuning]] §6 `parry.hitstopS` | `src/systems/fx.ts` |
| `Input.view: { w: number; h: number }` | host type, NOT State | [[architecture-state-3]] §9 Q1, [[architecture-host-changes]] §1 | `src/main.ts` |

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-systems-4]]
- [[architecture-host-changes]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-render]]
- [[architecture-modules-ui-assets]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[last-ember-review-world-vs-modules]]
- [[ADR-123-2-5d-view]]

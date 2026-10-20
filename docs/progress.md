---
type: reference
title: "Last Ember - Build Progress (2026-10-19)"
description: Build status of Last Ember synced to origin/master bd04c05 on 2026-10-19 - which plan tasks are done, partial or not started, merged PRs, remaining slice A work and critical path, deviations and rulings applied during the build, and open items for the owner.
tags: [project, ai-jam-5, progress, last-ember]
timestamp: 2026-10-19T22:30:00Z
---

# Last Ember - Build Progress (2026-10-19)

Status of the implementation compared with the plan in [[tasks]] and [[tasks-files]]. Source of the facts: git and GitHub state of `origin/master` at commit `bd04c05` on 2026-10-19. Task ids, owners and hour estimates come from [[tasks]]. Hub: [[index]].

## Snapshot

- **Date:** 2026-10-19. **Master:** `bd04c05`. 27 PRs merged (#1, #2, #4 to #29), no open PRs. #3 was closed without merging.
- **`src/game.ts` is still the scaffold demo** (74 lines, dot collector). **Nothing is playable yet.**
- **What exists vs what is wired:** the foundation (host, core types, state, rng, tuning, migration, score, checks chain), the world generation core (grid, collision, LOS, BFS, carving, macro layout, places, loops, caches, explored and sample queries), the monster base and the full set of A-slice systems below the step loop (fx, camera, intent, movement, explore, depth, light, flame, pickups, combat, monsters, ai-lurker, director), the asset catalogs and resource registry (`assets/sprites.ts`, `sounds.ts`, `resources.ts`) and the first render modules (`render/keys.ts`, `view.ts`, `flame.ts`, `quality.ts`) are on master. None of it is called from `game.ts` yet. Not on master: the step loop (`systems/step.ts`, `run.ts`, `screens.ts`), the rest of the render tree, the UI, the audio and the placeholder assets.
- **Slice A is due 2026-10-20.**

## Done

Task ids and file lists follow [[tasks]]. "K" = Kittingsl, "E" = Elias (eliasstepanik).

| Task | Files | PR | Author | Merge sha | Notes |
|---|---|---|---|---|---|
| A1 | `main.ts` host, `index.html` | #18 | E | f0e2e4a | `Input.view {w,h,dpr}`, primary-button clicks, `Blur` pseudo-key, `STEP_BUDGET_MS` 12, context menu suppressed. Browser check still open (see Open items). |
| A2 | `core/types.ts`, `core/tuning-types.ts`, `core/math.ts` | #6 | E | e370d49 | First foundation merge. |
| A3 | `core/state.ts`, `core/rng.ts`, `core/seed.ts`, `core/tuning.ts` | #7 | E | a08ac72 | `toast()` was added to `core/state.ts` later, in A26 (R-009). |
| A4 | `core/noise.ts`, `core/view.ts`, `checks/render.check.ts` | #8 | E | 61f4c68 | Pure modules, no State. |
| A5 | `core/migrate.ts`, `core/score.ts`, `scripts/check-guard.ts` | #11 | E | 9df08fc | `depthOf` and `zoneOfDepth` live in `core/score.ts` (R-007). |
| A6 | `checks/all.ts`, `checks/input.ts`, `checks/state.check.ts`, check chain in `package.json` | #13 | E | 4f3735e | `npm run check` runs `node src/check.ts && node src/checks/all.ts && node scripts/check-guard.ts` (the original scaffold check `src/check.ts` stays first). |
| A8 | `assets/sprites.ts` (109 lines), `assets/sounds.ts` (61), `assets/resources.ts` (145) | #28 | K | 19b6d82 | Sprite and sound catalogs; lazy resource registry that survives hot reload (`getResources()`, the perf ring lives there); actor-sheet helpers (eight north-first direction rows, frame counts from image width). Also added `checks/assets.check.ts` (78 lines, wired in `checks/all.ts`), which is not in the plan. CHANGELOG +1 line, README +2 lines. True merge commit. |
| A14 | `render/keys.ts` (38), `render/view.ts` (51), `render/flame.ts` (16), `render/quality.ts` (82) | #29 | E | bd04c05 | New directory `src/render`. `quality.ts` already holds the auto ladder pulled forward from C6 (see Deviations). |
| A18 | `world/grid.ts`, `world/collide.ts`, `world/los.ts` | #10 | K | 1a45469 | Also brought `caches.getSolid` forward from A22. Also added `scripts/check-a18.ts` (181 lines), which is not in the plan. |
| A19 | `world/explored.ts`, `world/sample.ts`, `checks/world.check.ts` | #21 | K | 3b00021 | `world.check` wired in `checks/all.ts`. |
| A20 | `world/bfs.ts`, `world/gen/carve.ts`, `world/gen/region.ts`, `world/gen/ca.ts` | #14 | K | 7146339 | |
| A21 | `world/gen/macro.ts`, `world/gen/places.ts`, `world/gen/loops.ts` | #17 | K | aeab2a4 | |
| A23 | `entities/monster.ts`, `entities/steer.ts` | #16 | K | 3d2c39f | `devourerMul` was added later in #23 (see A24). |
| A24 | Part 1: `systems/fx.ts`, `systems/camera.ts`. Part 2: `systems/depth.ts`, `systems/light.ts` | #9, #23 | E | 45e3231, e172e63 | Part 2 also added `devourerMul` to `entities/monster.ts`, pulled forward from C1. Kittingsl still has to review that hunk. |
| A25 | Part 1: `systems/intent.ts`, `systems/movement.ts`. Part 2: `systems/explore.ts` | #19, #23 | E | 71cbb64, e172e63 | `stepExplore` uses `flameRadius` (R-145). |
| A26 | `systems/flame.ts`, `systems/pickups.ts` | #15 | E | 7b23ee9 | `toast()` lives in `core/state.ts` (R-009); there is no `systems/toast.ts`. |
| A27 | Part 1: `systems/combat.ts` (`parryLoss`, `hurtPlayerHp`, `tickPlayerTimers`, `stepSwing`). Part 2: `resolveParries`, `resolveBites`, `damagePlayer` in the same file (now 155 lines) | #22, #27 | E | f259a9f, 41ae142 | Part 2 needed A28 (`setDying`, `toRecover`); `monsters.ts` never imports `combat.ts`. Defaults and call order: see Deviations. |
| A28 | `systems/monsters.ts` (248 lines), `systems/ai-lurker.ts` (40), `systems/director.ts` (70) | #26 | E | 2a0cbb9 | Lurker brain only; see Deviations for the simplifications. |

Docs and CI PRs (no plan task):

| PR | Title | Author | Merge sha |
|---|---|---|---|
| #1 | docs: README, AGENTS, CHANGELOG, CI | E | c3a684a |
| #2 | ci: GARM scale set | E | ebe3e23 |
| #4 | docs: project plan snapshot | E | b16ff6b |
| #5 | docs: rebalance task ownership | E | 2d0897b |
| #12 | docs: player animation delivery contract | K | 2fcf8b5 |
| #24 | docs: 64x64 enemy animations in eight authored directions (R-155 in architecture-rulings-3.md; 11 spec files) | K | 1060108 |

## Partial

- **A22 (K): PARTIAL.** On master via #20 (`d39b7a6`): `world/generate.ts` with `caveSeed`, `carveCore` and `MAX_ATTEMPTS` (the terrain attempts), and `world/caches.ts` with `getSolid`, `getDepthField`, `getZoneField`, `zoneAt`, `getBeaconRoom`, `isBeaconRoom`, `pathDistAt` and related derived caches, plus a BFS performance change. Still missing: the populated generator wrapper `generateCave`, the cave-result memo helper and `src/checks/caves.ts`. Per Kittingsl's CHANGELOG line, the wrapper and the memo helper are deferred to B4-B6. This status is to be confirmed by Kittingsl. A29 needs the populated cave.

## Not started

Nothing in these lists is on master. Slice A items carry an owner; the full plan is in [[tasks]].

**Slice A**

- Elias: A15 (render tiles, memory, props), A16 (render light, entities, glow), A17 (render index), A29 (`run.ts`, `screens.ts`, `step.ts`), A30 (`game.ts` facade).
- Kittingsl: A7 (determinism and score checks), A9, A10 (assets), A11, A12, A13 (UI), A31, A32 (systems checks), the rest of A22.

**Slice B (due 2026-10-22)**

- Elias: B1, B2, B3, B7, B8, B9, B10, B17, B18.
- Kittingsl: B2a, B4, B5, B6, B11, B12, B13, B14, B15, B16, B19, B20.

**Slice C**

- Elias: C1, C2, C6.
- Kittingsl: C3, C4, C5, C7, C8.

Also absent from master: in `src/render`, everything except `keys`, `view`, `flame` and `quality` (no tiles, memory, props, light, entities, glow, index); `src/ui` and `src/audio` entirely; in `src/assets`, everything except `sprites`, `sounds` and `resources` (no placeholders, images, atlas); `systems/run.ts`, `screens.ts`, `step.ts`; `core/storage.ts`; `world/route.ts`; `world/validate.ts`; `world/gen/populate.ts`, `pockets.ts`, `teach.ts`, `fallback.ts`; and the checks of A7, A31, A32 and slice B (including `src/checks/caves.ts`).

## Remaining slice A and critical path

Slice A is due **2026-10-20**. The hours below are the **estimates** from the task table in [[tasks]]. They are full-task estimates; the done part of A22 is not subtracted.

| Owner | Remaining tasks | Estimate |
|---|---|---|
| Elias | A15 3 h, A16 3.5 h, A17 1 h, A29 2.5 h, A30 1.5 h | 11.5 h |
| Kittingsl | A7 1.5 h, A9 3 h, A10 2 h, A11 2.5 h, A12 2.5 h, A13 1.5 h, rest of A22 (2.5 h in total), A31 2.5 h, A32 3 h | 21.0 h |

Done so far, by plan estimates: **Elias 21.0 h** (A1 1 + A2 1.5 + A3 2 + A4 1 + A5 2 + A6 2 + A24 1.5 + A25 1.5 + A26 1.5 + A27 2 + A28 3 + A14 2). **Kittingsl 11.5 h** (A18 1.5 + A19 2 + A20 2 + A21 3 + A23 1 + A8 2) plus part of A22.

**Critical path:** A29 (waits for the populated `generateCave` of Kittingsl's A22) -> A15-A17 -> A30. A15 needs A9 (A8 is done), A17 needs A12 and A13. See the Cross-person critical path section in [[tasks]].

## Deviations and decisions made during the build

Rulings are in [[architecture-rulings]], [[architecture-rulings-2]] and [[architecture-rulings-3]]; the system specs are [[architecture-systems]], [[architecture-systems-3]] and [[architecture-systems-4]].

- **R-009:** `toast()` lives in `core/state.ts`. There is no `systems/toast.ts`. `stepMinerals` and the `ui.denyT` write are deferred to B7.
- **R-012:** `moveCircle` and `isSolidTile` exist only in `world/collide.ts` and `world/grid.ts`. `movement.ts` does not re-export them.
- **R-013:** only `lineOfSight` exists; there is no `losTiles`.
- **R-131:** the aim zoom is `viewZoomCss(h, dpr)`.
- **R-144:** `baseRadius(e, eMax = T.flame.energyMax)` is used instead of the one-argument form in modules-systems S8.
- **R-145:** `stepExplore` uses `flameRadius`.
- **R-148:** `hurtPlayerHp(s, 'bite' | 'rock')`.
- **R-127 owner ruling, 2026-10-19:** the `1e-9` epsilon (`x + 1e-9 >= limit`) covers ALL accumulated-time countdowns, not only the hold progress: `hurtT > 1e-9` in `damagePlayer` rule 3 and in `hurtPlayerHp`, the swing cooldown and buffer in `stepSwing` (30 x 1/60 leaves a residue of 1.04e-16), the future roll cooldown and roll invuln (the epsilon goes into B8 `stepRoll`) and any similar timer. The rule text is in [[architecture-rulings-3]].
- **R-075 Brain signature:** the brain type is `(s, m)` with a constant 1/60 orbit step (A28).
- **Lurker-only brain table (A28):** stalker and devourer use the lurker brain through a fallback until B3/C1. A stalker never attacks until B3, because only B3's behind-angle logic raises `behindT`.
- **`stepDirector` is descent only (A28):** the escape director table comes with B3/B8.
- **`devourerMul` is queried on every `lightRadius` call,** not computed once per step.
- **`findSpawn` is a local loop in `monsters.ts`,** because `sampleSpawn` cannot apply the path-distance rule.
- **Windup event `a` is the 0-based beat index** (R-130).
- **A27 part 2 defaults:** the early parry window skips when `delta + 1e-9 < -earlyMaxS`; `flameOut` in `resolveParries` fires only when the parry actually took energy; `damagePlayer` returns early for a dying shade. Call order for A29: `stepSwing`, `stepMonsters`, `resolveParries`, `resolveBites`, `tickPlayerTimers`.
- **A14 pulled the quality auto ladder forward from C6** (fully specified in render-3 section 3.3): 120-frame window, 18.5 / 12 ms thresholds, 2 windows down and 5 up, 3 s cool-down, 30 Hz exemption, `dprCap` via `globalThis.__lastEmberDprCap`. The host read of `dprCap` needs the still-open `main.ts` change Q1. C6 drops the ladder.
- **`perf.pass` reserved key `'@'`** holds the previous mark timestamp. The debug overlay (C15) must skip it.
- **A8 added `checks/assets.check.ts`,** which is not in the plan (like `scripts/check-a18.ts`).
- **R-007:** `depthOf` and `zoneOfDepth` live in `core/score.ts`, not in `systems/depth.ts`.
- **`devourerMul` pulled forward from C1** into `entities/monster.ts` (done in #23, A24 part 2). This closes open question 8 of [[tasks]] (E adds it; K reviews the hunk).
- **A18 brought `caches.getSolid` forward from A22** and added `scripts/check-a18.ts`, which is not in the plan.
- **A24 and A27 dependency rows** in [[tasks]] were corrected in an earlier sync (see its Change log).
- Kittingsl's #24 edited the repo snapshot directly; the edits were back-synced into the KB on 2026-10-18 (precedent #12).

## Open items for the owner

- Invitation for cedricsdesign (write) is pending.
- Kittingsl still has to review the `devourerMul` hunk in `entities/monster.ts`.
- Decide whether `src/checks/assets.check.ts` stays.
- Decide whether `scripts/check-a18.ts` stays or is folded into `world.check`.
- `AGENTS.md` says the docs manifest has 68 files; it now has 69. `AGENTS.md` is a protected path, so the fix is a follow-up PR.
- Test gaps for Kittingsl's A31/A32 checks (from the A28 and A14 retrospects): stuck relocate timing, `stuckFrac`, `lungeRangePx` for stalker and devourer; quality ladder thresholds 18.5 / 12 ms, the vsync30 work limit, `VIG_STEP`, the top mask bucket.
- A16 follow-up: `inView` has no 48 px entity margin (render-2 section 2.3); A16 adds it or `inView` gets a pad argument.
- C15 follow-up: the debug overlay must skip the `'@'` key of `perf.pass`.
- C6 scope drop: the quality auto ladder is already in A14 (#29); update the C6 estimate when C6 starts.
- Fix the modules-systems S7 and S8 drift in the KB (`losTiles` is gone, `baseRadius` has a second parameter).
- Decide who produces the AI art and music ([[architecture-assets-pipeline-2]]).
- Rule on the event-noise conflict (determinism section 3 vs render-2 section 4) before B18.
- KB follow-ups: `genPending` and `genAttempt` in state-2 section 9 and rulings-2 section 9; the stale `init()` literal in state-2 section 10; `wrapPi` and `segDist` in modules-core section 3.6.
- Compare the runner labels in `AGENTS.md` and `README.md` with `ci.yml`.
- Run the browser check of A1: `npm run dev`, no right-click menu, console shows `[hmr] game.ts swapped, state kept`.
- Questions already in [[last-ember-open-questions]] stay open there.

## Related

- [[tasks]]
- [[tasks-files]]
- [[index]]
- [[architecture]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-systems]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-assets-pipeline-2]]
- [[last-ember-open-questions]]

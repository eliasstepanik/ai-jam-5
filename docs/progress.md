---
type: reference
title: "Last Ember - Build Progress (2026-10-18)"
description: Build status of Last Ember synced to origin/master 1060108 on 2026-10-18 - which plan tasks are done, partial or not started, merged PRs, remaining slice A work and critical path, deviations and rulings applied during the build, and open items for the owner.
tags: [project, ai-jam-5, progress, last-ember]
timestamp: 2026-10-18T19:30:00Z
---

# Last Ember - Build Progress (2026-10-18)

Status of the implementation compared with the plan in [[tasks]] and [[tasks-files]]. Source of the facts: git and GitHub state of `origin/master` at commit `1060108` on 2026-10-18. Task ids, owners and hour estimates come from [[tasks]]. Hub: [[index]].

## Snapshot

- **Date:** 2026-10-18. **Master:** `1060108`. 23 PRs merged (#1, #2, #4 to #24), no open PRs. #3 was closed without merging.
- **`src/game.ts` is still the scaffold demo** (74 lines, dot collector). **Nothing is playable yet.**
- **What exists vs what is wired:** the foundation (host, core types, state, rng, tuning, migration, score, checks chain), the world generation core (grid, collision, LOS, BFS, carving, macro layout, places, loops, caches, explored and sample queries), the monster base and the player-side systems (fx, camera, intent, movement, explore, depth, light, flame, pickups, part of combat) are on master. None of it is called from `game.ts` yet. The step loop (`systems/step.ts`, `run.ts`, `screens.ts`), the render tree, the UI, the audio and the assets are not on master.
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
| A18 | `world/grid.ts`, `world/collide.ts`, `world/los.ts` | #10 | K | 1a45469 | Also brought `caches.getSolid` forward from A22. Also added `scripts/check-a18.ts` (181 lines), which is not in the plan. |
| A19 | `world/explored.ts`, `world/sample.ts`, `checks/world.check.ts` | #21 | K | 3b00021 | `world.check` wired in `checks/all.ts`. |
| A20 | `world/bfs.ts`, `world/gen/carve.ts`, `world/gen/region.ts`, `world/gen/ca.ts` | #14 | K | 7146339 | |
| A21 | `world/gen/macro.ts`, `world/gen/places.ts`, `world/gen/loops.ts` | #17 | K | aeab2a4 | |
| A23 | `entities/monster.ts`, `entities/steer.ts` | #16 | K | 3d2c39f | `devourerMul` was added later in #23 (see A24). |
| A24 | Part 1: `systems/fx.ts`, `systems/camera.ts`. Part 2: `systems/depth.ts`, `systems/light.ts` | #9, #23 | E | 45e3231, e172e63 | Part 2 also added `devourerMul` to `entities/monster.ts`, pulled forward from C1. Kittingsl still has to review that hunk. |
| A25 | Part 1: `systems/intent.ts`, `systems/movement.ts`. Part 2: `systems/explore.ts` | #19, #23 | E | 71cbb64, e172e63 | `stepExplore` uses `flameRadius` (R-145). |
| A26 | `systems/flame.ts`, `systems/pickups.ts` | #15 | E | 7b23ee9 | `toast()` lives in `core/state.ts` (R-009); there is no `systems/toast.ts`. |

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
- **A27 (E): PARTIAL.** Part 1 is on master via #22 (`f259a9f`): `systems/combat.ts` with `parryLoss`, `hurtPlayerHp`, `tickPlayerTimers` and `stepSwing`. Part 2 (`resolveParries`, `resolveBites`, `damagePlayer`) waits for A28, because it needs `setDying` and `toRecover`, and `monsters.ts` must never import `combat.ts`.

## Not started

Nothing in these lists is on master. Slice A items carry an owner; the full plan is in [[tasks]].

**Slice A**

- Elias: A14, A15, A16, A17 (render), A28 (`monsters.ts`, `ai-lurker.ts`, `director.ts`), A29 (`run.ts`, `screens.ts`, `step.ts`), A30 (`game.ts` facade), A27 part 2.
- Kittingsl: A7 (determinism and score checks), A8, A9, A10 (assets), A11, A12, A13 (UI), A31, A32 (systems checks), the rest of A22.

**Slice B (due 2026-10-22)**

- Elias: B1, B2, B3, B7, B8, B9, B10, B17, B18.
- Kittingsl: B2a, B4, B5, B6, B11, B12, B13, B14, B15, B16, B19, B20.

**Slice C**

- Elias: C1, C2, C6.
- Kittingsl: C3, C4, C5, C7, C8.

Also absent from master: everything under `src/render`, `src/ui`, `src/audio` and `src/assets`; `core/storage.ts`; `world/route.ts`; `world/validate.ts`; `world/gen/populate.ts`, `pockets.ts`, `teach.ts`, `fallback.ts`; and the checks of A7, A31, A32 and slice B (including `src/checks/caves.ts`).

## Remaining slice A and critical path

Slice A is due **2026-10-20**. The hours below are the **estimates** from the task table in [[tasks]]. They are full-task estimates; the done part of A22 and A27 is not subtracted.

| Owner | Remaining tasks | Estimate |
|---|---|---|
| Elias | A27 part 2 (A27 is 2 h in total), A28 3 h, A29 2.5 h, A14 2 h, A15 3 h, A16 3.5 h, A17 1 h, A30 1.5 h | 18.5 h |
| Kittingsl | A7 1.5 h, A8 2 h, A9 3 h, A10 2 h, A11 2.5 h, A12 2.5 h, A13 1.5 h, rest of A22 (2.5 h in total), A31 2.5 h, A32 3 h | 23.0 h |

Done so far, by plan estimates: **Elias 14.0 h** (A1 1 + A2 1.5 + A3 2 + A4 1 + A5 2 + A6 2 + A24 1.5 + A25 1.5 + A26 1.5) plus part 1 of A27. **Kittingsl 9.5 h** (A18 1.5 + A19 2 + A20 2 + A21 3 + A23 1) plus part of A22.

**Critical path:** A28 -> A29 -> A14-A17 -> A30. A29 also needs the populated cave from Kittingsl's A22. Kittingsl's UI and asset tasks gate Elias's render work: A15 needs A8 and A9, A17 needs A12 and A13. See the Cross-person critical path section in [[tasks]].

## Deviations and decisions made during the build

Rulings are in [[architecture-rulings]], [[architecture-rulings-2]] and [[architecture-rulings-3]]; the system specs are [[architecture-systems]], [[architecture-systems-3]] and [[architecture-systems-4]].

- **R-009:** `toast()` lives in `core/state.ts`. There is no `systems/toast.ts`. `stepMinerals` and the `ui.denyT` write are deferred to B7.
- **R-012:** `moveCircle` and `isSolidTile` exist only in `world/collide.ts` and `world/grid.ts`. `movement.ts` does not re-export them.
- **R-013:** only `lineOfSight` exists; there is no `losTiles`.
- **R-131:** the aim zoom is `viewZoomCss(h, dpr)`.
- **R-144:** `baseRadius(e, eMax = T.flame.energyMax)` is used instead of the one-argument form in modules-systems S8.
- **R-145:** `stepExplore` uses `flameRadius`.
- **R-148:** `hurtPlayerHp(s, 'bite' | 'rock')`.
- **R-127 DEFAULT extension:** the `1e-9` epsilon is also applied to the swing cooldown and the click buffer in `stepSwing`. 30 x 1/60 leaves a residue of 1.04e-16. The epsilon is applied in `stepSwing` only (swing end, cooldown, buffer). Other countdowns, for example `hurtT > 0` for the 0.4 s flame-hit i-frame in A27 part 2 and the future roll cooldown (1.5 s), have the same float residue and would lag one step if left uncovered. Open owner decision: rule that R-127 covers all countdowns before A27 part 2 and B8.
- **R-007:** `depthOf` and `zoneOfDepth` live in `core/score.ts`, not in `systems/depth.ts`.
- **`devourerMul` pulled forward from C1** into `entities/monster.ts` (done in #23, A24 part 2). This closes open question 8 of [[tasks]] (E adds it; K reviews the hunk).
- **A18 brought `caches.getSolid` forward from A22** and added `scripts/check-a18.ts`, which is not in the plan.
- **A24 and A27 dependency rows** in [[tasks]] were corrected in this sync (see its Change log).
- Kittingsl's #24 edited the repo snapshot directly; the edits were back-synced into the KB on 2026-10-18 (precedent #12).

## Open items for the owner

- Invitation for cedricsdesign (write) is pending.
- Kittingsl to review the `devourerMul` hunk in `entities/monster.ts`.
- Decide whether R-127 extends to all countdowns.
- Fix the modules-systems S7 and S8 drift in the KB (`losTiles` is gone, `baseRadius` has a second parameter).
- Decide who produces the AI art and music ([[architecture-assets-pipeline-2]]).
- Rule on the event-noise conflict (determinism section 3 vs render-2 section 4) before B18.
- KB follow-ups: `genPending` and `genAttempt` in state-2 section 9 and rulings-2 section 9; the stale `init()` literal in state-2 section 10; `wrapPi` and `segDist` in modules-core section 3.6.
- Compare the runner labels in `AGENTS.md` and `README.md` with `ci.yml`.
- Decide whether `scripts/check-a18.ts` stays or is folded into `world.check`.
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

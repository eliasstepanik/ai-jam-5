---
type: reference
title: "Last Ember - Build Progress (2026-10-22)"
description: Build status of Last Ember synced to origin/master f738703 on 2026-10-22 (A29 merged) - which plan tasks are done, partial, in progress or not started, merged PRs, remaining slice A work and critical path, deviations and rulings applied during the build, and open items for the owner.
tags: [project, ai-jam-5, progress, last-ember]
timestamp: 2026-10-22T19:00:00Z
---

# Last Ember - Build Progress (2026-10-22)

Status of the implementation compared with the plan in [[tasks]] and [[tasks-files]]. Source of the facts: git and GitHub state of `origin/master` at commit `f738703` on 2026-10-22 (includes A29, merged as #39 and #40). Task ids, owners and hour estimates come from [[tasks]]. Hub: [[index]].

## Snapshot

- **Date:** 2026-10-22. **Master:** `f738703`. 39 PRs merged (#1, #2, #4 to #40), no open PRs at the time of the check. #3 was closed without merging.
- **A29 (step loop) is merged:** #39 (`81f766b`, `systems/run.ts`, `screens.ts`, `step.ts` and three checks) and the follow-up #40 (`f738703`). See Done.
- **`src/game.ts` is still the scaffold demo** (74 lines, dot collector, checked on master). **Nothing is playable yet.**
- **What exists vs what is wired:** the foundation (host, core types, state, rng, tuning, migration, score, checks chain), the world generation core (grid, collision, LOS, BFS, carving, macro layout, places, loops, caches, explored and sample queries, and since the cave generator chain C1-C4 (#35 to #38) also pockets, teach, populate, validate, fallback, `generateCave` and the cave checks), the monster base and the full set of A-slice systems including the step loop (fx, camera, intent, movement, explore, depth, light, flame, pickups, combat, monsters, ai-lurker, director, and since A29 run, screens, step), the asset catalogs and resource registry (`assets/sprites.ts`, `sounds.ts`, `resources.ts`), the procedural placeholder art (`assets/placeholders-actors.ts`, `-world.ts`, `-ui.ts` from A9) and the first render modules (`render/keys.ts`, `view.ts`, `flame.ts`, `quality.ts`, plus the draw passes `light.ts`, `glow.ts`, `entities.ts` from A16) are on master. The render passes are on master but unwired: nothing consumes them until `render/index.ts` (A17). None of it is called from `game.ts` yet, including the step loop (`step` is not called until A30). Not on master: the rest of the render tree, the UI, the audio, the images and the atlas.
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
| A16 | `render/light.ts` (169 lines), `render/glow.ts` (166), `render/entities.ts` (215) | #31 | E | 1d02b08 | Passes: `drawDarkness` (14), `drawMonsters` (10), `drawPlayer` (11), `drawEyes` (16, in `glow.ts`), `drawGlow` (17), `torchTip`. Medium tier, 2 chunks; retrospect found 1 major (escape darkness fade unreachable); quality gate `@ultrathink` 68/100 then 96/100 (PASS, 2 of 3 invocations); 129 behaviour mutants caught. Nothing consumes the passes until A17; missing art draws nothing (A15 and A9/A10 are not on master). |
| A9 | `assets/placeholders-actors.ts` (226 lines), `placeholders-world.ts` (220), `placeholders-ui.ts` (108) | #33 | E | 0350025 | The task is K's in the plan; E built it at the owner's request. 45 ids / 314 anims / 1064 frames = the `SPRITES` manifest. `DrawFn` is declared in `placeholders-actors.ts` and re-exported by `placeholders-ui.ts` (R-150 cycle rule). Medium tier, retrospect clean (3 chunks incl. one empty-result retry), no gate. **A10 integration note:** placeholders draw in world units at scale 1, while `render/entities.ts` `drawFrame` scales 64 px sources by 0.5 / monster scale. So `drawSprite` must call `PLACEHOLDERS[id]` directly at scale 1 when no atlas rect exists; the hit-flash tint path needs its own placeholder branch; beacon charge uses `frame = floor(progress*4)`. Minor: devourer lunge stretch 5% (20% would fit), a mid-line `;` in `placeholders-world.ts`, `spec_entrance` without the additive r=48 circle. |
| A18 | `world/grid.ts`, `world/collide.ts`, `world/los.ts` | #10 | K | 1a45469 | Also brought `caches.getSolid` forward from A22. Also added `scripts/check-a18.ts` (181 lines), which is not in the plan. |
| A19 | `world/explored.ts`, `world/sample.ts`, `checks/world.check.ts` | #21 | K | 3b00021 | `world.check` wired in `checks/all.ts`. |
| A20 | `world/bfs.ts`, `world/gen/carve.ts`, `world/gen/region.ts`, `world/gen/ca.ts` | #14 | K | 7146339 | |
| A21 | `world/gen/macro.ts`, `world/gen/places.ts`, `world/gen/loops.ts` | #17 | K | aeab2a4 | |
| A22 | First part: `world/generate.ts`, `world/caches.ts`. Rest: `generateCave`, `finalizeCave`, `world/gen/fallback.ts`, `src/checks/caves.ts` (cave generator chain C1-C4) | #20; #35 to #38 | K (first part), E (rest) | d39b7a6; a8e4207, b64c59b, 133e047, df9b558 | Complete on master. First part via #20: `world/generate.ts` with `caveSeed`, `carveCore` and `MAX_ATTEMPTS` (the terrain attempts), and `world/caches.ts` with `getSolid`, `getDepthField`, `getZoneField`, `zoneAt`, `getBeaconRoom`, `isBeaconRoom`, `pathDistAt` and related derived caches, plus a BFS performance change. The rest was finished by E (the task stays K-listed in [[tasks]]) through chunks C1-C4 (#35 to #38, see the cave generator chain below): `generateCave` (`world/generate.ts:77`), `finalizeCave` (`generate.ts:69`), `fallbackCave` (`world/gen/fallback.ts:62`) and `src/checks/caves.ts`. A cave-result memo helper exists on master only as a check-only helper: `caveOf(seed)` (`src/checks/caves.ts:9`) memoises `generateCave`, and `primeCave` (`caves.ts:17`) seeds that memo; both are used only by files under `src/checks/` (grep of `src`, 2026-10-22). No game-side memo helper exists, and none is needed so far, because the chunked game path in `run.ts` (A29, merged) passes the finished cave to `startRun`. Kittingsl has still to confirm the status. |
| A23 | `entities/monster.ts`, `entities/steer.ts` | #16 | K | 3d2c39f | `devourerMul` was added later in #23 (see A24). |
| A24 | Part 1: `systems/fx.ts`, `systems/camera.ts`. Part 2: `systems/depth.ts`, `systems/light.ts` | #9, #23 | E | 45e3231, e172e63 | Part 2 also added `devourerMul` to `entities/monster.ts`, pulled forward from C1. Kittingsl still has to review that hunk. |
| A25 | Part 1: `systems/intent.ts`, `systems/movement.ts`. Part 2: `systems/explore.ts` | #19, #23 | E | 71cbb64, e172e63 | `stepExplore` uses `flameRadius` (R-145). |
| A26 | `systems/flame.ts`, `systems/pickups.ts` | #15 | E | 7b23ee9 | `toast()` lives in `core/state.ts` (R-009); there is no `systems/toast.ts`. |
| A27 | Part 1: `systems/combat.ts` (`parryLoss`, `hurtPlayerHp`, `tickPlayerTimers`, `stepSwing`). Part 2: `resolveParries`, `resolveBites`, `damagePlayer` in the same file (now 155 lines) | #22, #27 | E | f259a9f, 41ae142 | Part 2 needed A28 (`setDying`, `toRecover`); `monsters.ts` never imports `combat.ts`. Defaults and call order: see Deviations. |
| A28 | `systems/monsters.ts` (248 lines), `systems/ai-lurker.ts` (40), `systems/director.ts` (70) | #26 | E | 2a0cbb9 | Lurker brain only; see Deviations for the simplifications. |
| A29 | `systems/run.ts` (130 lines: `startRun(s, seedText, cave?)`, `endRun`, `checkEnd`, `genStep`, `runSeedText`), `systems/screens.ts` (126: `stepScreens` state machine), `systems/step.ts` (54: fixed step D0-D18); checks `checks/run.check.ts` (277), `step.check.ts` (287), `screens.check.ts` (300), wired in `checks/all.ts` (34) | #39, #40 | E | 81f766b, f738703 | High tier. #39 was squash-merged as one commit (`81f766b`; the branch had about two dozen WIP commits per the build log, a count that cannot be re-verified after the branch deletion). The squash changed 8 files (7 in `src` plus `CHANGELOG.md`), 1179 insertions per `git diff --shortstat df9b558..81f766b -- src CHANGELOG.md`. Independent retrospects with 148 behaviour mutants: 118 killed, 10 equivalent, 20 gaps closed by the final check strengthening. Quality gates for #39: 92 and 92 (`@ultrathink`), final 95 (`@ultrathink-high`). #40 = follow-up nits F3, F4 and F7 plus related cleanups (first Quit press on the paused screen emits `uiConfirm` per ui section 5 rule 7; check exports renamed to `run` and aliased in `all.ts`; ponytail note on `DT`; `KeyC` on help asserted silent); gate 97 (`@ultrathink`). `npm run check` about 9.2 s. R-172 (hitstop runs `tickFx`) is OWNER-confirmed 2026-10-22. Rulings R-166..R-177 in [[architecture-rulings-3]] section 8 (see Deviations). Not wired by design: storage calls wait for B7 (R-168), slice-B step calls are index comments in `step.ts` (R-169), hit testing waits for A30/A11 (R-170). `step` is not called from `game.ts` until A30. |

**A29 details kept from the branch phase** (merged: #39 `81f766b`, #40 `f738703`; no PR is open at the time of the check):

- Timing: `npm run check` about 9.2 s; `run()` takes about 1.0-1.45 s against its 1.6 s ceiling (little margin at the top of that range, see Open items).
- Verification (#39): findings fixed after gates 1 and 2 (CHANGELOG, `endRun` `result.zone`, volume guard, `lastSeed` sanitising, exact asserts, R-166/R-175 wording); retrospect at the final #39 HEAD clean (`tsc`, `npm run check` 9.2 s, build, manifest 69/69, 12/12 sampled mutants killed).
- Deferred or not wired (open items): storage calls wait for B7, so `prevBest` is 0 and settings are not persisted until then (R-168); the slice-B step calls `stepRoll` (B8), `eStart` + `stepMining` + `stepBeacon` (B1), `stepMinerals` (B7) and `stepQuake` (B2) are marked by index comments in `step.ts`, and each task adds its own call (R-169); hit testing: a click activates the focused menu item wherever it lands, until A30/A11 set `ui.cursor`/`ui.hover` from `hit()` before step (R-170, owner decision); hitstop runs `tickFx` (R-172, OWNER-confirmed 2026-10-22); `startRun` keeps `ui.seedInput` (R-173); all input is ignored while generation is pending, including `KeyM` (R-174); stale rows of architecture-systems section 2 (R-175).

**Cave generator chain (C1-C4 merged, built by E at the owner's request).** Owner decision 2026-10-21 (R-156..R-165 in [[architecture-rulings-3]] section 7): E implemented the chain instead of waiting for Kittingsl. These tasks stay K-listed in [[tasks]]. Plan in KB `notes/ai-jam-5-cave-generator-chain-plan`. A29 no longer waits for C3. Chunk status (PRs from `git log origin/master` subjects):

| Chunk | Scope | Plan task | Tier | Status |
|---|---|---|---|---|
| C1 | pockets + teach | B4 | medium | merged #35 (`a8e4207`) |
| C2 | populate + validate | B5 | high, `@ultrathink` gate | merged #36 (`b64c59b`) |
| C3 | fallback + `generateCave` + attempt loop (+ `finalizeCave`) + `src/checks/caves.ts` | B6 and the A22 rest | medium+, gate | merged #37 (`133e047`) |
| C4 | `cave.check` (fresh session, mutation proofs, retrospect, gate) | B9 part (R-162) | medium | merged #38 (`df9b558`) |

C5 (depth classes, R-164) stays planned after C4 and needs owner approval (see Open items): the generator gets a `CaveParams` object (default class 3, no behaviour change). The memo helper named in the original C3 scope was not built (see the A22 row above).

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

None. A22 was the last partial task; it is complete on master (see the A22 row under Done).

## In progress

None. A29 and the cave generator chain C1-C4 are merged (see Done).

## Not started

Nothing in these lists is on master. Slice A items carry an owner; the full plan is in [[tasks]]. A29 is no longer listed here: it is merged (see Done).

**Slice A**

- Elias: A15 (render tiles, memory, props), A17 (render index), A30 (`game.ts` facade).
- Kittingsl: A7 (determinism and score checks), A10 (assets), A11, A12, A13 (UI), A31, A32 (systems checks). The rest of A22 was finished by E (see the A22 row under Done).

**Slice B (due 2026-10-22)**

- Elias: B1, B2, B3, B7, B8, B9 rocks.check (the cave.check part of B9 is done in C4, #38), B10, B17, B18.
- Kittingsl: B2a, B11, B12, B13, B14, B15, B16, B19, B20. (B4, B5, B6 are on master via chunks C1-C3, built by E; the B9 cave.check part is covered by C4, see the cave generator chain under Done.)

**Slice C**

- Elias: C1, C2, C6.
- Kittingsl: C3, C4, C5, C7, C8.

Also absent from master: in `src/render`, everything except `keys`, `view`, `flame`, `quality`, `light`, `glow` and `entities` (no tiles, memory, props, index, overlay, particles); `src/ui` and `src/audio` entirely; in `src/assets`, everything except `sprites`, `sounds`, `resources` and the three `placeholders-*` files (no images, atlas); `core/storage.ts`; `world/route.ts`; and the checks of A7, A31, A32 and slice B (`caves.ts` and the `cave*` checks are on master). `systems/run.ts`, `screens.ts`, `step.ts` and their three checks are on master since A29 (#39). `world/validate.ts` and `world/gen/populate.ts`, `pockets.ts`, `teach.ts`, `fallback.ts` are on master since C1-C3.

## Remaining slice A and critical path

Slice A is due **2026-10-20**. The hours below are the **estimates** from the task table in [[tasks]]. They are full-task estimates; the done part of A22 is not subtracted.

| Owner | Remaining tasks | Estimate |
|---|---|---|
| Elias | A15 3 h, A17 1 h, A30 1.5 h | 5.5 h |
| Kittingsl | A7 1.5 h, A10 2 h, A11 2.5 h, A12 2.5 h, A13 1.5 h, A31 2.5 h, A32 3 h | 15.5 h |

The Kittingsl row no longer lists the rest of A22 (2.5 h in the plan): E finished it through the cave generator chain (see the A22 row under Done). Hours are the plan estimates only; no hours were invented for the chain, and the Kittingsl total 18.0 h minus 2.5 h is 15.5 h. A29 (2.5 h) moved from the Elias row to done (merged as #39 and #40).

Done so far, by plan estimates: **Elias 27.0 h** on master (A1 1 + A2 1.5 + A3 2 + A4 1 + A5 2 + A6 2 + A24 1.5 + A25 1.5 + A26 1.5 + A27 2 + A28 3 + A14 2 + A16 3.5 + A29 2.5 = 27.0). **Kittingsl 11.5 h** (A18 1.5 + A19 2 + A20 2 + A21 3 + A23 1 + A8 2) plus the first part of A22 (plan estimates unchanged); the rest of A22 (2.5 h in the plan) was done by E through the chain C1-C4 and is not added to either total. Done by Elias on Kittingsl's behalf, stated separately: **A9, 3 h** (#33).

**Critical path:** A15 is now unblocked on the art side (A8 and A9 are done). A29 is done and merged (#39, #40) and no longer blocks anything. A17 needs A15, A12 and A13. A30 needs A17 and A29 (A29 is merged, so A30 waits only on A17). Elias remaining: A15, A17, A30. See the Cross-person critical path section in [[tasks]].

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
- **A16 escape darkness (#31):** follows render-3 section 2 (fade alpha `1 - k` over 1.5 s with `flameRadius` masks) over render-2 sections 5.3 and 5.6.
- **A16 dying-eye fade:** the eye fades over the first 3 death frames (assets-sprites section 5), resolved against the render-2 pass-16 sketch.
- **A16 devourer telegraph:** each beat plays from its own frame 0 (`aiT - beat * telegraphS / beats`, R-130).
- **A16 `entities.ts` `drawFrame`** reads `getResources().images.rects/sheets` directly until A10's `drawSprite` lands; it draws nothing if the art is missing.
- **A16 eye halo** sits at the monster centre until per-direction eye anchors exist. `drawEyes` has no `Quality` parameter.
- **A16 entity cull:** 48 px margin inside `entities.ts`; `view.ts` `inView` is unchanged.
- **A16 direction pick (R-155):** `Math.round(a / (pi / 4) + 1e-9)`, clockwise.
- **A8 added `checks/assets.check.ts`,** which is not in the plan (like `scripts/check-a18.ts`).
- **A9 (#33):** `DrawFn` is declared in `placeholders-actors.ts` and re-exported by `placeholders-ui.ts` (R-150 cycle rule). Extra world helpers were added beyond the plan list. Simplifications: devourer lunge stretch 5% (20% would fit), `spec_entrance` without the additive r=48 circle. A10 rule: placeholders draw in world units at scale 1, so `drawSprite` calls `PLACEHOLDERS[id]` directly at scale 1 when no atlas rect exists (`drawFrame` scales 64 px sources by 0.5 / monster scale).
- **T3 window [15,60] (R-156, owner):** the T3 carved-dark-patch scan widens from `[15, 30]` to `[15, 60]` tiles (the old window passed on only 29/62 seeds). Rulings: [[architecture-rulings-3]] section 7.
- **Validation rule 6 cuts at 25 / 50 / 75 % (R-157, owner):** the line-of-route test cuts the segment at those points instead of blocking the whole segment (62/62 vs 54/62 seeds). The exact blocked footprint per cut is a GAP for the implementer.
- **Populate widens `main` tiles (R-158, owner):** fixes rule 7 after `fixDiagonals` (4/62 seeds failed); adds floor only, `carveCore` and `ca.ts` are not reordered.
- **Fallback (R-163, owner):** fixed ring geometry, 0 draws; new keys `T.cave.pocketDepth` 10 (main caves) and `T.cave.fallbackPocketDepth` 5.
- **`finalizeCave` (R-160, owner):** new export of `world/generate.ts`; computes `stats.mainLoop` once per accepted cave for `generateCave` and the chunked game path. Signature is a GAP for the implementer.
- **R-007:** `depthOf` and `zoneOfDepth` live in `core/score.ts`, not in `systems/depth.ts`.
- **`devourerMul` pulled forward from C1** into `entities/monster.ts` (done in #23, A24 part 2). This closes open question 8 of [[tasks]] (E adds it; K reviews the hunk).
- **A18 brought `caches.getSolid` forward from A22** and added `scripts/check-a18.ts`, which is not in the plan.
- **A24 and A27 dependency rows** in [[tasks]] were corrected in an earlier sync (see its Change log).
- Kittingsl's #24 edited the repo snapshot directly; the edits were back-synced into the KB on 2026-10-18 (precedent #12).
- **A29 (merged as #39 and #40), rulings R-166..R-177 in [[architecture-rulings-3]] section 8:**
  - **R-166:** `startRun(s, seedText, cave?)` has an optional `cave` parameter (additive); `genStep` runs the chunked generation (one attempt per update, `fallbackCave` when `genAttempt` reaches `MAX_ATTEMPTS`, `finalizeCave` once, then `startRun`); `runSeedText` is an extra export; `checkEnd` lives in `run.ts`.
  - **R-167:** `console.warn` once in `startRun` when the fallback ring is used (default).
  - **R-168 (owner):** storage calls (`commitBest`, `loadSettings`, `loadBest`, `saveSettings`) are not in `run.ts`/`screens.ts` until B7 creates `core/storage.ts`; until then `result.prevBest` is 0 and settings are not persisted.
  - **R-169 (owner):** the slice-B step calls (`stepRoll`, `eStart` + `stepMining` + `stepBeacon`, `stepMinerals`, `stepQuake`) are omitted from `step.ts`, marked by index comments; each B task adds its own call.
  - **R-170 (owner):** hit testing is deferred to A30/A11; `stepScreens` does not write `ui.hover` from `hit()`.
  - **R-171:** copy link only emits the `copyLink` fx and never writes `ui.copied`.
  - **R-172 (OWNER-confirmed 2026-10-22):** during hitstop `step` runs `tickFx` (R-067 "only the clocks advance" read as "world frozen").
  - **R-173:** `startRun` keeps `ui.seedInput` on purpose (deviation from state-2 section 10).
  - **R-174:** screen navigation additions from the UI docs; all input except Escape is ignored while generation is pending, including `KeyM`.
  - **R-175, R-176, R-177:** stale rows of architecture-systems section 2; no counting spy in `step.ts`; the three A29 checks are `run.check.ts`, `step.check.ts`, `screens.check.ts` (the names `systems.check.ts` and `order.check.ts` stay reserved for A31/A32).

## Open items for the owner

- Invitation for cedricsdesign (write) is pending.
- Kittingsl still has to review the `devourerMul` hunk in `entities/monster.ts`.
- Decide whether `src/checks/assets.check.ts` stays.
- Decide whether `scripts/check-a18.ts` stays or is folded into `world.check`.
- `AGENTS.md` says the docs manifest has 68 files; it now has 69. `AGENTS.md` is a protected path, so the fix is a follow-up PR.
- Test gaps for Kittingsl's A31/A32 checks (from the A28 and A14 retrospects): stuck relocate timing, `stuckFrac`, `lungeRangePx` for stalker and devourer; quality ladder thresholds 18.5 / 12 ms, the vsync30 work limit, `VIG_STEP`, the top mask bucket.
- A16 follow-up: `inView` has no 48 px entity margin (render-2 section 2.3); A16 adds it or `inView` gets a pad argument. Resolved in #31: the margin lives inside `entities.ts`, `inView` is unchanged.
- **Owner decision from #31 (R-083):** `lightSources` does not exist in `systems/light.ts`, and no `FLAME` table exists in `systems/flame.ts`. `render/light.ts` builds the sources itself (player flame or ember r=22, entrance shaft r=72, beacon r=96*hold/holdS), and flicker uses `T.flame` per tuning section 3 instead of render-2 section 5.5 `FLICKER_AMP` 0.04. Either add `lightSources` to `systems/light.ts` later or amend R-083 (status note added to R-083 in [[architecture-rulings-2]]).
- **Owner decision from #31 (escape blend):** `render/light.ts` has a local `blend(s)` that treats escape without `beaconLit`, or with `beaconLitAt <= 0`, as fully faded. This duplicates `view.ts` `beaconBlend`, which returns 0 there and would keep the screen dark forever. Move the guard into `beaconBlend` in A17 so there is one source.
- **A17 notes (from #31):** `drawDarkness` leaves identity transform, source-over, alpha 1 and smoothing off on EVERY path, so A17 must call `worldXf` again before the next world-space pass. `drawEyes` and `drawGlow` leave `'lighter'` set. Pass order: `drawMonsters` (10), `drawPlayer` (11), `drawDarkness` (14), `drawEyes` (16), `drawGlow` with `torchTip` (17).
- Minor test gaps from the A16 retrospect (add to the A31/A32 test-gap item above): torch-tip per-frame anchors; tint-canvas height after eviction.
- C15 follow-up: the debug overlay must skip the `'@'` key of `perf.pass`.
- C6 scope drop: the quality auto ladder is already in A14 (#29); update the C6 estimate when C6 starts.
- Fix the modules-systems S7 and S8 drift in the KB (`losTiles` is gone, `baseRadius` has a second parameter).
- Decide who produces the AI art and music ([[architecture-assets-pipeline-2]]).
- Rule on the event-noise conflict (determinism section 3 vs render-2 section 4) before B18.
- KB follow-ups: `genPending` and `genAttempt` in state-2 section 9 and rulings-2 section 9; the stale `init()` literal in state-2 section 10; `wrapPi` and `segDist` in modules-core section 3.6.
- Compare the runner labels in `AGENTS.md` and `README.md` with `ci.yml`.
- Run the browser check of A1: `npm run dev`, no right-click menu, console shows `[hmr] game.ts swapped, state kept`.
- **Depth classes (R-164):** owner to approve or trim them (classes 3 + 4 about 4 h, classes 1 + 2 optional) and to confirm they ship after C4 as chunk C5.
- **A10 note (scale 1):** `drawSprite` must call `PLACEHOLDERS[id]` directly at scale 1 when no atlas rect exists; the hit-flash tint path needs its own placeholder branch; beacon charge uses `frame = floor(progress*4)` (see the A9 row).
- **T3 window vs teaching text (architect call needed):** the widened T3 window `[15, 60]` (R-156) contradicts CG2 section 4 ("all values <= 34 < beaconDist"), SAE1 section 5 ("T1-T4 path 7-24") and CG2 section 6.1 row 12.
- **Leftover "4 draws" mentions** of `'cave:fallback'` (SAE1 section 6, `architecture-determinism.md` line 107): R-163 makes it 0 draws; fix when determinism is next edited.
- **Rulings-3 intro line** still calls every ruling of the file an architect default; section 7 overrides it (R-156..R-165 include OWNER rulings). The intro line is not edited.
- **Fallback ring has zero plant slack:** it yields exactly 6 chamber plants, the rule-11 minimum. Verify in chunk C2.
- **A29 (R-170):** hit-test ownership: A30 or A11 must set `ui.cursor`/`ui.hover` from `hit()` before step; until then a click activates the focused menu item wherever it lands.
- **A29 (R-175, R-166):** the stale rows of architecture-systems section 2 and the modules-systems S3 table are annotated by rulings (R-175, R-166); the tables themselves are not rewritten. The rows are annotated only (notes added next to them in [[architecture-systems]] and [[architecture-modules-systems]]); do not treat them as fixed.
- **A29 (R-168, R-169):** B7 must add the storage calls and each B task (B1, B2, B7, B8) must add its own step call at the index comment in `step.ts`.
- **A29 (R-176):** A31 `order.check` item (e) cannot use a counting spy in `step.ts`; it must observe call order through behaviour (as `step.check.ts` does) or another owner-approved route.
- **A29 timing margin:** `run.check.ts` `run()` takes about 1.0-1.45 s against its 1.6 s ceiling; watch it when the checks or the cave generator change.
- **Check guard gap (found by the #40 gate review):** `scripts/check-guard.ts` has no guard that each `src/checks/*.check.ts` file is imported and called in `src/checks/all.ts`; a new check file that is forgotten there never runs. Add such a guard in a follow-up.
- **Style nit (A29):** four lines exceed 160 characters: `src/checks/screens.check.ts` lines 116, 119 and 257, and `src/systems/screens.ts` line 14 (`awk 'length>160'`, 2026-10-22).
- Questions already in [[last-ember-open-questions]] stay open there.

## Related

- [[tasks]]
- [[tasks-files]]
- [[index]]
- [[architecture]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[ai-jam-5-cave-generator-chain-plan]]
- [[architecture-systems]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-modules-systems]]
- [[architecture-assets-pipeline-2]]
- [[last-ember-open-questions]]

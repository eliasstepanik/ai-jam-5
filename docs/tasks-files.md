---
type: reference
title: "Last Ember – Per-File Assignment (Elias vs Kittingsl)"
description: Per-file table for Last Ember (section 3 of the task plan) – every source, script, asset and check file with the slice in which it is first created, the owner (E = Elias, K = Kittingsl), the task id and an estimated line count.
tags: [project, ai-jam-5, tasks, last-ember]
timestamp: 2026-10-22T16:00:00Z
---

# Last Ember – Per-File Assignment (Elias vs Kittingsl)

Section 3 of the task plan (author: project-manager, 2026-10-18). The overview, assignment principles, ownership summary, task index (slices A, B, C), totals, risks and process live in [[tasks]]. Task ids (A1 … C8) are defined in [[tasks]] section 4. File specs are in the module trees linked under Related and in [[architecture]]. Done and partial status per task: see [[progress]].

## 3. Per-file table

Legend:

- **Slice** = the slice in which the file is first created. "+B6" in the Task column = extension of the file in that later task.
- **E** = Elias, **K** = Kittingsl.
- **~** = estimate. **\*** = moved (see "Deviations from the module tree" in [[tasks]]).
- **Lines** = estimated line count of the file; "+13" = lines added to an existing file.

### Host and tooling

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/main.ts (EDIT) | A | E | A1 | +13 |
| index.html (EDIT) | A | E | A1 | 40 |
| package.json (EDIT; A6 wires `node src/check.ts && node src/checks/all.ts && node scripts/check-guard.ts`; check-assets is added in the C8 review, see note below) | A | E | A6 | +5 |
| scripts/check-guard.ts | A | E | A5 | ~80 |
| scripts/check-assets.ts | A | K | A10 | ~150 |
| scripts/pack-atlas.ts | B | K | B15 | ~350 |
| src/game.ts (EDIT) | A | E | A30; +B8 | 60 |

`ci.yml`, `merge.ts`, `check.ts` and `vite.config.ts` are unchanged.

Note on `package.json`: only Elias edits it. A6 wires `npm run check` as `node src/check.ts && node src/checks/all.ts && node scripts/check-guard.ts` (the original scaffold check `src/check.ts` stays first; check-guard is created in A5, so the chain is green on master from A6). `scripts/check-assets.ts` (A10, K) is NOT part of `npm run check` until C8 (asset integration, K). Exception: the one-line `package.json` hunk for check-assets is made by Elias in the C8 PR review, as a commit on the PR branch or a follow-up PR. See [[tasks]] section 1.

### core

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/core/types.ts | A | E | A2 | 250 |
| src/core/tuning-types.ts | A | E | A2 | 75 |
| src/core/math.ts | A | E | A2 | 5 |
| src/core/state.ts | A | E | A3 | 80 |
| src/core/rng.ts | A | E | A3 | 45 |
| src/core/seed.ts | A | E | A3 | 25 |
| src/core/tuning.ts | A | E | A3; +B10, C2 | 230 |
| src/core/migrate.ts | A | E | A5 | 110 |
| src/core/score.ts | A | E | A5 | 70 |
| src/core/storage.ts | B | E | B7 | 90 |
| src/core/noise.ts | A | E | A4 | 40 |
| src/core/view.ts | A | E | A4 | 25 |

### world

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/world/bfs.ts | A | K | A20 | 70 |
| src/world/gen/carve.ts | A | K | A20 | 60 |
| src/world/gen/region.ts | A | K | A20 | 60 |
| src/world/gen/ca.ts | A | K | A20 | 100 |
| src/world/gen/macro.ts | A | K | A21 | 140 |
| src/world/gen/places.ts | A | K | A21 | 110 |
| src/world/gen/loops.ts | A | K | A21 | 160 |
| src/world/generate.ts | A | K | A22; +B6 | 140 |
| src/world/caches.ts | A | K | A22; +B6 | 200 |
| src/world/grid.ts | A | K | A18 | 80 |
| src/world/collide.ts | A | K | A18 | 90 |
| src/world/los.ts | A | K | A18 | 40 |
| src/world/explored.ts | A | K | A19 | 60 |
| src/world/sample.ts | A | K | A19 | 70 |
| src/world/route.ts | B | K | B2a | 150 |
| src/world/gen/pockets.ts | B | K | B4 | 140 |
| src/world/gen/teach.ts | B | K | B4 | 120 |
| src/world/validate.ts | B | K | B5 | 190 |
| src/world/gen/populate.ts | B | K | B5 | 190 |
| src/world/gen/fallback.ts | B | K | B6 | 110 |

### entities and systems

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/entities/monster.ts | A | K | A23; +A24 (devourerMul, #23) | 70 |
| src/entities/steer.ts | A | K | A23 | 30 |
| src/systems/fx.ts | A | E | A24 | 45 |
| src/systems/camera.ts | A | E | A24 | 30 |
| src/systems/depth.ts | A | E | A24 | 25 |
| src/systems/light.ts | A | E | A24 | 60 |
| src/systems/intent.ts | A | E | A25 | 50 |
| src/systems/movement.ts | A | E | A25; +B8 | 140 |
| src/systems/explore.ts | A* | E | A25 | 45 |
| src/systems/flame.ts | A | E | A26; +B7 | 80 |
| src/systems/pickups.ts | A | E | A26; +B7 | 40 |
| src/systems/combat.ts | A | E | A27 | 210 |
| src/systems/monsters.ts | A | E | A28 | 220 |
| src/systems/ai-lurker.ts | A | E | A28 | 60 |
| src/systems/director.ts | A | E | A28; +B8 | 100 |
| src/systems/run.ts | A | E | A29; +B8 | 130 |
| src/systems/screens.ts | A | E | A29 | 126 |
| src/systems/step.ts | A | E | A29 | 54 |
| src/systems/mining.ts | B | E | B1 | 70 |
| src/systems/beacon.ts | B | E | B1 | 70 |
| src/systems/quake.ts | B | E | B2 | 60 |
| src/systems/rocks.ts | B | E | B2 | ~200 |
| src/systems/ai-stalker.ts | B | E | B3 | 70 |
| src/systems/ai-escape.ts | B | E | B3 | 50 |
| src/systems/ai-devourer.ts | C | E | C1 | 40 |

`toast()` lives in `src/core/state.ts` (R-009); there is no `src/systems/toast.ts`.

### render

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/render/keys.ts | A | E | A14 | 50 |
| src/render/view.ts | A | E | A14 | 90 |
| src/render/flame.ts | A | E | A14 | 25 |
| src/render/quality.ts | A | E | A14; +C6 | 120 |
| src/render/tiles.ts | A | E | A15; +C6 | 190 |
| src/render/memory.ts | A | E | A15 | 110 |
| src/render/props.ts | A | E | A15; +B17 | 130 |
| src/render/light.ts | A | E | A16 | 170 |
| src/render/entities.ts | A | E | A16 | 200 |
| src/render/glow.ts | A | E | A16; +B17 | 180 |
| src/render/index.ts | A | E | A17 | 130 |
| src/render/overlay.ts | B | E | B17; +C6 | 150 |
| src/render/particles.ts | B | E | B18; +C6 | 200 |

### ui

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/ui/layout.ts | A | K | A11; +B19 | 200 |
| src/ui/strings.ts | A | K | A11; +B19 | 150 |
| src/ui/draw.ts | A | K | A11 | 120 |
| src/ui/menus.ts | A | K | A12; +B20, C7 | 280 |
| src/ui/platform.ts | A | K | A12; +B19 | 80 |
| src/ui/hud.ts | A | K | A13; +B20, C7 | 250 |
| src/ui/menus-end.ts (only if menus.ts > 300) | B | K | B20 | ~80 |
| src/ui/debug.ts | C | K | C3 | 80 |

### audio

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/audio/trigger.ts | B | K | B12; +C4 | 120 |
| src/audio/mixer.ts | B | K | B12 | 90 |
| src/audio/engine.ts | B | K | B12 | 170 |
| src/audio/sfx.ts | B | K | B13; +C5 | 180 |
| src/audio/music.ts | B | K | B13; +C4 | 140 |
| src/audio/synth.ts | B | K | B14 | 250 |
| src/audio/synth-2.ts | B | K | B14; +C5 | 250 |

### assets

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/assets/sprites.ts | A | K | A8 | 200 |
| src/assets/sounds.ts | A | K | A8 | 120 |
| src/assets/resources.ts | A | K | A8 | 150 |
| src/assets/placeholders-actors.ts | A | K | A9 | 200 |
| src/assets/placeholders-world.ts | A | K | A9 | 250 |
| src/assets/placeholders-ui.ts | A | K | A9 | 150 |
| src/assets/images.ts | A | K | A10; +B16 | 200 |
| src/assets/atlas.json (seed, then GEN) | A | K | A10; +B16 | ~5 / 265 |
| src/assets/atlas-0.png (GEN) | B | K | B16 | binary |

### checks

| File | Slice | Owner | Task | Lines |
|---|---|---|---|---|
| src/checks/input.ts | A | E | A6 | 20 |
| src/checks/all.ts | A | E | A6 | 34 |
| src/checks/state.check.ts | A | E | A6 | 150 |
| src/checks/run.check.ts (not in the original plan) | A | E | A29 | 277 |
| src/checks/step.check.ts (not in the original plan) | A | E | A29 | 287 |
| src/checks/screens.check.ts (not in the original plan) | A | E | A29 | 300 |
| src/checks/determinism.check.ts | A | K | A7 | 200 |
| src/checks/score.check.ts (merged with the systems one) | A | K | A7 | 80 |
| src/checks/caves.ts | A | K | A22 | 15 |
| src/checks/render.check.ts | A | E | A4 | 40 |
| src/checks/world.check.ts | A | K | A19 | ~250 |
| src/checks/light-flame.check.ts | A | K | A32 | ~100 |
| src/checks/parry.check.ts | A | K | A32 | ~120 |
| src/checks/damage.check.ts | A | K | A32 | ~120 |
| src/checks/movement.check.ts | A | K | A32 | ~80 |
| src/checks/flow.check.ts | A | K | A31 | ~120 |
| src/checks/order.check.ts | A | K | A31 | ~150 |
| src/checks/ai.check.ts | A | K | A31; +C3 | ~100 |
| src/checks/cave.check.ts | B | E | B9 | ~250 |
| src/checks/rocks.check.ts | B | E | B9 | ~250 |
| src/checks/economy.check.ts | B | K | B11 | ~130 |
| src/checks/escape.check.ts | B | K | B11 | ~100 |

## Related

- [[progress]]
- [[tasks]]
- [[architecture]]
- [[index]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-systems-2]]
- [[architecture-modules-render]]
- [[architecture-modules-render-2]]
- [[architecture-modules-ui-assets]]
- [[architecture-modules-ui-assets-2]]

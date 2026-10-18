---
type: reference
title: "Last Ember – Task Overview and Code Ownership (Elias vs Kittingsl)"
description: Task plan for Last Ember – who owns which code (Elias and Kittingsl), assignment principles, ownership summary, task index for slices A, B and C with hours and dependencies, per-person totals, risks, working process and open questions for the owner.
tags: [project, ai-jam-5, tasks, last-ember]
timestamp: 2026-10-18T15:00:00Z
---

# Last Ember – Task Overview and Code Ownership (Elias vs Kittingsl)

Task plan written by the project-manager on 2026-10-18. It splits the Last Ember implementation between two people with disjoint code ownership. The per-file table (section 3) is in [[tasks-files]]. Specs: [[architecture]] (hub), [[last-ember-design]], [[last-ember-production-plan]]; open items: [[last-ember-open-questions]]. Project hub: [[index]].

**People**

- **Elias (E)** – repo owner (eliasstepanik). Merges all PRs and runs the self-hosted runner.
- **Kittingsl (K)** – collaborator, **not yet invited**. Until the invite happens, K's PRs come from a fork and the `ci` check runs on `ubuntu-latest`. The invite is the owner's explicit GitHub action.
- **saile2204** – design lead. **undertaker7431** – team member. No code is assigned to them in this plan.

**Dates**

- Day 1 = 2026-10-17.
- Slice A due **2026-10-20**. Slice B due **2026-10-22**.
- Asset freeze **2026-10-27**.
- Deadline **2026-10-31 03:00 UTC**. Oct 30 is the last working day.

## 1. Assignment principles

- **Disjoint files (and whole directories where possible).** Each file has exactly one owner; most `src/` subtrees and scripts belong to one person. Shared hot spots are `package.json`, `src/checks/all.ts` and `src/game.ts`. Only E edits `package.json` and `game.ts`. K may append one import line to `all.ts`, then rebase.
- **E owns the interface-defining foundation:** the host PR (OD-1, OD-3, OD-7), core, world generation (gen/*, generate, caches), entities, all systems (except systems checks), `game.ts`, CI and tooling (`package.json`, check-guard), and integration and merging. E is also the only reviewer and merger, and owns the runner.
- **K owns the leaf areas that start from the specs.**
  - Assets: manifests, placeholders, images, pack-atlas, check-assets.
  - UI: layout, strings, draw, menus, hud, platform, debug.
  - Render, including `render/index.ts`, which calls `ui/hud` and `ui/menus` (seam S1), so render and UI stay with one person.
  - Audio, all 7 files.
  - Pure world queries: grid, collide, los, explored, sample.
  - `core/noise.ts` and `core/view.ts` (pure, no State).
- **Test author is not the implementer.** K writes the systems checks and `world.check`. E writes the core, determinism and cave/rocks checks, which cover K-independent code. This gives cross-review for free.
- **K start order.** K can start now, with no E dependency, on A4, A8, A9 and A11. K waits for the merged core types (A2) before anything that reads State: render, hud, grid and collide. Until K is invited, PRs come from the fork and run `ci` on `ubuntu-latest`.
- **Load balance.** Raw hours are E 56.2 and K 71.5. E also spends about 20h reviewing and merging about 25 K PRs and runs the Day-4 and Day-6 tuning. So the real load is roughly equal.
- **One PR per task.** A task has at most 4 cohesive files and must be complete, with no stubs. Foundation tasks (A1, A2, A3) merge first. Each new code surface carries its wiring: import and call site, mount in the render tree, and an import in `all.ts`.
- **Cut and slip order.** If slice A overruns, A31 and A32 (checks) slip first, then the partial hud parts. Gameplay files never slip. The cut order from the production plan applies after that (Devourer, then AI animation, then escape simplification).

## 2. Ownership summary

| Directory / area | Owner | Slices | Est. h |
|---|---|---|---|
| src/main.ts, index.html (host PR, needs user approval OD-1/3/7) | E | A | 1 |
| package.json, scripts/check-guard.ts | E | A | 0.7 |
| src/core/* except noise/view | E | A, B | 6 |
| src/core/noise.ts, view.ts | K | A | 1 |
| src/world/gen/*, generate, caches, route, validate | E | A, B | 14.7 |
| src/world/ queries: grid, collide, los, explored, sample | K | A | 3.5 (incl. world.check) |
| src/entities/* (2 files) | E | A, C | 1 |
| src/systems/* (all 24 files) | E | A, B, C | 20 |
| src/game.ts | E | A, B | 2 |
| src/checks/ core, determinism, state, score, cave, rocks, caves, input, all | E | A, B | 6.3 |
| src/checks/ systems (A31/A32/B11; ai.check devourer rows in C3) | K | A, B, C | 7.5 |
| Slice integration, tuning, itch page, README/CHANGELOG | E | B, C | 4.5 |
| src/assets/* plus scripts/pack-atlas.ts, check-assets.ts | K | A, B, C | 13 |
| src/ui/* | K | A, B, C | 14 |
| src/render/* | K | A, B, C | 17 |
| src/audio/* | K | B, C | 15.5 |

Section 3 (per-file table and legend): see [[tasks-files]].

## 4. Task index

Ids are global per slice; deps are task ids.

Task numbers are ids, not an execution order. Dependencies may point to a higher number (e.g. A14 and A16 need A24; A19 needs A22); always read the Deps column.

### Slice A (due Oct 20)

| Task | Owner | Files | h | Deps / note |
|---|---|---|---|---|
| A1 | E | host PR: main.ts, index.html | 1 | User approval OD-1/3/7; unblocks Input.view |
| A2 | E | types, tuning-types, math | 1.5 | First to merge; unblocks all State code |
| A3 | E | state, rng, seed, tuning | 2 | A2 |
| A4 | K | noise, view, render.check | 1 | None, start now |
| A5 | E | migrate, score | 1.5 | A3 |
| A6 | E | checks/input, checks/all, state.check, package.json | 2 | A5 |
| A7 | E | determinism.check, score.check, check-guard | 2 | A6 |
| A8 | K | sprites, sounds, resources | 2 | None, start now |
| A9 | K | 3x placeholders-* | 3 | A8 |
| A10 | K | images, atlas.json seed, check-assets | 2 | A8, A9, A4 |
| A11 | K | layout, strings, draw | 2.5 | None for the code; Input.view from A1 |
| A12 | K | menus, platform | 2.5 | A11, A2 |
| A13 | K | hud | 1.5 | A11, A2 |
| A14 | K | render keys, view, flame, quality | 2 | A2, A4; camera.shakeOffset from A24 |
| A15 | K | render tiles, memory, props | 3 | A14, A8, A9 |
| A16 | K | render light, entities, glow | 3.5 | A14, A24 (light.ts) |
| A17 | K | render index | 1 | A15, A16, A12, A13 |
| A18 | K | grid, collide, los | 1.5 | A2 |
| A19 | K | explored, sample, world.check | 2 | A18, A22 |
| A20 | E | bfs, carve, region, ca | 2 | A3 |
| A21 | E | macro, places, loops | 3 | A20 |
| A22 | E | generate, caches, checks/caves | 2.5 | A21 |
| A23 | E | monster, steer | 1 | A3 |
| A24 | E | fx, camera, depth, light | 1.5 | A3 |
| A25 | E | intent, movement, explore | 1.5 | A24, A18 |
| A26 | E | flame, pickups, toast | 1.5 | A24 |
| A27 | E | combat | 2 | A24, A26 |
| A28 | E | monsters, ai-lurker, director | 3 | A23, A25, A27 |
| A29 | E | run, screens, step | 2.5 | A22, A28 |
| A30 | E | game.ts facade and slice-A integration | 1.5 | A17, A29 |
| A31 | K | flow, order, ai checks | 2.5 | A29; may slip to B day 1 |
| A32 | K | light-flame, parry, damage, movement checks | 3 | A27; may slip to B day 1 |

### Slice B (due Oct 22)

| Task | Owner | Files | h | Deps / note |
|---|---|---|---|---|
| B1 | E | mining, beacon | 1.2 | A29 |
| B2 | E | quake, rocks, route | 3 | B1, A22 |
| B3 | E | ai-stalker, ai-escape | 1 | A28 |
| B4 | E | gen/pockets, gen/teach | 2 | A22 |
| B5 | E | validate, gen/populate | 3 | B4 |
| B6 | E | gen/fallback; extends caches and generate | 1.5 | B5 |
| B7 | E | core/storage; extends flame (minerals), pickups (size) | 2 | A26 |
| B8 | E | Extends movement (roll), run (escape win), director (escape table), game.ts (audioStep) | 2 | B2, B3, B12 |
| B9 | E | cave.check, rocks.check | 3 | B6, B2 |
| B10 | E | Slice-B integration, Day-6 playtest, tuning | 2 | All of B |
| B11 | K | economy.check, escape.check | 1.5 | B1, B7 |
| B12 | K | audio trigger, mixer, engine | 3 | A8 |
| B13 | K | audio sfx, music | 2.5 | B12 |
| B14 | K | audio synth, synth-2 (P0 recipes) | 4 | B12 |
| B15 | K | scripts/pack-atlas.ts | 3 | A10 |
| B16 | K | images atlas and screens; atlas.json; atlas-0.png | 1 | B15; needs delivered art |
| B17 | K | render overlay; extends glow and props (rocks) | 2.5 | A17 |
| B18 | K | render particles (core events) | 2 | A17 |
| B19 | K | Extends layout, strings, platform (help, end, copy link) | 1.5 | A12 |
| B20 | K | Extends menus and hud; menus-end.ts if needed | 3 | B19, B2 (exitHeading) |

### Slice C

| Task | Owner | Files | h |
|---|---|---|---|
| C1 | E | ai-devourer; devourerMul | 1 |
| C2 | E | tuning.ts calibration; README/CHANGELOG/itch page | 2.5 |
| C3 | K | debug.ts; devourer rows in src/checks/ai.check.ts (file owned by K via A31; tests the C1 behaviour) | 1.5 |
| C4 | K | Music layers and stingers (music, trigger) | 3 |
| C5 | K | P1/P2 recipes (synth-2, sfx) | 3 |
| C6 | K | particles full table, quality auto ladder, overlay polish, tiles atlas swap | 3 |
| C7 | K | UI fades and pulses (menus, hud) | 2 |
| C8 | K | Final asset integration by Oct 27 freeze (repack, check-assets, PENDING_AUDIO empty, README AI-process rows) | 2 |

## 5. Per-person totals

New files by first creation; hours include extension tasks.

| Person | A files | A h | B files | B h | C files | C h | Total files | Total h |
|---|---|---|---|---|---|---|---|---|
| Elias | 48 | 32 | 15 | 20.7 | 1 | 3.5 | 64 | 56.2 |
| Kittingsl | 42 | 33 | 14* | 24 | 1 | 14.5 | 57 | 71.5 |

\* Includes the conditional `menus-end.ts`, plus `atlas-0.png` (generated). Total: 121 rows. Elias also spends about 20h on PR review and merging (not in the table).

## Deviations from the module tree

1. `systems/explore.ts` is moved from slice B to slice A. Without it, `world.explored` never fills, so the memory and dark pass cannot show a seeded cave in slice A.
2. `systems/rocks.ts` and `systems/toast.ts` are in no S1–S22 list, but other specs name them (the world tree for `rocks.ts`, UI-assets conflict C11 for `toast.ts`). They are added as tasks.
3. E1 `entities/player.ts` is not created, because `initPlayer` lives in `core/state.ts`.
4. The `score.check.ts` in the systems tree duplicates the one in the core tree, so they are merged into one file (A7).
5. `menus-end.ts` is created only if `menus.ts` passes 300 lines.

## Risks and blockers

- **Approvals pending.** The user must approve OD-1/3/7 before A1, and K's invite is still pending. If K stays on the fork, the `ci` check runs on `ubuntu-latest` instead of the self-hosted runner.
- **Day-4 checkpoint.** The descent must be tense by Oct 20. If it isn't, fix the flame economy before B starts, and C2 (tuning) moves earlier.
- **Slice A is the tightest.** E has 32h and K has 33h in 3 days. The mitigation is A31 and A32 slipping, not shrinking the gameplay files.
- **E-side slip order for slice A (PROPOSAL for the owner to confirm):** if Elias's slice A work slips, move A7 (determinism.check, score.check, check-guard) first, then A6 state.check, to slice B day 1; gameplay files A20–A30 never slip. Kittingsl's A31/A32 slip first as already stated.
- **Assumptions.** Line counts for `rocks.ts`, `toast.ts`, the checks and `pack-atlas` are estimates. Hours are estimates, not taken from the specs.

## How to use this plan

- Branch naming: `feature/<task-id>-<slug>`.
- Kittingsl has no KB access: the repo copy docs/ is the plan. To propose a plan change, write it in the PR description or open a GitHub issue; Elias applies it to the knowledge base and re-syncs docs/. Do not edit files under docs/ in a PR.
- One PR per task. Each person reviews the other's PR. Elias merges.
- The `ci` check must pass, and the PR branch must be up to date with `master`.
- Run `npm run check && npm run build` locally before pushing.
- Every user-visible change adds an entry under `[Unreleased]` in `CHANGELOG.md`, in the same PR.
- Follow the repo `AGENTS.md` rules:
  - Hot-reload contract: all state in `State`, `init()` defaults for new fields, no module-level side effects.
  - Files stay under 300 lines.
  - No stubs or TODOs.
  - Mark deliberate simplifications with `// ponytail:` comments.

## Open questions for the owner

1. Confirm this split between Elias and Kittingsl.
2. Invite Kittingsl as a collaborator on the repo (otherwise PRs come from a fork and `ci` runs on `ubuntu-latest`).
3. Who produces the AI art and music? See [[architecture-assets-pipeline-2]] (hand-off and licensing). B16 and C8 depend on delivered art.
4. A31 and A32 (checks) may slip to B day 1. Is that acceptable?
5. Approvals OD-1, OD-3 and OD-7 block A1 (see [[architecture]] section 6).
6. Confirm the E-side slip order proposal.

## Related

- [[tasks-files]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[architecture-assets-pipeline-2]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-systems-2]]
- [[architecture-modules-render]]
- [[architecture-modules-render-2]]
- [[architecture-modules-ui-assets]]
- [[architecture-modules-ui-assets-2]]

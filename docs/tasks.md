---
type: reference
title: "Last Ember – Task Overview and Code Ownership (Elias vs Kittingsl)"
description: Task plan for Last Ember – who owns which code (Elias and Kittingsl), assignment principles, ownership summary, task index for slices A, B and C with hours and dependencies, per-person totals, risks, working process and open questions for the owner.
tags: [project, ai-jam-5, tasks, last-ember]
timestamp: 2026-10-19T22:30:00Z
---

# Last Ember – Task Overview and Code Ownership (Elias vs Kittingsl)

Task plan written by the project-manager on 2026-10-18. It splits the Last Ember implementation between two people with disjoint code ownership. The per-file table (section 3) is in [[tasks-files]]. Specs: [[architecture]] (hub), [[last-ember-design]], [[last-ember-production-plan]]; open items: [[last-ember-open-questions]]. Project hub: [[index]].

**People**

- **Elias (E)** – repo owner (eliasstepanik). Merges all PRs and runs the self-hosted runner.
- **Kittingsl (K)** – collaborator with write access (verified 2026-10-18). K's PRs come from same-repo branches and the `ci` check runs on the self-hosted runner.
- **saile2204** – design lead. **undertaker7431** – team member. No code is assigned to them in this plan.

**Dates**

- Day 1 = 2026-10-17.
- Slice A due **2026-10-20**. Slice B due **2026-10-22**.
- Asset freeze **2026-10-27**.
- Deadline **2026-10-31 03:00 UTC**. Oct 30 is the last working day.
- Build status (done, partial, remaining) as of 2026-10-19: see [[progress]].

## 1. Assignment principles

- **Disjoint files (and whole directories where possible).** Each file has exactly one owner; most `src/` subtrees and scripts belong to one person. Shared hot spots are `package.json`, `src/checks/all.ts` and `src/game.ts`. Only E edits `package.json` and `game.ts`. K may append one import line to `all.ts`, then rebase.
  - **Check chain (stated once).** A6 (E) wires `npm run check` as `node src/check.ts && node src/checks/all.ts && node scripts/check-guard.ts` (the original scaffold check `src/check.ts` stays first). `scripts/check-guard.ts` is created in A5 (E), before A6, so `npm run check` is green on master from the A6 merge. The `check-assets` script (A10, K) is NOT part of `npm run check` until C8 (asset integration, K). Explicit exception to the package.json rule: the one-line `package.json` hunk for check-assets is made by Elias in the C8 PR review, as a commit on the PR branch or a follow-up PR. K never edits `package.json`.
- **E owns the interface-defining foundation:** the host PR (OD-1, OD-3, OD-7), core (types, State, rng, seed, tuning, migrate, score, storage, plus the pure `noise.ts` and `view.ts`), all systems (except systems checks), render and lighting (all of `src/render/*`, including `render/index.ts`), `game.ts`, CI and tooling (`package.json`, `scripts/check-guard.ts`), the input, state, cave and rocks checks, and integration and merging. E is also the only reviewer and merger, and owns the runner.
- **K owns world generation, world queries and the leaf areas that start from the specs.**
  - World: the whole `src/world/` directory (generation: bfs, gen/*, generate, caches, validate, route; queries: grid, collide, los, explored, sample) and `src/entities/*` (monster, steer). Cave generation is the most complex algorithmic work in the plan.
  - Assets: manifests, placeholders, images, pack-atlas, check-assets.
  - UI: layout, strings, draw, menus, hud, platform, debug.
  - Audio, all 7 files.
  - Checks: the systems checks (A31, A32, B11, devourer rows in `ai.check` via C3), `world.check`, and the determinism and score checks (A7). `scripts/check-guard.ts` is E's (A5).
- **Seam S1 is a cross-person integration point.** `render/index.ts` (A17, E) calls `ui/hud` and `ui/menus` (A12, A13, K), so A17 depends on A12 and A13. Agree the call signatures from [[architecture-modules-render]] and [[architecture-modules-ui-assets]] before E starts A17, and merge A12 and A13 first.
- **Test author is not the implementer.** K writes world generation and world queries; E writes `cave.check` and `rocks.check` (the author differs from the implementer for cave generation). K still writes the systems checks A31/A32 (and B11), which cover E's code, and the determinism and score checks, which cover E's core. `world.check` tests K's own world queries (same author). This gives cross-review for free.
- **Start order.** K can start now, with no E dependency, on A8 and A11 (A9 follows A8). K waits for merged core types (A2) before A12, A13 and A18, and for A3 before A20 and A23. E can start now on A1, A2, A3 and A4 (noise, view and render.check need no State). A10 (images, atlas.json seed, check-assets) needs Elias's A4 (earliest hour 21.5): schedule A10 after A19 and A7, or the Kittingsl slice-A finish slips from hour 32.5 to about 38.5.
- **Load balance.** Raw hours are E 56.5 and K 71.2. E also spends about 20h reviewing and merging about 32 K PRs (one per K task) and runs the Day-4 and Day-6 tuning. So E carries about 76.5h against K's 71.2h, and the real load is roughly equal. K carries the most complex algorithmic work (cave generation).
- **One PR per task.** A task has at most 4 cohesive files and must be complete, with no stubs. Foundation tasks (A1, A2, A3) merge first. Each new code surface carries its wiring: import and call site, mount in the render tree, and an import in `all.ts`.
- **Cut and slip order.** If slice A overruns, A31 and A32 (checks) slip first, then the partial hud parts. Gameplay files never slip. The cut order from the production plan applies after that (Devourer, then AI animation, then escape simplification).

## 2. Ownership summary

| Directory / area | Owner | Slices | Est. h |
|---|---|---|---|
| src/main.ts, index.html (host PR, OD-1/3/7 approved, merged #18) | E | A | 1 |
| src/core/* except noise/view (types, state, rng, seed, tuning, migrate, score, storage) | E | A, B | 7 |
| src/core/noise.ts, view.ts, checks/render.check.ts (A4) | E | A | 1 |
| src/render/* (all 13 files, incl. light and glow; index.ts calls K's ui/hud and ui/menus, seam S1) | E | A, B, C | 17 |
| src/systems/* (all 23 files; light.ts included) | E | A, B, C | 19 |
| src/game.ts, slice-A integration (A30) | E | A, B | 1.5 |
| src/checks/ input, all, state, cave, rocks; package.json (A6, B9); scripts/check-guard.ts (A5) | E | A, B | 5.5 |
| Slice integration, tuning, itch page, README/CHANGELOG | E | B, C | 4.5 |
| src/world/ generation: bfs, gen/*, generate, caches, validate, route (A20-A22, B2a, B4-B6) | K | A, B | 15.2 |
| src/world/ queries: grid, collide, los, explored, sample | K | A | 3.5 (incl. world.check) |
| src/entities/* (2 files: monster, steer) | K | A | 1 |
| src/checks/ determinism, score (A7) | K | A | 1.5 |
| src/checks/ systems (A31, A32, B11) | K | A, B | 7 |
| src/assets/* plus scripts/pack-atlas.ts, check-assets.ts | K | A, B, C | 13 |
| src/ui/* (incl. C3: debug.ts and the devourer rows in ai.check) | K | A, B, C | 14.5 |
| src/audio/* | K | B, C | 15.5 |

Sum check: E 56.5 h, K 71.2 h, together 127.7 h (the hours of all tasks in section 4). `src/checks/caves.ts` (A22) belongs to K with the generation chain. E added `devourerMul` to K's `entities/monster.ts` in #23 (A24 part 2, pulled forward from C1); see Risks.

Section 3 (per-file table and legend): see [[tasks-files]].

## 4. Task index

Ids are global per slice; deps are task ids.

Task numbers are ids, not an execution order. Dependencies may point to a higher number (e.g. A14 and A16 need A24; A19 needs A22; A25 needs A18; B2 needs B2a; B8 needs B12); always read the Deps column. Owner changes of 2026-10-18 are in the Change log at the end. Cross-person dependencies (the owner of a dependency differs from the owner of the task) are marked **x-person**.

### Slice A (due Oct 20)

| Task | Owner | Files | h | Deps / note |
|---|---|---|---|---|
| A1 | E | host PR: main.ts, index.html | 1 | Approved OD-1/3/7 (done); unblocks Input.view. **DONE** (#18; owner browser check of `npm run dev` still open) |
| A2 | E | types, tuning-types, math | 1.5 | First to merge; unblocks all State code. **DONE** (#6) |
| A3 | E | state, rng, seed, tuning | 2 | A2. **DONE** (#7) |
| A4 | E | noise, view, render.check | 1 | None, start now (pure, no State); render consumes it. **DONE** (#8) |
| A5 | E | migrate, score, scripts/check-guard.ts (moved from A7, 2026-10-18) | 2 | A3. **DONE** (#11) |
| A6 | E | checks/input, checks/all, state.check, package.json (wires `node src/check.ts && node src/checks/all.ts && node scripts/check-guard.ts`; check-assets from A10 is NOT wired until C8, see section 1) | 2 | A5. **DONE** (#13) |
| A7 | K | determinism.check, score.check | 1.5 | A6 (x-person) |
| A8 | K | sprites, sounds, resources | 2 | None, start now. **DONE** (#28) |
| A9 | K | 3x placeholders-* | 3 | A8 |
| A10 | K | images, atlas.json seed, check-assets | 2 | A8, A9, A4 (x-person) |
| A11 | K | layout, strings, draw | 2.5 | None for the code; Input.view from A1 (x-person) |
| A12 | K | menus, platform | 2.5 | A11, A2 (x-person) |
| A13 | K | hud | 1.5 | A11, A2 (x-person) |
| A14 | E | render keys, view, flame, quality | 2 | A2, A4; camera.shakeOffset from A24. **DONE** (#29; also holds the quality auto ladder pulled forward from C6) |
| A15 | E | render tiles, memory, props | 3 | A14, A8, A9 (x-person: A8, A9 are K's) |
| A16 | E | render light, entities, glow | 3.5 | A14, A24 (light.ts) |
| A17 | E | render index | 1 | A15, A16, A12, A13 (x-person: seam S1, A12/A13 are K's) |
| A18 | K | grid, collide, los | 1.5 | A2 (x-person). **DONE** (#10) |
| A19 | K | explored, sample, world.check | 2 | A18, A22. **DONE** (#21) |
| A20 | K | bfs, carve, region, ca | 2 | A3 (x-person); start right after A3 merges. **DONE** (#14) |
| A21 | K | macro, places, loops | 3 | A20. **DONE** (#17) |
| A22 | K | generate, caches, checks/caves | 2.5 | A21; gates E's A29 (x-person). **PARTIAL** (#20 on master; generateCave wrapper and checks/caves.ts pending) |
| A23 | K | monster, steer | 1 | A3 (x-person). **DONE** (#16) |
| A24 | E | fx, camera, depth, light | 1.5 | A3; depth.ts needs A22 caches (getDepthField), light.ts needs devourerMul (entities/monster.ts, pulled forward from C1). **DONE** (#9, #23) |
| A25 | E | intent, movement, explore | 1.5 | A24, A18 (x-person: A18 is K's); explore.ts done in #23 after A19/A24 part 2. **DONE** (#19, #23) |
| A26 | E | flame, pickups (the toast helper is `toast()` in core/state.ts per R-009; no systems/toast.ts) | 1.5 | A24. **DONE** (#15) |
| A27 | E | combat | 2 | A24, A26, A25 (Intent); resolveParries/resolveBites/damagePlayer also need A28 (setDying/toRecover; monsters.ts must never import combat.ts). **DONE** (#22, #27) |
| A28 | E | monsters, ai-lurker, director | 3 | A23, A25, A27 (x-person: A23 is K's). **DONE** (#26) |
| A29 | E | run, screens, step | 2.5 | A22, A28 (x-person: A22 is K's; critical path) |
| A30 | E | game.ts facade and slice-A integration | 1.5 | A17, A29 |
| A31 | K | flow, order, ai checks | 2.5 | A29 (x-person); may slip to B day 1 |
| A32 | K | light-flame, parry, damage, movement checks | 3 | A27 (x-person); may slip to B day 1 |

### Slice B (due Oct 22)

| Task | Owner | Files | h | Deps / note |
|---|---|---|---|---|
| B1 | E | mining, beacon | 1.2 | A29 |
| B2a | K | world/route.ts (routeDist, downhill, playerSources, exitHeading); split out of the original B2 (3 h = 1.2 + 1.8) | 1.2 | A22 |
| B2 | E | quake, rocks (imports route.ts) | 1.8 | B1, B2a (x-person) |
| B3 | E | ai-stalker, ai-escape | 1 | A28 |
| B4 | K | gen/pockets, gen/teach | 2 | A22 |
| B5 | K | validate, gen/populate | 3 | B4 |
| B6 | K | gen/fallback; extends caches and generate | 1.5 | B5 |
| B7 | E | core/storage; extends flame (minerals), pickups (size) | 2 | A26 |
| B8 | E | Extends movement (roll), run (escape win), director (escape table), game.ts (audioStep) | 2 | B2, B3, B12 (x-person: B12 is K's) |
| B9 | E | cave.check, rocks.check | 3 | B6, B2 (x-person: B6 is K's; E tests K's generator) |
| B10 | E | Slice-B integration, Day-6 playtest, tuning | 2 | All of B |
| B11 | K | economy.check, escape.check | 1.5 | B1, B7 (x-person) |
| B12 | K | audio trigger, mixer, engine | 3 | A8 |
| B13 | K | audio sfx, music | 2.5 | B12 |
| B14 | K | audio synth, synth-2 (P0 recipes) | 4 | B12 |
| B15 | K | scripts/pack-atlas.ts | 3 | A10 |
| B16 | K | images atlas and screens; atlas.json; atlas-0.png | 1 | B15; needs delivered art |
| B17 | E | render overlay; extends glow and props (rocks) | 2.5 | A17 |
| B18 | E | render particles (core events) | 2 | A17 |
| B19 | K | Extends layout, strings, platform (help, end, copy link) | 1.5 | A12 |
| B20 | K | Extends menus and hud; menus-end.ts if needed | 3 | B19, B2a (exitHeading in route.ts; now K's own task) |

### Slice C

| Task | Owner | Files | h |
|---|---|---|---|
| C1 | E | ai-devourer only (`devourerMul` is already added to K's `entities/monster.ts` in #23, A24 part 2; K reviews that hunk, see Risks) | 1 |
| C2 | E | tuning.ts calibration; README/CHANGELOG/itch page | 2.5 |
| C3 | K | debug.ts; devourer rows in src/checks/ai.check.ts (file owned by K via A31; tests the C1 behaviour) | 1.5 |
| C4 | K | Music layers and stingers (music, trigger) | 3 |
| C5 | K | P1/P2 recipes (synth-2, sfx) | 3 |
| C6 | E | particles full table, quality auto ladder, overlay polish, tiles atlas swap (the quality auto ladder moved to A14, #29) | 3 |
| C7 | K | UI fades and pulses (menus, hud) | 2 |
| C8 | K | Final asset integration by Oct 27 freeze (repack, check-assets, PENDING_AUDIO empty, README AI-process rows; the `package.json` hunk that adds check-assets to `npm run check` is made by Elias in the C8 PR review, as a commit on the PR branch or a follow-up PR; see section 1) | 2 |

## 5. Per-person totals

New files by first creation; hours include extension tasks.

| Person | A files | A h | B files | B h | C files | C h | Total files | Total h |
|---|---|---|---|---|---|---|---|---|
| Elias | 47 | 32.5 | 11 | 17.5 | 1 | 6.5 | 59 | 56.5 |
| Kittingsl | 42 | 32.5 | 18* | 27.2 | 1 | 11.5 | 61 | 71.2 |

\* Includes the conditional `menus-end.ts`, plus `atlas-0.png` (generated). Total: 120 file rows (59 + 61). B2a adds a task, not a file. Elias also spends about 20h on PR review and merging (not in the table).

Slice A hours per person (due Oct 20): **Elias 32.5 h, Kittingsl 32.5 h** (total 65 h). Since the rebalance of 2026-10-18 E carries render (A14-A17, 9.5 h) and A4, K carries the generation chain (A20-A22, 7.5 h), A23 and A7. 0.5 h moved from K to E with `scripts/check-guard.ts` (A7 to A5, see Change log).

Method: file counts come from the per-file tables in [[tasks-files]] (owner by slice); hours are the sum of the task rows in section 4 per owner. Check: 59 + 61 = 120 files; 56.5 + 71.2 = 127.7 h = 65 (A) + 44.7 (B) + 18 (C).

## Cross-person critical path

Gameplay needs K's world work. E's A25 (movement) needs K's A18, E's A28 needs K's A23, and E's A29 (run, screens, step) needs K's A22. E's A30 integration needs A17 (E, which itself needs K's A12/A13) and A29.

| Chain | Tasks | Hours | Owner |
|---|---|---|---|
| Foundation | A2 then A3 | 1.5 + 2 = 3.5 | E (merge first) |
| Grid, collision, LOS | A18 (after A2) | 1.5 | K |
| Cave generation | A20, A21, A22 (A20 after A3) | 2 + 3 + 2.5 = 7.5 | K |
| Monster base | A23 (after A3) | 1 | K |
| E gameplay chain | A24, A26, A27, A25, A28, A29 | 1.5 + 1.5 + 2 + 1.5 + 3 + 2.5 = 12 | E |
| Integration | A30 (needs A17 and A29) | 1.5 | E |

- **Recommendation:** Elias merges A2 and A3 first (3.5 h, nothing before them). K starts A18 as soon as A2 merges and A20 as soon as A3 merges. K order after A3: A20, A23, A21, A22 (A23 before A21 so E's A28 is not blocked; A22 then lands 1 h later but still before A29 needs it). E order: A2, A3, A24, A26, A27, A25, A5, A6, A28, A29, then A1 (done), A4, A14-A17, A30.
- **Earliest finish**, assuming about 11 productive hours per person per day (32.5 h of slice A each in 3 days), no waiting for review, and approvals done. Wall clock: Oct 18 = hours 0-11, Oct 19 = 11-22, Oct 20 = 22-33.
  - **Elias:** A3 merged at hour 3.5 (Oct 18). A25 done at hour 10. A5 (now 2 h, incl. `scripts/check-guard.ts`) done at hour 12. A6 done at hour 14 (unblocks K's A7). A28 done at hour 17. A29 done at hour 19.5 (Oct 19, afternoon). A1 at 20.5, A4 at 21.5. A17 done at hour 31. A30 and all of slice A at hour 32.5 (Oct 20, late). E's earliest finish moves by +0.5 h.
  - **Kittingsl:** A8 and A18 before the A3 merge. A20 done at hour 5.5, A23 at 6.5, A21 at 9.5, A22 at hour 12 (Oct 19, early). Float against E's need for A22 (hour 17): 5 h. Rest of slice A (A9-A13, A19, A7 (now 1.5 h), A31, A32) ends at hour 32.5 (Oct 20, late); K's earliest finish moves by -0.5 h. Order inside it matters for E: A9 must land before E starts A15 (hour 23.5) and A12 and A13 before E starts A17 (hour 30); A31 and A32 go last. A10 (images, atlas.json seed, check-assets) needs Elias's A4 (earliest hour 21.5): schedule A10 after A19 and A7, or the slice-A finish slips from hour 32.5 to about 38.5.
- **Single point of failure:** if A20 starts later than about hour 8, or A22 review waits, A29 and then A30 slip. Elias must review A18 and A20-A22 on the same day.
- Zero slack on both sides. E's review time (about 20 h over the project) is not in the clock above and pushes every E time later; see Risks.

## Deviations from the module tree

1. `systems/explore.ts` is moved from slice B to slice A. Without it, `world.explored` never fills, so the memory and dark pass cannot show a seeded cave in slice A.
2. `systems/rocks.ts` is in no S1–S22 list, but other specs name it (the world tree). It is added as a task. `toast()` lives in `core/state.ts` per R-009, so no `systems/toast.ts` is created.
3. E1 `entities/player.ts` is not created, because `initPlayer` lives in `core/state.ts`.
4. The `score.check.ts` in the systems tree duplicates the one in the core tree, so they are merged into one file (A7).
5. `menus-end.ts` is created only if `menus.ts` passes 300 lines.

## Risks and blockers

- **Approvals:** OD-1, OD-3 and OD-7 were approved on 2026-10-18 (A1 merged as #18). K is a collaborator with write access; K's PRs come from same-repo branches and run the `ci` check on the self-hosted runner.
- **Day-4 checkpoint.** The descent must be tense by Oct 20. If it isn't, fix the flame economy before B starts, and C2 (tuning) moves earlier.
- **Slice A is the tightest.** Slice A hours after the rebalance: **Elias 32.5 h, Kittingsl 32.5 h** in 3 days (about 11 h per person per day with zero slack). The mitigation is slipping checks, not shrinking gameplay files.
- **K slip order for slice A:** the chain A18 and A20-A22 (plus A23) is critical and never slips: E's A25, A28 and A29 depend on it (see Cross-person critical path). K's A31 and A32 checks slip first (to B day 1), then A7 and the partial hud parts.
- **E slip order for slice A (PROPOSAL for the owner to confirm):** A7 is now K's, so the E-side order is: A6 `state.check` first (the rest of A6 stays: input, all, package.json wiring), then render polish (glow and memory refinement in A15/A16, the A14 quality ladder beyond the minimum) to slice B day 1. Gameplay files A24-A30 and the core path A2, A3, A5 never slip, and the render path (A14-A17) must exist in plain form so A30 integrates.
- **Cave generation is the most complex algorithmic work** and now sits with K. If K is short on capacity, the fallback is that E takes A21 (macro, places, loops) while K keeps A20 and A22; that changes this plan and needs the owner's decision.
- **Seam S1 across people.** E's `render/index.ts` (A17) calls K's `ui/hud` and `ui/menus` (A12, A13). A signature mismatch surfaces only at A17. Mitigation: merge A12 and A13 before A17 starts; both follow [[architecture-modules-ui-assets]] signatures.
- **`entities/monster.ts` is K's file but E added `devourerMul`.** RESOLVED: the small additive hunk was pulled forward from C1 and done in #23 (A24 part 2), because `light.ts` needs it. K still reviews that hunk. If K objects, K adds the function from the spec in a one-line follow-up PR.
- **Assumptions.** Line counts for `rocks.ts`, the checks and `pack-atlas` are estimates. Hours are estimates, not taken from the specs.

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

Closed by the owner on 2026-10-18: the split of render and lighting (Elias) and of world generation (Kittingsl) is confirmed (see Change log).

1. Closed 2026-10-18: Kittingsl is a collaborator with write access.
2. Who produces the AI art and music? See [[architecture-assets-pipeline-2]] (hand-off and licensing). B16 and C8 depend on delivered art.
3. A31 and A32 (checks) may slip to B day 1. Is that acceptable?
4. Closed 2026-10-18: OD-1, OD-3 and OD-7 approved; A1 merged (#18).
5. Confirm the E-side slip order proposal (A6 `state.check` first, then render polish).
6. Confirm that Kittingsl has capacity for the world-generation chain (A20-A22, B2a, B4-B6). It is the most complex algorithmic work in the plan and gates E's A29.
7. Confirm that A4 (`core/noise.ts`, `core/view.ts`, `checks/render.check.ts`) moves to Elias together with render.
8. RESOLVED: E adds `devourerMul` to K's `entities/monster.ts`; done in #23 (A24 part 2). K reviews the hunk.

## Change log

- 2026-10-18 rebalance: render+lighting -> Elias; world generation + A7/A23 -> Kittingsl (owner decision). Details: all `src/render/*` (A14-A17, B17, B18, C6) and A4 to Elias; the whole `src/world/` (A20-A22, B4-B6, new B2a for `route.ts`, the rest of B2 stays Elias at 1.8 h), A7 and A23 to Kittingsl. `src/ui/*` stays with Kittingsl; A17 now depends on A12 and A13 across people (seam S1).
- 2026-10-18 (2): check-guard moved to A5 (Elias); check-assets wiring deferred to C8; A10 ordering note
- 2026-10-18 (3): progress synced to the merged state (see [[progress]]); A24/A26/A27 rows corrected; devourerMul pulled forward into A24 part 2
- 2026-10-18 (4): corrected PR count (23, including #24), check chain, file totals after the toast.ts removal; approvals-pending statements retired; invite status corrected (K is a collaborator), #24 added, approvals wording retired in the ownership row and A1 row
- 2026-10-19 (5): progress synced to master bd04c05 (A8, A14, A27, A28 done; PRs #26 to #29; R-127 owner ruling: covers all countdowns)

## Related

- [[progress]]
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

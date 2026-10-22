---
type: index
title: ai-jam-5 – AI Browser Game Jam 5 (Last Ember)
description: Hub for the ai-jam-5 project – itch.io AI Browser Game Jam 5 entry, theme TORCH; chosen concept Last Ember, scope status, and links to all project files.
tags: [project, ai-jam-5, game-design, last-ember, index, game-jam]
timestamp: 2026-10-22T21:00:00+02:00
---

# ai-jam-5 – AI Browser Game Jam 5

## Summary

- **Jam:** itch.io AI Browser Game Jam 5 (host Focaccai). Theme **TORCH**. Submissions close **2026-10-31 03:00 UTC**. Facts: [[jam-brief]].
- **Repo:** https://github.com/eliasstepanik/ai-jam-5 (owner eliasstepanik), v0.1.0. Vite 7 + TypeScript, vanilla canvas 2D, no engine, HMR scaffold (hot-swapped `src/game.ts`, state preserved).
- **CI:** GitHub Actions job `ci` on the project CI runner.
- **Chosen concept:** **Last Ember** – descend a seeded cave, light the Beacon, escape alive; the flame is fuel, health and sight. Spec: [[last-ember-design]].
- **Considered, not chosen:** Blowtorch Defense ([[alt-blowtorch-defense]]).

## Status

- **Status (2026-10-18):** Last Ember chosen; scope: build what we can. Architecture written; map enlarged to 320×240. E-1 RESOLVED by architect (O2 + O3, O1 rejected), E-2 RESOLVED (owner: bigger map). **Implementation started 2026-10-18 after the owner approved OD-1, OD-3 and OD-7.** 29 PRs are merged (#1, #2, #4 to #33): the foundation, the world generation core and most of the player-side systems are on master. `src/game.ts` is still the scaffold, so the game is not playable yet. Slice A is due 2026-10-20. Details: [[progress]].
- **Cave generator chain (2026-10-21):** Cave generator chain (A22 rest, B4-B6) implementation started 2026-10-21 under R-156..R-165 ([[architecture-rulings-3]] §7); depth classes R-164 planned.
- **Slice D, 2.5D view migration (2026-10-22):** the owner approved a fixed-south 3/4 look over the unchanged square grid and the 2D gameplay ("the game is pure topdown but it should be 2d but with a 2.5d look"). Decision: [[ADR-123-2-5d-view]]; binding rulings R-178..R-186 in [[architecture-rulings-3]] §9; delivered tileset and character atlas formats: [[ai-jam-5-asset-formats-25d]]; tasks D0..D15 in [[tasks]]. Planned only, nothing implemented yet.
- **Scope (owner, 2026-10-17):** "we will build what we can and see how far we get". Cut order is guidance only ([[last-ember-production-plan]]). The global leaderboard is dropped; the game has no online services.
- Design lead: saile2204. Team: undertaker7431, kittingsl. Repo owner: eliasstepanik. Open items: [[last-ember-open-questions]].
- **Architecture exists:** [[architecture]] is the hub (56 linked files: rulings, scale and economy rulings, module trees, topical specs, asset library). Agents read `projects/ai-jam-5/architecture.md` first; [[architecture-rulings]] (parts 1–3) is binding. OD-1, OD-3 and OD-7 are approved; slice A is under way ([[progress]]).

## Files

### Jam and concept

- [[jam-brief]] – jam rules, dates, voting categories, voter behaviour
- [[alt-blowtorch-defense]] – alternative concept (Blowtorch Defense) and earlier brainstorm ideas; considered, not chosen

### Last Ember (chosen concept)

- [[last-ember-design]] – self-contained gameplay spec: run structure, flame and health, parry, monsters, minerals, rendering notes, controls, score
- [[last-ember-production-plan]] – schedule, checkpoints, cut-order guidance, asset pipeline, team workflow, risks
- [[last-ember-open-questions]] – checklist of ASSUMPTION/OPEN items, conflicts and decision log

### Tasks

- [[tasks]] – task plan: Elias vs Kittingsl code ownership, assignment principles, task index for slices A/B/C and D (2.5D migration), totals, risks, process, open questions
- [[tasks-files]] – per-file assignment table (owner, slice, task id, estimated lines)
- [[progress]] – build progress synced to the merged state of master: done, partial and remaining tasks, deviations, open items

### Architecture

- [[architecture]] – hub: precedence, reading order, layer rule, slices A/B/C, pending owner decisions, index of all architecture files
- [[architecture-rulings]] – binding conflict resolutions (read first; part 2: [[architecture-rulings-2]]; part 3, scale follow-ups and GAP closures: [[architecture-rulings-3]])
- [[architecture-scale-and-economy]], [[architecture-scale-and-economy-2]], [[architecture-scale-and-economy-3]], [[architecture-scale-and-economy-4]] – binding 320×240 scale and economy rulings (map, energy, decision, budgets)
- [[architecture-economy-simulator]] – binding code for `src/checks/economy.check.ts`
- [[architecture-cave-generation-3]], [[architecture-cave-generation-4]] – cave generator at 320×240 (macro layout, quotas, validation, tests)
- [[architecture-economy-check]] – flame economy and pacing check, 160×120 (superseded history; source of E-1, E-2)
- Module trees: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-systems-2]], [[architecture-modules-render]], [[architecture-modules-render-2]], [[architecture-modules-ui-assets]], [[architecture-modules-ui-assets-2]]
- State, determinism, save, tuning: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]], [[architecture-determinism]], [[architecture-scoring-and-save]], [[architecture-tuning]], [[architecture-tuning-2]]
- Gameplay systems and AI: [[architecture-systems]], [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]], [[architecture-monsters-ai]], [[architecture-monsters-ai-2]]
- World: [[architecture-cave-generation]], [[architecture-cave-generation-2]], [[architecture-rocks]], [[architecture-rocks-2]], [[architecture-world-queries]], [[architecture-world-queries-2]]
- Render, resources, UI, host: [[architecture-render]], [[architecture-render-2]], [[architecture-render-3]], [[architecture-resources]], [[architecture-resources-2]], [[architecture-resources-3]], [[architecture-ui]], [[architecture-ui-2]], [[architecture-host-changes]], [[architecture-host-changes-2]]
- Assets: [[architecture-assets-style]], [[architecture-assets-sprites]], [[architecture-assets-sprites-2]], [[architecture-assets-sprites-3]], [[architecture-assets-audio]], [[architecture-assets-audio-2]], [[architecture-assets-pipeline]], [[architecture-assets-pipeline-2]]
- 2.5D view (slice D): [[ADR-123-2-5d-view]] – decision record (fixed-south 3/4 look, rejected alternatives); [[ai-jam-5-asset-formats-25d]] – formats of the delivered `cave_tileset` and character atlas; rulings R-178..R-186 in [[architecture-rulings-3]] §9

## Existing KB context

- [[vite-canvas-hmr-state-preservation]] – HMR state-preservation pattern used by the scaffold
- [[2026-10-13-ai-jam-5-repo-and-hmr-scaffold]] – repo and scaffold setup session

## Next steps

1. Resolve the items in [[last-ember-open-questions]].
2. ~~Write `projects/ai-jam-5/architecture.md`~~ done: [[architecture]]. E-1/E-2 resolved 2026-10-18. OD-1, OD-3 and OD-7 approved; implementation started 2026-10-18.
3. Finish slice A by Day 4 (Oct 20): the monster, run and step systems, the render tree, the UI and asset basics and the `game.ts` facade, so the descent is playable. Then tune the light economy live with hot reload ([[last-ember-production-plan]]). Status and remaining work: [[progress]].
4. Full-loop playtest on Day 6 (Oct 22).

## Related

- [[progress]]
- [[tasks]]
- [[tasks-files]]
- [[architecture]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-scale-and-economy-4]]
- [[architecture-economy-simulator]]
- [[architecture-cave-generation-3]]
- [[architecture-cave-generation-4]]
- [[architecture-economy-check]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[jam-brief]]
- [[alt-blowtorch-defense]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]
- [[vite-canvas-hmr-state-preservation]]
- [[2026-10-13-ai-jam-5-repo-and-hmr-scaffold]]

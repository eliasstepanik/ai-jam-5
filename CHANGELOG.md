# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tossing minerals (1-3 select, F toss, G shake off) and small/large resin.
- Mining: hold E within 40 px of an ore vein for 2 s (3 energy per second) to take its pieces, up to 3 of each mineral in the pouch. Moving, rolling or running out of energy cancels. A full pouch shows "Pouch full". The mined ore disappears from the wall at once (`world.veinGen` is part of the wall chunk key).
- The Beacon: hold E within 36 px for 5 s (4 energy per second) to light it and start the escape. It needs at least 40 energy to start (below that it shows "The Beacon needs more light" and costs nothing). Moving, releasing E or losing the flame cancels the hold. Lighting it floods the cave with light and kills all monsters without kill credit.
- Best score and settings (volume, mute, reduced flash, last seed) persist in localStorage (`src/core/storage.ts`). A blocked or full store shows "Saving disabled in this browser" once and the game carries on.
- D slice 2.5D view: fixed-south three-quarter view over the unchanged square grid. Wall caps get 48 px south faces, and walls, monsters, the player and props are depth-sorted row by row.
- Cave tileset `src/assets/cave_tileset.png` and `src/assets/cave_tileset.json`, used for floor and walls. Ore veins are baked on south-facing walls.
- Character atlas `src/assets/characters.png` and `src/assets/characters.json` for the player and the Lurker, Devourer and Stalker animations, including the torch flame palette swap. `scripts/trim-characters.ts` builds it from `art/characters-source.json`.
- Camera clamp to the map with a 48 px south overhang.
- Asset validation in `scripts/check-assets.ts` (tileset 94 frames, characters 1232 frames, size limits), wired into `npm run check`.
- A30 playable slice-A game: `src/game.ts` is now a thin facade over the real game. The title, help, pause, dead and won screens, the HUD and the cave with fog memory now render, and the fixed-step simulation (`step`) and `platformStep` run every update. Mouse input works on the menus: hovering a button moves the focus to it, a click activates the button it hits, a click on empty space does nothing, a click on the seed field only focuses it, a help tab click selects its page, and a click outside the help panel goes back. In dev builds, Backquote toggles the debug flag and Shift+1..6 toggle reveal, god mode, debug overlay, frozen AI, path display and the render quality override. Audio and the debug overlay panel are not wired yet.
- A29 run lifecycle, screens and fixed-step driver: `startRun`, `endRun` and `checkEnd` manage a run, with cave generation split into chunks through `genStep`; if no valid cave comes out, the fixed fallback cave is used and `startRun` logs it with `console.warn`. The screen state machine covers title, help, playing, paused, dead and won, with input lockouts, a quit confirmation, pause on the `'Blur'` pseudo-key, mute and volume keys, and the seed field. `step()` runs the existing systems in the documented order, with hitstop handling and a click buffer. Three checks are registered in `npm run check`: `run.check.ts` (run lifecycle, chunked cave generation equal to the synchronous one including the fallback cave, determinism), `step.check.ts` (step order and behaviour: hitstop click buffer, bites and parries, zone tracking, screen timers, quit confirm, volume, mute and the seed field cap) and `screens.check.ts` (screen controls: help return target and paging, menu cursor wrap, Space, click and Enter activation, seed field editing, end-screen navigation and copy link, `startRun` UI reset, phase guards). Saving best scores and settings arrives with the storage task. The B-slice systems (roll, quake, mining, beacon, minerals) are not wired into `step()` yet.
- C3 cave generator wrapper: `generateCave(seed, opts)` runs up to 8 attempts, each carve, populate and `validateCave`, and the first valid cave wins (`forceFail` option for testing the fallback). `finalizeCave` sets `stats.mainLoop` once per accepted cave. `fallbackCave(seed)` builds a fixed-geometry ring cave with 0 RNG draws for the ring itself (populate still draws from a seed derived from `'cave:fallback'`); it returns a validated cave or throws, with `stats.attempts` of 9. `caveOf(seed)` in `src/checks/caves.ts` memoizes cave results for checks.
- A8 asset foundations: complete sprite and sound catalogs, a lazy resource registry that survives hot reload, and actor-sheet helpers for eight north-first direction rows with frame counts derived from image width. Actual art loading and integration remain separate tasks.
- A19 exploration and spawn queries: signed JSON-safe explored bits, occluded radius reveal, deterministic nearest-floor recovery and fixed-draw spawn sampling, with registered world-query and cache checks.
- A22 terrain attempts and derived world caches: deterministic cave-core generation with rejection rules, base depth and zones, Beacon-room masks, pending masks, and reusable escape-distance buffers. The populated generator wrapper and the cave-result memo helper are described in the `generateCave` entry above.
- Host input: `'Blur'` pseudo-key in `Input.pressed` on window blur or tab hide, and `Input.view` with the canvas size in CSS pixels and `devicePixelRatio`.
- Host loop: fixed-step time budget (12 ms) so a slow frame drops its backlog instead of freezing.
- A21 cave layout helpers: seeded macro trees and masks, connected spine carving, entrance and Beacon placement with guarded chamber carving, and verified loop tunnels that preserve the descent path length.
- A23 monster foundations: complete spawn records with deterministic gameplay randomness and light-aware ring defaults, plus arrival steering and smooth velocity blending. The spawn caller supplies the light radius to preserve the layer rules.
- A20 cave foundations: deterministic grid BFS and shortest paths, border-safe carving brushes, largest-region selection, noise fill, five-pass cellular smoothing, widening and diagonal repair.
- A18 world queries: coordinate and tile helpers, deterministic neighbours, circle movement with sliding and anti-tunnelling substeps, and symmetric tile line of sight. Brought forward the complete solidity cache from A22 to resolve A18's missing dependency; other A22 caches remain separate.
- `docs/`: local copy of the Last Ember project plan from the knowledge base (design, binding architecture rulings, module tree, asset library, economy and scale rulings), as a verbatim snapshot. Start at `docs/index.md` and `docs/architecture.md`. `docs/MANIFEST.sha256` lists the sha256 of every copied file for drift detection.
- `docs/tasks.md` and `docs/tasks-files.md`: task breakdown (slices A, B, C; ids, dependencies, hours) and per-file ownership assigning each part of the code to Elias or Kittingsl.
- `docs/progress.md` and refreshed `docs/tasks.md`, `docs/tasks-files.md`, `docs/index.md`: build progress synced to the merged state of master (done, partial and remaining tasks, deviations, open items). The manifest now covers 69 files.

### Changed

- World, entities and props rendering rewritten for the 2.5D look at scale 1.0. The old top-down sprite sheets only remain for monster eyes and UI art.
- Image loader preloads the tileset and the character sheets before the title screen is ready.
- Resources version bumped to 2 (chunks use two canvases: floor and walls).
- Enemy animation specification: all three shades use 64×64 body and eye frames with eight authored directions per action, selected by facing without sprite rotation. Updated naming, rendering, fallback, scaling and atlas totals (512 enemy frames; 1064 catalog frames).
- Copy link on the end screen now copies a shareable `?seed=` URL built from the page address.

- Host input: only the primary mouse button counts as a click, and the right-click menu is suppressed on the canvas.
- `index.html`: page title, description, favicon, black background and crosshair cursor for Last Ember.
- Player animation specification: 64×64 frames, eight authored directions, separate torch/no-torch sets with the stick integrated, and four-frame walk cycles. Updated rendering, naming, fallback and atlas-planning contracts; graphics delivery remains in progress.

- `AGENTS.md`: documents the `docs/` snapshot, its precedence order and the rule that the knowledge base stays the source of truth.
- `README.md`: lists `docs/` in the project layout and adds a short "Project plan" section.
- `docs/tasks.md`, `docs/tasks-files.md`: task ownership rebalanced — render and lighting (`src/render/*`) go to Elias; world generation (`src/world/*`), determinism and score checks and monster/steer go to Kittingsl; cross-person critical path documented. `scripts/check-guard.ts` is created by Elias in A5 so `npm run check` stays green; `check-assets` joins `npm run check` in C8.

## [0.1.0] - 2026-10-13

Initial scaffold.

### Added

- Vite 7 + TypeScript canvas game scaffold.
- Stable host `src/main.ts`: fixed 60 Hz timestep loop, DPR-aware canvas, keyboard and pointer input.
- Hot-swappable game module `src/game.ts` (`init` / `update` / `render`).
- HMR with state-preserving merge (`src/merge.ts`) and optional idempotent `migrate` export for state-shape changes.
- Error overlay for update/render/hot-swap failures and incompatible saved state; the game loop keeps running.
- Dev-only `R` key to reset game state.
- Pointer events, so mouse and touch both work.
- `npm run check` assertion test for the merge/migrate logic (`src/check.ts`).
- Production build with relative base (`./`), so `dist/` runs from any subpath on itch.io.
- `npm run zip` script that builds and packs `dist/` into `game.zip`.
- `README.md` with setup, workflow, and build/deploy instructions.
- `AGENTS.md` with instructions for AI coding agents working in this repo.
- CI workflow `.github/workflows/ci.yml`. Job `ci` runs `npm run check`, the build, and a `dist/` sanity check. Fork PRs run on a GitHub-hosted runner; all other PRs run on the self-hosted runner registered on this repo.
- `master` branch protection: pull request required, `ci` check required and branch must be up to date, force-push and deletion disabled.
- This `CHANGELOG.md`.

[Unreleased]: https://github.com/eliasstepanik/ai-jam-5/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/eliasstepanik/ai-jam-5/releases/tag/v0.1.0

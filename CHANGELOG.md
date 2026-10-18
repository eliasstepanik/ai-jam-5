# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A18 world queries: coordinate and tile helpers, deterministic neighbours, circle movement with sliding and anti-tunnelling substeps, and symmetric tile line of sight. Brought forward the complete solidity cache from A22 to resolve A18's missing dependency; other A22 caches remain separate.
- `docs/`: local copy of the Last Ember project plan from the knowledge base (design, binding architecture rulings, module tree, asset library, economy and scale rulings), as a verbatim snapshot. Start at `docs/index.md` and `docs/architecture.md`. `docs/MANIFEST.sha256` lists the sha256 of every copied file for drift detection.
- `docs/tasks.md` and `docs/tasks-files.md`: task breakdown (slices A, B, C; ids, dependencies, hours) and per-file ownership assigning each part of the code to Elias or Kittingsl.

### Changed

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

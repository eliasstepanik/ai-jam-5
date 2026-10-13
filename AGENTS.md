# AGENTS.md

Instructions for AI coding agents working in this repo. Human-facing docs are in `README.md`.

## Purpose and constraints

Entry for the itch.io AI Browser Game Jam 5. Vite 7 + TypeScript, vanilla canvas 2D, no engine.

- Browser only (HTML5). No download, no native code.
- Small bundle. Add a dependency only if a few lines of code cannot do the job.
- No external runtime services (no CDNs, APIs, analytics). The build must work offline from `dist/`.

## Golden rule

Gameplay code goes in `src/game.ts`. `src/main.ts` is the stable host (canvas, fixed-step loop, input, HMR) and is rarely edited. Change it only for a real host need, such as a new input type. `src/merge.ts` is pure state-merge logic covered by `src/check.ts`.

## Hot-reload contract (preserve it)

`game.ts` is re-evaluated on every save and hot-swapped while the game runs.

- Keep `State` evolving additively. Give every new `State` field a sensible default in `init()`. The default merge is `{ ...init(), ...old }`: old values win and missing keys are filled from `init()`.
- If a change needs real conversion, export `migrate(oldState)`. It runs on every swap, so it must be idempotent: `migrate(migrate(x))` equals `migrate(x)`. Fill missing defaults only. Never transform valid values (no `score * 2`).
- Never keep game state in module-level variables in `game.ts`. They reset on every swap. Put it in `State`. Module-level constants are fine.
- No module-level side effects in `game.ts` (timers, event listeners, audio contexts, `requestAnimationFrame`) without cleanup. The module re-runs on every save and would stack duplicates. Create such resources lazily through `State` or the host, or guard them with `import.meta.hot` dispose logic.
- Keep the signatures: `init(): State`, `update(s, input, dt): void`, `render(ctx, s, w, h): void`, optional `migrate`. `dt` is a fixed `1/60`. `Input` is defined in `main.ts`.
- Removed `State` keys linger after a swap (shallow merge). Use `migrate`, or press `R` in dev to reset.

## Adding modules

New files imported from `game.ts` get HMR automatically. They are re-evaluated when edited, so the same rules apply: state lives in `State`, with no unmanaged module-level side effects. Split by responsibility (entities, audio, drawing helpers) and import with the `.ts` extension, as the existing code does.

## Verify before declaring done

1. `npm run check` exits 0 (prints `check ok`). Needs Node >= 22.18.
2. `npm run build` exits 0. It runs `tsc --noEmit` first, so type errors fail it.
3. For gameplay changes, run `npm run dev` and watch the browser console. A good edit logs `[hmr] game.ts swapped, state kept`. A page reload, or a red overlay, means something broke the contract or threw.

Delete `dist/` and any `game.zip` after local verification. Both are git-ignored.

## Code conventions

- TypeScript `strict`, plus `noUnusedLocals`/`noUnusedParameters`. `erasableSyntaxOnly` is on: no `enum`, `namespace` or parameter properties. Use union types and plain objects.
- `verbatimModuleSyntax`: use `import type` for type-only imports.
- Keep each file under 300 lines. Split into modules before it grows past that.
- Mark a deliberate simplification with a `// ponytail:` comment that names the ceiling and the upgrade path, as in `merge.ts` and `main.ts`.
- No `TODO`, stubs or placeholder code. Finish it or do not add it.
- Match the existing style: no semicolons, single quotes, 2-space indent.

## Asset policy

- Prefer procedural drawing on the canvas and generated audio through WebAudio. They cost no bundle size and have no licence issues.
- Only ship content we have the right to distribute. Credit every third-party asset (source and licence) in the README.
- Keep the bundle small. Compress images, avoid large audio files, and import assets through Vite so they are hashed and use relative paths (`base: './'`).

## Jam-specific

- The jam requires that the majority of the game is AI-generated and rewards sharing the process. When you add a notable AI-generated asset (art, sound, music), or change the tools or pipeline, add a note to the `AI process` section of `README.md`: tool, prompt or summary, and how the output was processed.

## Git and docs

- Commits go through the user's workflow. Do not force-push. Use conventional-commit messages like the existing history (`feat: ...`, `fix: ...`, `docs: ...`).
- Long-form notes and design docs live in the author's knowledge base, not in this repo. `README.md`, `AGENTS.md` and `CHANGELOG.md` are the only `.md` files here. Do not add others.

## CI and merging

- `master` is protected. Every change goes through a PR from a feature branch. No force-push to, or deletion of, `master`.
- Required status check: the GitHub Actions job `ci` (`.github/workflows/ci.yml`). It runs on the self-hosted runner (labels `[self-hosted, Linux, X64, proxy]`) and does `npm ci`, `npm run check`, `npm run build`, then a `dist/` sanity check.
- The runner is registered per repo (personal account). Fork PRs run on GitHub-hosted `ubuntu-latest`, same-repo PRs on the self-hosted runner. See README "Runner security".
- Run `npm run check && npm run build` locally before pushing.
- The PR branch must be up to date with `master` before it can merge.

## Changelog

Every user-visible change adds an entry under `## [Unreleased]` in `CHANGELOG.md`, in the same PR. Use Keep a Changelog groups: `Added`, `Changed`, `Fixed`, `Removed`.

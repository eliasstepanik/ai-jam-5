# ai-jam-5

A browser game built with AI agents for the itch.io **AI Browser Game Jam 5**. Vite 7 + TypeScript, vanilla canvas 2D, no engine. Edit `src/game.ts`, save, and the running game updates in place with its state intact.

Repo: https://github.com/eliasstepanik/ai-jam-5

## Jam info

| | |
|---|---|
| Jam | AI Browser Game Jam 5 on itch.io (host: Focaccai) |
| Submissions | Oct 17 03:00 to Oct 31 03:00, 2026 |
| Theme | Revealed Oct 17 |
| Format | Web / HTML5 only, no download |
| Rules | Majority of the game must be AI-generated; third-party assets must be credited; sharing your process (tools, prompts) is encouraged |
| Voting | Overall, Fun, Graphics, Audio, Theme, AI Usage |

## Quick start

Requires Node >= 22.18.

```sh
npm install
npm run dev
```

Open the URL Vite prints.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload. |
| `npm run build` | Type-check (`tsc --noEmit`), then production build into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm run check` | Run `src/check.ts` (state-merge tests) with Node's built-in TypeScript type stripping. Prints `check ok`. |
| `npm run zip` | Run `build`, then zip the contents of `dist/` into `game.zip` at the repo root. Needs the `zip` binary on your PATH. |

## Hot reload

Save `src/game.ts` and Vite swaps the module without a page reload. The game keeps running with its current state.

- **State merge** (`src/merge.ts`): old state values win. Keys added to `State` since then are filled from `init()`.
- **`migrate`**: if `game.ts` exports `migrate(oldState)`, it is used instead of the default merge. It runs on every hot swap and every `main.ts` re-run, so it must be idempotent: `migrate(migrate(x))` equals `migrate(x)`. Fill missing defaults; never transform values that are already valid.
- **Editing `main.ts`**: the module re-runs. Listeners and the animation frame are torn down, and state is handed over through `import.meta.hot.data`.
- **Errors**: an exception in `update`, `render` or the hot swap (including a throwing `migrate`) shows a red overlay with the stack, logged once to the console. The loop keeps running. Fix the code and save to recover. An exception thrown by `init()` itself at startup is not caught: the page fails to start until you fix `game.ts` and save.
- **Syntax errors**: Vite shows its own overlay. The old code keeps running.
- **`R` key**: resets state via `init()`. Dev only (`import.meta.env.DEV`), not present in the build.

## The `game.ts` contract

`src/main.ts` is a stable host (canvas, loop, input, HMR). Game logic lives in `src/game.ts`, which exports:

```ts
export type State = { /* your game state */ }
export function init(): State
export function update(s: State, input: Input, dt: number): void
export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void
export function migrate(oldState: any): State // optional, must be idempotent
```

`Input` (defined in `src/main.ts`):

```ts
type Input = {
  keys: Set<string>                                  // held, KeyboardEvent.code
  pressed: Set<string>                               // went down since the last update step
  mouse: { x: number; y: number; down: boolean }     // CSS pixels == game coordinates
  clicks: { x: number; y: number }[]                 // mousedowns since the last update step
}
```

- **Fixed timestep**: `update` runs at 1/60 s (`dt` is always `1/60`). Frame time is clamped to 0.25 s so a tab-away does not cause a catch-up spiral.
- **`render`** runs once per animation frame. `w` and `h` are in CSS pixels. The host applies the devicePixelRatio transform before calling it.
- Pointer input uses pointer events, so mouse and touch both work.

## Project layout

```
.
├── index.html        # page shell, full-window canvas styling
├── package.json      # scripts, Node >= 22.18
├── tsconfig.json     # strict, erasableSyntaxOnly
├── vite.config.ts    # base './' for relative asset paths
├── src/
│   ├── main.ts       # host: canvas, fixed-step loop, input, HMR (rarely edited)
│   ├── game.ts       # the game: State, init, update, render (edit this)
│   ├── merge.ts      # pure state-merge used on every hot swap
│   └── check.ts      # tests for merge.ts, run by `npm run check`
├── docs/             # project plan: design, architecture, task split — snapshot of the knowledge base
│   ├── index.md      # hub, start here
│   └── tasks.md      # who implements what (Elias or Kittingsl)
├── .github/
│   └── workflows/
│       └── ci.yml    # required PR check `ci` (self-hosted; fork PRs: ubuntu-latest)
├── CHANGELOG.md      # Keep a Changelog, entries under [Unreleased]
├── README.md
└── AGENTS.md         # instructions for AI coding agents
```

`dist/`, `node_modules/` and `*.zip` are git-ignored.

## Contributing / CI

- `master` is protected. Open a PR from a feature branch; direct pushes to `master` are blocked by protection (the repo owner can bypass as admin), as are force-pushes and deletion.
- The `ci` check ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) must pass and the branch must be up to date with `master`. Run `npm run check && npm run build` locally first.
- `ci` runs on a self-hosted runner for non-fork PRs (fork PRs use a GitHub-hosted runner, see [Runner security](#runner-security)). This repo lives on a personal GitHub account, so runners are registered per repo and cannot be shared with other repos. Job `ci` needs a runner registered on https://github.com/eliasstepanik/ai-jam-5 with labels `self-hosted`, `Linux`, `X64`, `proxy`. For non-fork PRs the job waits for a runner, and GitHub fails it after ~24 h if none picks it up.
- User-visible changes get an entry under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).

### Runner setup

1. On GitHub: Settings → Actions → Runners → New self-hosted runner (Linux, x64). Download and unpack as shown there.
2. Configure it with a token from that page. `Linux` and `X64` labels are added automatically:
   ```sh
   ./config.sh --url https://github.com/eliasstepanik/ai-jam-5 --token <token-from-GitHub-UI> --labels proxy --ephemeral
   ```
3. Start it with `./run.sh`. An ephemeral runner takes one job, then deregisters, so wrap `config.sh` + `run.sh` in a loop or service that re-registers with a fresh token. The registration token from the UI expires after 1 hour, so an automated re-register loop must request fresh tokens from the API (`POST /repos/eliasstepanik/ai-jam-5/actions/runners/registration-token`, needs a PAT with repo admin scope); the simplest alternative is a non-ephemeral runner in a throwaway VM/container. Running it inside a throwaway container or VM is recommended.
4. Node is optional on the host: `actions/setup-node` downloads Node 24 if none is cached.

### Runner security

- The repo is public. Fork PRs run on GitHub-hosted `ubuntu-latest` (the `runs-on` of job `ci` is conditional), so untrusted code never executes on the self-hosted host, and they still produce a real `ci` result. Same-repo PRs run on the self-hosted runner.
- Also set Settings → Actions → General → Fork pull request workflows → "Require approval for all external contributors".
- Never share the runner's host with secrets or other projects.

## Project plan

The plan lives in [`docs/`](docs/). Start at [`docs/index.md`](docs/index.md). The architecture hub is [`docs/architecture.md`](docs/architecture.md). [`docs/tasks.md`](docs/tasks.md) says who implements what (Elias or Kittingsl).

`docs/` is a read-only snapshot of the author's knowledge base. Do not edit it in PRs; propose plan changes in the PR description or an issue.

## Shipping to itch.io

1. `npm run build`
2. Zip the **contents** of `dist/` so `index.html` sits at the zip root (`npm run zip` does this and writes `game.zip`).
3. Upload to itch.io and tick **This file will be played in the browser** (HTML5).

`vite.config.ts` sets `base: './'`, so all asset paths are relative and the build works from any subpath, including itch.io's iframe.

## Troubleshooting and known limits

- **Shallow merge.** The default merge is `{ ...init(), ...old }`. Nested objects are not deep-merged, and keys removed from `State` linger in the live state. Export `migrate` or press `R` when the shape changes deeper than adding top-level keys.
- **Blur after a DPR change.** The canvas backing size is only recalculated on window `resize`. Moving the window to a screen with a different devicePixelRatio can look blurry until the next resize.
- **No interpolation.** `render` draws the latest fixed step as-is, so motion can stutter on 120/144 Hz displays.
- **`npm run check` needs Node type stripping** (Node >= 22.18). Older Node fails on the `.ts` import.
- **`erasableSyntaxOnly` is on.** No `enum`, `namespace` or constructor parameter properties. Use union types, plain objects and normal fields.
- **Long error lines clip** in the overlay (no wrapping). The full text is in the browser console.

## AI process

This repo was scaffolded with Claude Code and opencode agents. The jam rewards sharing process, so add notes below as the jam proceeds. Record:

- Tools and models used (agent, model, editor), and for which part of the game.
- Key prompts, or a link or summary of them, for the gameplay code, art and audio.
- The pipeline for generated assets: how each sprite, sound or music track was produced, then processed and included.
- Third-party assets and their sources and licences, so credits are complete.
- What AI got wrong and how you corrected it.

- A8 asset foundations were implemented with Codex from the catalog and Kittingsl's sheet layout: one actor animation per sheet, 64×64 cells, direction rows N/NE/E/SE/S/SW/W/NW, with frame counts derived from width. This adds metadata and resource handling; artwork, palettes and torch-colour sheets are not integrated yet.
- Two AI-generated, user-supplied art packs are bundled for the 2.5D view. The PNGs are used as delivered; only the character frame list is post-processed. The packs were created by the repo owner with AI tools; the specific generator and prompts are not recorded in this repository.
  - Cave tileset: `src/assets/cave_tileset.png` and `src/assets/cave_tileset.json` (512×512, 94 frames).
  - Character atlas: `src/assets/characters.png` (4096×2048, 1232 frames). `scripts/trim-characters.ts` rewrites `art/characters-source.json` into `src/assets/characters.json`. The PNG is not modified.

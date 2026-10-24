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

## Last Ember: how to play

Theme: TORCH. You carry the last flame of a dying torch down a seeded cave. The flame is your light, your shield and your clock. Go deep, light the Beacon at the bottom, then run back up to the entrance before the cave collapses. Deeper is worth more, and dying still scores. During the escape a glowing ember wisp floats ahead of you and shows the way to the exit.

| Input | Action |
|---|---|
| `W` `A` `S` `D` or arrow keys | Move |
| Mouse | Face while standing; moving faces the travel direction |
| Left click | Swing the torch / parry a lunging shade (click as its eyes flare) |
| `E` (hold) | Mine an ore vein, or light the Beacon |
| `1` `2` `3` | Pick a mineral (changes the flame colour and its effect) |
| `F` / `G` | Toss the picked mineral into the flame / shake the mineral off |
| `Space` | Roll (escape only) |
| `Esc` or `P` | Pause |
| `M` | Mute toggle |
| `Enter`, `T`, `C` | Confirm selected button, retry seed, copy a share link |

The title screen has a seed field. The same seed gives the same cave, and the end screen can copy a `?seed=` link. Your best score (with its seed) is stored in the browser (localStorage). The in-game Help screen explains parrying and minerals.

Sound: music, ambience and effects come from a WebAudio engine (`src/audio/`). `M` toggles mute and the Sound row in Settings sets the volume (left/right or `-`/`=`). Sounds without a shipped sample file fall back to a procedural synth recipe, so the game is never silent by accident. See [Audio](#audio).

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
| `npm run gen-audio` | Generate audio candidates on a ComfyUI server (`COMFY_URL` required), or install picked ones with `--pick`. Dev tool only, see [Audio](#audio). |

## Developer tools

In development, click **DEV** in the lower-right corner or press **F2** / **Backquote**. Exported builds opt in with `?debug=1` (or `&debug=1` alongside a seed).

- **Player:** noclip (default 4x speed, adjustable 1–10x), infinite HP, freeze torch drain, remaining torch duration/fuel slider, extinguish/refill, and kill player.
- **Enemies:** spawn a Lurker, Stalker, or Devourer on clear nearby floor, freeze AI, and show player/enemy animation clips and frame indices above their sprites (plus enemy AI state). The same label toggle is available on the Player tab.
- **Inspect:** disable visual fog, show ground collision shapes/wall cells, show hurt and swept bite volumes/swing reach, and toggle FPS, frame/p95/CPU timings, quality, cache, entity counts, and player/run stats.

Panel clicks and drags do not attack or activate menus. Torch time is estimated at the current zone/mineral burn rate; freezing drain also prevents mining, Beacon, bite, and parry costs. Infinite HP is independent of torch drain. Turning noclip off inside rock returns the player to the nearest clear floor. Debug choices survive hot reload and restarting a run.


In **DEV → Enemies**, **Force nearest enemy leap** immediately launches the nearest enemy in clear sight at the player. Spawn an enemy first if needed. This skips windup/cooldown and resumes frozen AI; collision, parries and damage work normally.

Developer navigation is in **DEV → Navigate**: teleport to the entrance or Beacon, pick the depth class (Shallow, Short, Standard, Deep; during a run this restarts the same seed in that class, on the title screen it sets the class for the next run), toggle the black/white minimap beside health, and choose a Beacon or cave-exit direction arrow around the player. The arrow shows direct bearing; it does not route around walls.

## Audio

- **Engine** (`src/audio/`): WebAudio. A mixer has four groups (music, ambience, sfx, ui) with ducking (for example on pause) and a master chain with a compressor. One-shot voices are capped (24), so busy fights do not pile up. Mute (`M`) and volume are stored in the settings.
- **Samples and fallback:** each sound id (`src/assets/sounds.ts`) loads `src/assets/audio/<id>.ogg` (Opus) or `<id>.mp3`. The format is picked once with `canPlayType`. A sound with no sample file plays its procedural synth recipe (`src/audio/synth*.ts`) instead. `PENDING_AUDIO` in `sounds.ts` lists the 14 sounds that still depend on a sample.
- **Sample pipeline** (dev only, nothing here runs in the game): `npm run gen-audio` reads `tools/audio-manifest.json` (prompt tags, duration and seed per sound, 4 seed candidates each) and sends `tools/comfy/lastember_post.json` to a ComfyUI server given by the `COMFY_URL` environment variable (`COMFY_URL=http://<host>:8188 npm run gen-audio`; `--dry-run` needs no server). The workflow generates the clip with ACE-Step 1.5 turbo (`ace_step_1.5_turbo_aio.safetensors`), then trims it, makes it mono, cuts below 80 Hz, applies a fade envelope, peak-normalises it and exports Opus in Ogg (96k) and MP3 (V0).
- **Auditioning is human:** the raw candidates land in the git-ignored `tools/audio-raw/`. The author listens, records the winning seed as `chosenSeed` in the manifest, and `npm run gen-audio -- --pick` copies those takes into `src/assets/audio/`. The pipeline does not choose for the author.
- The post-processing nodes come from the ComfyUI community packs `audio-batch` and `DJZ-Pedalboard`. They are workflow tooling and not shipped.

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
│   ├── check.ts      # tests for merge.ts, run by `npm run check`
│   └── audio/        # WebAudio engine, mixer and synth fallback recipes
├── scripts/          # dev scripts (gen-audio.ts, trim-characters.ts, checks)
├── tools/            # audio manifest and ComfyUI workflow for gen-audio
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

- Unlit walking reuses the delivered lit walking poses at runtime and removes only the three reserved flame colours. Body/torch pixels, atlas files and timing remain unchanged.

The jam requires that the majority of the game is AI-generated. This section says what was generated, with which tools, and how it was processed. Facts here are taken from the repo; open items are marked `OWNER TO FILL:`.

### Code and design

- All game code, the checks and the build setup were written by AI coding agents working on the repo. The repo was scaffolded with Claude Code and opencode agents. The day-to-day workflow was an opencode-based multi-agent setup: an orchestrator agent splits the work into small chunks, builder sub-agents implement them, and reviewer sub-agents check the result. The models were Claude models. Codex was also used for part of the asset foundations (see Assets).
- The design, the architecture rulings and the task split were written as a project plan with AI help and are kept as a snapshot in [`docs/`](docs/) (start at `docs/last-ember-design.md`).
- Every change goes through a PR with the `ci` check (`npm run check` and `npm run build`). The checks include seeded property tests and an economy simulator for the flame budget.
- OWNER TO FILL: link or short summary of the key prompts for the gameplay code (the repo does not record them).
- OWNER TO FILL: what the AI got wrong and how it was corrected (the repo does not record this).
- Balance: tuning values are checked by scripted bot runs, not by human playtests. No human playtest data exists yet, so some pacing numbers may be off.

### Assets

| Asset | Origin | Processing |
|---|---|---|
| Cave tileset: `src/assets/cave_tileset.png` (512×512) and `cave_tileset.json` (94 frames) | AI-generated art pack supplied by the repo owner | Used as delivered. Floor, wall caps, south faces and ore-vein frames are cut out at runtime from the frame rects in the JSON. |
| Character atlas: `src/assets/characters.png` (4096×2048, 1232 frames of 64×64: the player, Lurker, Stalker and Devourer, 8 directions) | AI-generated art pack supplied by the repo owner | The PNG is used as delivered. `scripts/trim-characters.ts` rewrites `art/characters-source.json` into `src/assets/characters.json` (the trimmed frame list). The torch flame colour is a palette swap at runtime. |
| Pickups, HUD icons, props, monster eyes and other small sprites | Drawn in code (`src/assets/placeholders-*.ts`) | Procedural canvas 2D drawing, no image files. |
| Light, darkness, fog memory, flame glow, particles, overlays and screen effects | Drawn in code (`src/render/`) | Procedural canvas 2D passes. |
| The caves | Generated at run time from the seed (`src/world/`) | Seeded cellular automata plus a macro layout; there is no hand-made level data. |
| Menu and HUD text | System monospace font stack (`ui-monospace`, `Menlo`, `Consolas` and similar) | No font file is shipped. |
| Sound and music | Samples: ACE-Step 1.5 turbo, run through ComfyUI. Fallback: procedural WebAudio synth recipes in code (`src/audio/synth*.ts`) | Prompts, durations and seeds are in `tools/audio-manifest.json`; the workflow is `tools/comfy/lastember_post.json`. Four candidates per sound, the author auditions and picks one. Post-processing is trim, mono, 80 Hz low-cut, fade, peak normalise, export to Opus (96k) and MP3 (V0). Sounds without a shipped sample use the synth recipe. See [Audio](#audio). |

- OWNER TO FILL: the image generator (tool and model) and the prompts used for the cave tileset and the character atlas. The repo does not record them.
- Asset formats, the asset catalog and the pipeline are described in `docs/architecture-assets-*.md` and `docs/notes/ai-jam-5-asset-formats-25d.md`.
- `scripts/check-assets.ts` (part of `npm run check`) validates both sheets: frame counts, size limits and the frame names the renderer uses.
- Asset foundations (the sprite and sound catalogs, the resource registry and the actor-sheet helpers: one animation per sheet, 64×64 cells, direction rows N, NE, E, SE, S, SW, W, NW) were implemented with Codex from the catalog and Kittingsl's sheet layout. The sound catalog (`src/assets/sounds.ts`) lists every sound id; the audio engine and samples came later, see Audio above.

## Credits and licences

- Game code, procedural art, and the tileset and character atlas: AI-generated or written by AI agents for this jam; repo owner Elias Stepanik (eliasstepanik), with contributions from Kittingsl.
- No third-party art, music, sound effects or fonts are used.
- Audio samples (where shipped) were generated with [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) turbo (Apache-2.0), using the ComfyUI repackage [Comfy-Org/ACE-Step-1.5](https://huggingface.co/Comfy-Org/ACE-Step-1.5). No Stability AI models were used for shipped assets.
- Audio tooling only, not shipped: [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL-3.0) and the community node packs `audio-batch` and `DJZ-Pedalboard`.
- Runtime dependencies: none (`package.json` has no `dependencies`). The game is plain TypeScript on canvas 2D.
- Build tools only, not shipped as assets: [Vite](https://vite.dev/) (MIT) and [TypeScript](https://www.typescriptlang.org/) (Apache-2.0).

## Blender source scenes

`blender/` contains 33 confirmed editable source scenes for the Player, Lurker, Stalker and Devourer. `blender/confirmed_sources.json` records their animation names, original delivery locations and SHA-256 checksums. These source files are for asset editing and are not part of the browser build.

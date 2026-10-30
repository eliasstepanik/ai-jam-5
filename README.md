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
| `1` `2` `3` / Mouse wheel | Select a mineral. Wheel down moves right, up moves left, wrapping at either end. |
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
- **Samples and fallback:** each sound id (`src/assets/sounds.ts`) loads `src/assets/audio/<id>.ogg` (Opus) or `<id>.mp3`. The format is picked once with `canPlayType`. A sound with no sample file plays its procedural synth recipe (`src/audio/synth*.ts`) instead. All 14 generated sample sounds were produced; 11 now ship files (the generated `mus_title`, `mus_descent` and `mus_escape` were superseded by the owner-selected Beacon Run stream and removed from the bundle), so `PENDING_AUDIO` in `sounds.ts` is empty; the synth recipes remain as fallback. The owner-selected eight-minute Beacon Run streams through the music bus on title/help/settings and during descent. Escape switches to the supplied eight-minute Blackout - Run for Your Life track at the existing post-Beacon cue. Both use one media/source graph, the Music slider and mute controls, and avoid decoding long tracks into large AudioBuffers. The recording originally named `playerstep.wav` loops while the torch burns. The recording originally named `TorchSFX.wav` loops only during actual walking, with a pitch-preserving double-cadence version for post-Beacon sprinting.
- **Sample pipeline** (dev only, nothing here runs in the game): `npm run gen-audio` reads `tools/audio-manifest.json` (prompt tags, duration, bpm, key and seeds per sound) and sends `tools/comfy/lastember_post.json` to a ComfyUI server given by the `COMFY_URL` environment variable (`COMFY_URL=http://<host>:8188 npm run gen-audio`; `--dry-run` needs no server). The workflow generates the clip with ACE-Step 1.5 turbo (`ace_step_1.5_turbo_aio.safetensors`; KSampler 8 steps, euler/simple, cfg 1; text node cfg_scale 2), then trims it, makes it mono, cuts below 80 Hz, applies sine fade envelopes, peak-normalises to -3 dBFS and exports Opus in Ogg (96k) and MP3 (V0). Loop tracks get a baked 2 s equal-power crossfade, normalised after.
- **Seeds and picking:** candidate seeds follow `seed = 1000 + 100 * index + candidate`, 12 candidates per sound (more for hard ones, up to 24-48 tried). Picks were made by automated metrics, not by ear: duration within 20 ms, peak -3 dBFS ±1, no clip/NaN, |DC| < 0.01, silence and loop-seam gates, then highest RMS among passers. The winning seed is recorded as `chosenSeed` in the manifest; `npm run gen-audio -- --pick` copies that take into `src/assets/audio/`. The samples have not been auditioned in a live browser by the author yet - listen test pending.
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

Developer minimap options are in **DEV → Map**: toggle resource/landmark markers and choose Floor, Zones or Distance. Distance uses cave path length from the entrance, normalized to the Beacon distance (blue to red); walls and landed rocks remain black. The purple player marker stays on top. E marks the shared entrance/exit; B marks the Beacon.

## AI process

- Audio samples (2026-10-28): all 14 sample sounds (7 SFX: eye-open, mon-lunge, mon-death, mon-growl, rock-impact, the perfect-parry ring layer `sfx_parry-perfect-ring`, beacon-horn; 2 stingers `mus_sting-win`/`mus_sting-death`; ambience `amb_cave`; music `mus_title`, `mus_escape`, `mus_descent`, `mus_descent-danger`) were generated with the ACE-Step 1.5 turbo model (`ace_step_1.5_turbo_aio.safetensors`) through a self-hosted ComfyUI 0.31.0. `scripts/gen-audio.ts` drives the graph `tools/comfy/lastember_post.json`; prompts, tags, seeds and the chosen seed per sound live in `tools/audio-manifest.json`. Sampler: KSampler 8 steps, euler/simple, cfg 1; text node `TextEncodeAceStepAudio1.5` cfg_scale 2; lyrics `[Instrumental]`, key D minor, per-sound bpm (60-150). Seed rule `seed = 1000 + 100 * index + candidate`, 12 candidates per id (up to 24-48 for hard ones). Picks were made by automated metrics, not by ear: duration within 20 ms, peak -3 dBFS ±1, no clip/NaN, |DC| < 0.01, silence limits, loop-seam gates; highest RMS among passers. Post chain in the graph: render, trim, mono, 80 Hz low shelf -12 dB, sine fade envelopes (SFX 8 ms in / 20 ms out; stingers 0.3 s fade-out), peak normalise -3 dBFS; loops get a baked 2 s equal-power crossfade, normalised after. Loop lengths: `amb_cave` 40.000 s, `mus_escape` 48.000 s, `mus_title` 32.73 s, `mus_descent` and `mus_descent-danger` 30.000 s (identical loop points). Output: Opus 96k (.ogg) + MP3 V0 (.mp3), 22 files for the 11 shipped generated sounds in `src/assets/audio/` (the generated `mus_title`, `mus_descent` and `mus_escape` were later superseded by the owner-selected Beacon Run stream and removed), totals for those shipped generated sounds 1,140,916 B ogg / 1,445,521 B mp3; all 30 files in `src/assets/audio/` (generated plus owner-supplied) total 4,091,024 B ogg / 4,360,305 B mp3 against the 4.6 MB budget in `scripts/check-assets.ts`. The synthesized WebAudio SFX recipes are code-written and ship zero bytes. All sounds were picked by metrics; a live-browser listen test is pending.

- Cave dressing/water update (2026-10-26): integrated the owner-supplied 304-frame cave atlas unchanged, including 50 decorative overlays and ten muddy puddle shapes. Codex authored deterministic non-blocking scatter, native water masks, mirrored sprite reflections and bounded footstep ripples. Source pixels remain untouched; rendering does not change terrain, routes or gameplay RNG.

- Integrated the owner-supplied UI pack (2026-10-26): original CC0 pixel sprites, themed palettes and Hollow Sigil font authored with Codex/Python/Pillow/FontTools. PNGs and WOFF2 are copied unchanged and imported locally through Vite; runtime code applies nine-slice panels, native heart states, tiled fuel meters and the supplied font. No third-party font data or external runtime dependency.

- Integrated the owner-provided complete cave atlas from `spritesheets/cave_tileset.png` and its matching JSON: 254 native frames, exact metadata rectangles/anchors, all 47 corner neighborhoods, directional ore, resource icons, wall entrance, resin/plants, matching rockfall art, and six 100 ms beacon frames. The source pixels are copied unchanged; structural and browser pixel checks verify the mapping and cache seams.

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
| Character atlas: `src/assets/characters.png` (4096×2048, 1364 frames: 64×64 actors in 8 directions and the 32×32 wisp) | AI-generated art pack supplied by the repo owner | The PNG is used as delivered. `scripts/trim-characters.ts` rewrites `art/characters-source.json` into `src/assets/characters.json` (the trimmed frame list). The torch flame colour is a palette swap at runtime. |
| Pickups, HUD icons, props, monster eyes and other small sprites | Drawn in code (`src/assets/placeholders-*.ts`) | Procedural canvas 2D drawing, no image files. |
| Light, darkness, fog memory, flame glow, particles, overlays and screen effects | Drawn in code (`src/render/`) | Procedural canvas 2D passes. |
| The caves | Generated at run time from the seed (`src/world/`) | Seeded cellular automata plus a macro layout; there is no hand-made level data. |
| Menu and HUD text | System monospace font stack (`ui-monospace`, `Menlo`, `Consolas` and similar) | No font file is shipped. |
| Sound and music | Samples: ACE-Step 1.5 turbo, run through ComfyUI. Fallback: procedural WebAudio synth recipes in code (`src/audio/synth*.ts`) | Prompts, durations, seeds and the chosen seed are in `tools/audio-manifest.json`; the workflow is `tools/comfy/lastember_post.json`. Twelve seed candidates per sound (more for hard ones), picked by automated metrics (duration, peak, clip/DC, silence and loop-seam gates, then highest RMS); a live-browser listen test is pending. Post-processing is trim, mono, 80 Hz low shelf, fades, loop crossfade, peak normalise -3 dBFS, export to Opus (96k) and MP3 (V0). Sounds without a shipped sample use the synth recipe. See [Audio](#audio). |

- OWNER TO FILL: the image generator (tool and model) and the prompts used for the cave tileset and the character atlas. The repo does not record them.
- Asset formats, the asset catalog and the pipeline are described in `docs/architecture-assets-*.md` and `docs/notes/ai-jam-5-asset-formats-25d.md`.
- `scripts/check-assets.ts` (part of `npm run check`) validates both sheets: frame counts, size limits and the frame names the renderer uses.
- Asset foundations (the sprite and sound catalogs, the resource registry and the actor-sheet helpers: one animation per sheet, 64×64 cells, direction rows N, NE, E, SE, S, SW, W, NW) were implemented with Codex from the catalog and Kittingsl's sheet layout. The sound catalog (`src/assets/sounds.ts`) lists every sound id; the audio engine and samples came later, see Audio above.

- Pixel VFX and cave-detail integration (2026-10-26): code authored with Codex; fixed-size historical particles replace the rigid guide trail, and deterministic overlay placement uses the existing owner-supplied atlas without changing gameplay RNG or terrain. The owner supplied `spritesheets/last-ember-logo-native-160x80.png`; it is copied unchanged to the Vite-imported `src/assets/art/logo.png` and displayed at its native 2:1 aspect with nearest-neighbor scaling. No third-party assets were introduced.

- Owner-selected audio delivery (2026-10-28): `Beacon_Run_8min.wav` from the owner's local ComfyUI output, plus `TorchSFX.wav` and `playerstep.wav`. Generation prompts/models for these selected recordings were not supplied. Codex integrated them using FFmpeg 7.1: the full 480-second stereo score is normalised to -18 LUFS and streamed; short effects are peak-normalised, made mono and edge-faded. The running loop uses `atempo=2` to double cadence while retaining pitch. Runtime exports are 48 kbps Opus/Ogg and MP3. The original WAV files remain untouched. The owner corrected the source labels: `TorchSFX.wav` is the footstep recording and `playerstep.wav` is the torch recording; runtime filenames reflect their actual roles.

- Character atlas v2 (2026-10-29): owner supplied `all_characters_atlas_v2.png` and matching JSON with approved eight-frame walking, torch running and escape running. The PNG is copied unchanged; full source metadata is kept in `art/characters-source.json` and trimmed reproducibly for runtime. New frame timings preserve the prior complete cycle durations. The other 1172 frames retain identical pixels, anchors and timing. Codex updated asset guards and gait checks, and fixed atlas-reload cache invalidation; no new image generation or artwork edits were used.

- Rock audio and copper guidance (2026-10-29): the owner supplied `Rock fall 1.wav`, `Rock fall 2.wav`, and `Rock fall 3.wav`. Codex integrated mono, peak-normalised (0.8), edge-faded Opus/MP3 derivatives at 48 kbps; original WAVs are unchanged. Each rock landing chooses one alternative using event-hashed cosmetic variation, without drawing gameplay RNG. Code-drawn copper guidance now uses sparse, irregular, briefly drifting green pixel cubes rather than an evenly spaced dotted route. No new image assets or image generation were used.

- Escape score and copper visibility (2026-10-29): integrated the supplied `Blackout_Run_For_Your_Life_8min.mp3`. Its accompanying manifest identifies ACE-Step 1.5 Turbo: four acoustic survival-horror chase passages, 180 BPM/E minor, urgent strings, hand drums and dissonance, joined with 5.333-second equal-power crossfades. Codex encoded the full 480-second MP3 source to stereo 48 kbps Opus (constrained VBR) and MP3, preserving its level and adding 20/50 ms edge fades. The original is unchanged. The extra full score raises the per-format audio download budget to 7.6 MB; both eight-minute tracks stream. Copper hints now reuse `FLAME_COL.copper` from the torch, with a smooth opacity envelope peaking at 90% instead of 20%; no new art was generated.

- Copper guide anchoring (2026-10-29): replaced player-relative cue placement with a single small cluster born at a visible floor-tile centre on the shortest walkable Beacon path. Its world anchor and pixel offsets remain fixed while the player moves or the route updates. A twinkle lasts 0.5–1 second, followed by a separate 1–2 second quiet gap. Copper torch colours, native pixel faces, smooth fades and wall occlusion are retained. The bounded cosmetic pool lives in the existing resource registry and survives HMR; no gameplay State/RNG changes or generated image assets.

- Mineral path fire and controls (2026-10-29): user selected sparse torch-like fire along the full guide route, superseding the earlier timed twinkle clusters. Copper points toward the Beacon; strontium toward the nearest reachable resin by walking distance. Native 1–3px fire rises from fixed floor emitters, staggered per tile, retaining born positions through movement and route updates; a bounded registry pool stores only cosmetic history. All visible route sections can emit, with wall/LOS clipping and lower density than the torch. Sodium now has normal passive burn (other effects retained). Added wrapping mouse-wheel selection, updated mineral help, and a plain “Spacebar to dodge” reminder that moves from below the escape banner to the old hotkey-tip position, shrinking from 16 to 12. No new generated art or audio.

- Guide subtlety tuning (2026-10-29): increase the initial plain dodge reminder to 28px, retaining its 12px settled size and motion. Both mineral guides now emit every 1.1s per tile (previously 0.65s), with 1–2px births, 70% maximum opacity and a shorter white-core phase. World anchoring and target routing remain. No new generated assets.

- Guide density refinement (2026-10-30): double the shared guide-fire emitter interval from 1.1 to 2.2 seconds, halving emission for both copper and strontium at every quality level. No new assets or other effect changes.

## Credits and licences

- Owner-supplied `Blackout_Run_For_Your_Life_8min.mp3` (Blackout - Run for Your Life), authorised for game integration; the source manifest records ACE-Step 1.5 Turbo. Locally bundled compressed derivatives are used.

- Owner-supplied rock impact recordings: `Rock fall 1.wav`, `Rock fall 2.wav`, and `Rock fall 3.wav`, authorised for this game. Generation/source details were not supplied.

- Owner-supplied recordings authorised for this game: `Beacon_Run_8min.wav`, `TorchSFX.wav`, and `playerstep.wav`. Compressed runtime derivatives are bundled locally; no external music service is used.

- Supplied UI sprites, palettes and Hollow Sigil font: original CC0 1.0 Universal artwork; bundled license in `src/assets/ui/LICENSE.txt`.

- Game code, procedural art, and the tileset and character atlas: AI-generated or written by AI agents for this jam; repo owner Elias Stepanik (eliasstepanik), with contributions from Kittingsl.
- No third-party art, music, sound effects or fonts are used.
- Audio samples (where shipped) were generated with [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) turbo (Apache-2.0), using the ComfyUI repackage [Comfy-Org/ACE-Step-1.5](https://huggingface.co/Comfy-Org/ACE-Step-1.5). No Stability AI models were used for shipped assets. The generated audio is original model output; no third-party samples were used.
- The repository audio-generation workflow uses [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) through ComfyUI. Generation details for the three owner-selected recordings above were not supplied; their integration and processing are recorded in AI process.
- Audio tooling only, not shipped: [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL-3.0) and the community node packs `audio-batch` and `DJZ-Pedalboard`.
- Runtime dependencies: none (`package.json` has no `dependencies`). The game is plain TypeScript on canvas 2D.
- Build tools only, not shipped as assets: [Vite](https://vite.dev/) (MIT) and [TypeScript](https://www.typescriptlang.org/) (Apache-2.0).

## Blender source scenes

`blender/` contains 33 confirmed editable source scenes for the Player, Lurker, Stalker and Devourer. `blender/confirmed_sources.json` records their animation names, original delivery locations and SHA-256 checksums. These source files are for asset editing and are not part of the browser build.

Character atlas update (2026-10-26): owner-supplied `all_characters_atlas_v1` includes the authored 32px wisp (12 frames at 20fps, center/left/right eye looks). Existing character frames are preserved. Runtime metadata is trimmed from the delivered source; the native sprite replaces the procedural orb.

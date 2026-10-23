# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Developer animation labels now include the player's actual displayed clip and frame, with the toggle also accessible from the Player tab.
- Aligned character feet and raised wall art with the collision ground plane. South wall faces now end at the collision boundary, and complete foreground walls hide actors standing to their north.

- Removed stray wall-edge strips inside solid cave walls by using the seamless interior cap instead of fill variants containing a south-edge lip. Cached terrain refreshes on hot reload.
- The title screen and the run start now show the Best score of the selected depth class. Before, the Standard-depth Best showed on load and after switching class. A shared `?depth=N` link follows the same rule.
- The random depth setting is kept across dev hot reloads. Before, it reset to Standard.
- The rock fall ramp and the quake rate now follow the ramp time of the selected depth class.

### Added

- Depth classes: Shallow, Short, Standard and Deep, picked on the title screen with the new Depth row (Enter or Space cycles, Left and Right step). Shallow caves are smaller and Deep caves larger, and the choice is remembered. Standard is unchanged: the same seeds give the same caves as before.
- Each depth class keeps its own best score, and the end screen shows the class you played.
- The share link carries `&depth=N` when the class is not Standard, and opening such a link selects that class. In the escape, rocks fall faster in Shallow caves and ramp up more slowly in Deep ones (ramp of 40, 55, 80 and 105 s from Shallow to Deep).
- Developer enemy control: force the nearest enemy in clear sight to leap at the player immediately, bypassing windup/cooldown and resuming frozen AI. Uses the real attack collision, parry and damage behavior.
- Developer navigation: safe teleports to the cave entrance and Beacon, a white-floor/black-wall minimap beside health, and a player-orbiting direct-bearing arrow with selectable Beacon/exit targets.
- Clickable developer tools (F2/backquote or DEV): fast noclip and speed slider, frozen torch drain and remaining-duration slider, extinguish/refill, per-type enemy spawns, infinite HP, kill player, visual fog toggle, performance statistics, collision/hurt volumes, and enemy AI/animation labels. Available in development or with `?debug=1` in exported builds.
- The win path. Mine ore veins: hold E within 40 px of a vein for 2 s (3 energy per second) to take its pieces, up to 3 of each mineral in the pouch. Moving, rolling or running out of energy cancels, and a full pouch shows "Pouch full". The mined ore disappears from the wall at once.
- The Beacon: hold E within 36 px for 5 s (4 energy per second) to light it and start the escape. It needs at least 40 energy (below that it shows "The Beacon needs more light" and costs nothing). Moving, releasing E or losing the flame cancels the hold. Lighting it floods the cave with light and kills all monsters without kill credit.
- Minerals and resin: 1-3 select a mineral, F tosses it into the flame, G shakes it off, and small and large resin can be tossed too.
- The escape. After the Beacon, rocks fall: the first about 1.5 s after it lights, then faster as the escape goes on. Each rock shows a shadow for 1 s before it lands, and a rock never cuts the way out. Reaching the exit (within 1 tile) wins; a lethal hit on the same step still loses.
- Escape roll: Space rolls 126 px in 0.3 s (in the move direction, or the facing) with 0.3 s of bite immunity, then a 1.5 s cooldown from the roll start. A dodged bite shows a dodge; falling rocks still hit.
- Escape monsters: one spawns every 1.2 s (up to 8 alive) 220-340 px from the player on tiles that still connect to the exit, and despawns beyond 700 px when unseen. In the escape every monster hunts the player with an intercept chase and constant, aim-led lunges. The descent spawner is unchanged.
- Win screen and personal best: the end screen shows the score breakdown and "NEW BEST!". The best score and settings (volume, mute, reduced flash, last seed) persist in localStorage. A blocked or full store shows "Saving disabled in this browser" once and the game carries on.
- Copy link on the end screen copies a shareable `?seed=` URL built from the page address, so the same cave can be replayed.
- The Devourer, a big slow shade from the third zone on: it circles you inside your light and never backs away from it. Two heavy beats ("DUM ... DUM ...") warn you, then it lunges for a 35 energy hit, so parry it or step out of the way. After a miss it backs off and waits 4-6 seconds before trying again.
- Stalker flanking: stalkers circle to the spot behind the player and attack after 0.25 s there; turning to face them resets it.
- Exit marker in the HUD during the escape: the arrow turns smoothly toward the way out along the real route. When the exit is on screen it shows a pulsing ring with a bobbing arrow above it, otherwise an arrow at the screen edge with `EXIT 42 m` (refreshed every 0.1 s).
- Screen overlays: once the Beacon is lit the cave gets a warm tint that fades in over 1.5 s, followed by the white-out flash. There is also a red damage flash, a perfect-parry flare wash, and hit, low-health (heartbeat) and flame-out vignettes. With reduced flash, the flashes are 70 percent weaker and the heartbeat pulse is off.
- Particles: mining throws dust, sparks and embers; falling rocks puff dust where they warn and land; rolling and dodging kick up dust; lighting the Beacon bursts into sparks and embers. Sword swings throw sparks in the flame colour, parries burst by grade (perfect adds a ring), hits and kills spray blood and ink, a dying flame smokes, relighting, healing and winning spark, monsters show a red tell when they wind up and puff dust when they lunge, and a dying player and a denied Beacon start give off smoke. Lower render quality settings show fewer particles. With reduced flash, flash-type bursts have 70 percent fewer particles.
- Menu and HUD polish: screens fade in and slide up, the title logo glows softly, the end-screen score counts up, and the last heart pulses at low health. With reduced flash, pulses hold steady and shakes (hurt heart, denied toss) are 60 percent smaller.
- 2.5D view: a fixed-south three-quarter view over the unchanged square grid. Wall caps get 48 px south faces, and walls, monsters, the player and props are depth-sorted row by row. The camera is clamped to the map with a 48 px south overhang.
- Art: a cave tileset for floor and walls (ore veins are baked on south-facing walls) and a character atlas for the player, Lurker, Stalker and Devourer animations, including the torch flame palette swap.
- Playable game: the title, help, pause, dead and won screens, the HUD and the cave with fog memory. Mouse works on the menus: hovering moves the focus to a button, a click activates the button it hits, a click on empty space does nothing, a click on the seed field only focuses it, a help tab click selects its page, and a click outside the help panel goes back. Keys: Esc or P pauses, M mutes, and a lost window focus pauses the run. Audio is not included yet.
- Runs: each run is generated from a seed. If no valid cave comes out of the generator, a fixed fallback cave is used and the console logs a warning.
- Dev builds only: Backquote toggles the debug flag and Shift+1..6 toggle reveal, god mode, debug overlay, frozen AI, path display and the render quality override.
- Host: a `'Blur'` pseudo-key in `Input.pressed` on window blur or tab hide, `Input.view` with the canvas size in CSS pixels and `devicePixelRatio`, and a fixed-step time budget (12 ms) so a slow frame drops its backlog instead of freezing.
- Checks in `npm run check`: mining, minerals, Beacon, quake, roll, rocks (unit, rows and a seeded property test with a god-mode exit bot), route, escape, an economy simulator pinned to the tuning constants (including the mining, minerals and Beacon rows through `step()`), run lifecycle, step order and screen controls, world queries and caches, and `scripts/check-assets.ts` (tileset 94 frames, characters 1232 frames, size limits).
- New checks in `npm run check`: per-class run start, rock and quake ramp per depth class, Best per class on the screens, and the rule-11 scale basis fixture.
- Engine groundwork (no visible change on its own): the cave generator (`generateCave` with up to 8 attempts and a validated fallback ring cave), seeded macro layout, loop tunnels, connectivity and terrain, world queries (collision with sliding, line of sight, exploration bits, spawn sampling), monster spawn records and steering, a lazy resource registry that survives hot reload, and sprite and sound catalogs.
- `docs/`: a verbatim local copy of the Last Ember project plan from the knowledge base (design, binding architecture rulings, module tree, asset library, economy and scale rulings, task breakdown and per-file ownership, build progress). Start at `docs/index.md` and `docs/architecture.md`. `docs/MANIFEST.sha256` lists the sha256 of every copied file (69 files) for drift detection.

### Changed

- Title screen: the layout moved to make room for the Depth row.
- Title screen: Play is enabled once the images are loaded or 5 s have passed, whichever comes first (the label, the progress bar and the click test follow the same rule).
- World, entities and props are drawn for the 2.5D look at scale 1.0. The old top-down sprite sheets only remain for monster eyes and UI art. The image loader preloads the tileset and the character sheets before the title screen is ready.
- Only the primary mouse button counts as a click, and the right-click menu is suppressed on the canvas.
- `index.html`: page title, description, favicon, black background and crosshair cursor for Last Ember.
- Animation specification: the player and all three shades use 64×64 frames with eight authored directions per action, selected by facing without sprite rotation. The player has separate torch and no-torch sets with four-frame walk cycles.
- `AGENTS.md` documents the `docs/` snapshot and its precedence order. `README.md` adds how to play, the AI process, credits and the project plan section.
- Task ownership in `docs/` was rebalanced between Elias and Kittingsl.

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

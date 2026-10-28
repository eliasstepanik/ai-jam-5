# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- #97: updated cave atlas with non-blocking mushrooms, roots, ferns, stalagmites, leaves, branches, gravel and wall dressing; ten muddy puddle variants reflect nearby sprites and ripple when walked through.
- Glowing vines on cave walls and on the floor beside them near the cave start. They give off a soft pulsing green light and fade out with depth, so the deeper cave has none.
- Falling dust and pebbles that get denser the deeper you go.
- Drifting draft motes and a faint warm bleed of light toward the Beacon that quietly guide the player along the main route.
- Dynamic puddles: the pool surface shimmers, ripples, drips and reflects the flame, the Beacon and nearby vines instead of showing a flat decal.
- Sculpted cave terrain: open caverns, single pillars and short dead-end alcoves.

### Changed
- Darkness and tint now deepen continuously with depth. The per-zone colour tints are removed from rendering (the plain fallback shown before the tileset decodes keeps flat per-zone floor fills).
- More cracks and rubble the deeper you go.
- Props are placed with a purpose instead of being scattered: route markers and landmarks along the way to the Beacon, decoys, water and lairs in dead ends, and rubble where the route runs close to a wall.
- The HUD no longer shows the zone label. The depth class and Beacon path length stay.
- Caves regenerate with new layouts: the same seed now gives a different cave than before.
- Make parry and dodge more forgiving: wider parry window (perfect ±55 ms, early 180 ms, late 120 ms), longer lurker and stalker telegraph (0.55 s), shorter escape roll cooldown (1.0 s).
- #99: raise the torch-duration bar another two reference pixels inside its info box.
- #99: remove the active-mineral underline and raise the duration bar inside the torch info box so it clears the bottom frame.

### Added
- #99: delivered UI hearts, nine-slice menu/HUD panels, selection markers, material-colored animated torch/fuel meter and local Hollow Sigil font.

### Fixed
- #84: position the enlarged title logo just above Play, lower on tall windows, and remove its tagline.
- #98: resin refills the torch without triggering the player pickup animation; healing-plant and ore animations are retained.
- #127: restore pure-black creature particles at the user’s request; blending into black terrain is intentional. Retain lifetime fading and foreground-wall occlusion.
- #127: mix sparse native dark-gray pixels into creature trails so they remain readable against unexplored/pure-black darkness. Stable colors cross the light boundary without popping, fade at life end, and respect foreground walls.
- #127: on-screen creature particles continue outside torch range and draw over the explored-memory layer instead of disappearing at the light boundary.
- #127: golden-yellow guide trail; Beacon sparks begin inside the flame, and shadow pixels begin inside creature silhouettes, shrink and rise only 4–6 pixels. Torch particles retain their existing appearance.

### Removed

- Removed the redundant minimap X marker and separate Exit toggle. E represents the shared entrance/exit.

### Added

- Native 160x80 title logo, crisp torch/Beacon fire particles and a wisp particle trail that retains historical positions through turns.
- Cave moss, vines, roots, pebbles and rubble overlays, a developer comparison toggle, progressive escape cracks and local fracture scars around rockfalls.

- Developer Inspect option: Pure darkness hides explored-area memory without clearing exploration.

- Developer Map tab: independent ore, resin, healing plant, entrance, exit and Beacon markers, plus floor, gameplay-zone and entrance-path-distance heatmap modes. Ore uses copper green, sodium yellow and strontium red; the player is purple. Resource markers update immediately when mined or collected.

- Integrated the 254-frame cave tileset: authored ore in four directions with three variants, raw-resource HUD/help icons, a wall-mounted entrance/exit, healing plant/resin art, matching falling/landed boulders, and the six-frame animated Beacon. The large Beacon uses a clear chamber floor anchor, shared by interaction and developer navigation; its original interaction point remains valid.

- Added 33 confirmed Blender source scenes under `blender/`, grouped by character, with their source and SHA-256 manifest.

- Dev mode shows the commit the checkout is running (7-char short sha as on GitHub, small label at the top centre). A dev-only Vite endpoint `/__commit` reads `git rev-parse --short=7 HEAD` per request, and the game re-fetches it every 30 s, so the label follows a server-side `git reset --hard` without a restart. Absent from `vite build`.
- Shadow mist around the three shadow creatures: soft dark wisps drift off each Lurker, Stalker and Devourer (small and quick, long thin trail, big and dense), trail behind them while they move, thicken during windup and lunge, spread out and fade as they die, and idle when the enemy AI is frozen in the dev panel. Purely visual: drawn procedurally in the particle pass under the darkness, capped per enemy and for the whole screen, thinned by the render quality tier and by Reduced flash, and it never touches gameplay state or the seeded random streams. A new check covers the per-type emission, state response, caps and the read-only guarantee.
- Crack decor from the tileset: sparse deterministic ground cracks (about 5% of floor tiles, small and large) and wall-face cracks (about 8% of visible faces), chosen from a per-tile seed hash and baked into the chunk cache. Entrance, Beacon chamber and vein walls stay clean. A new check covers determinism, density, placement and the tileset frame names; floor variants are checked to be evenly spread over all 10.

### Changed

- The escape wisp now glides: it is a steered orb with its own velocity that eases toward the guide route, so it no longer snaps when the route changes (#81).

### Fixed

- Resin and healing plants stay grounded; shadow creatures shed opaque black pixels instead of soft coloured mist.

- Keep the wisp body visible independently of trail fade and quality, remove the escape exit ring/arrow, and use one fading palette for the explored-memory view.
- Remove Devourer proximity suppression/death restoration so being hit cannot enlarge torch light.

- Clip inner-corner wall faces to their open neighbors; align the exit trigger and three-tile spawn spacing with the doorway.
- Replace ore glow dots with crystal-pixel emission, fade the whole cave palette on zone entry, and ease Devourer light release on death.
- Use the updated native 32px, 20fps wisp atlas animation after Beacon ignition.

- Torch material/color and inventory cost now apply only after the material-change animation finishes. Walking cancels the action without spending a mineral; shake-off follows the same timing (#87).

- Corrected player action clips: mining and collected materials use the pickup animation; successful mineral tosses and shake-off use the material-change animation. Combat priorities, effect timing and movement are unchanged (#87).

- Inner corners use the supplied 47-state lookup and complete wall composites, with padded row/chunk clipping and matching cold/cache rendering. Solid northern joins no longer expose stray floor pixels.
- Atlas hot reload refreshes pixels and frame metadata together while preserving the current run.
- Replaced all old atlas coordinates with the new frame metadata and extended asset checks for the 1024x1280 sheet, frame overlap, directional ore and beacon animation.

- Enemy grey pixels stay visible outside torch range alongside purple eyes. Both layers now respect the actual foreground wall alpha, including raised walls covering walkable tiles (#121).

- Moving players face their travel direction; stationary descent aiming still follows the mouse (#124).
- Walk/run animation uses measured displacement, including partial collision and noclip map clamping (#79).
- Ore placement uses solid south-facing vein walls and their visible interaction tiles, including teaching veins (#120).
- On-screen enemies remain rendered beyond torch range; purple atlas eyes emit in darkness while walls still block sight (#121).
- Corrected menu control/audio/end-screen hints, made the quit shortcut honor confirmation, and prevented small help-page text overlaps. The menu audit is recorded in .github/bug-audits/menu-content.txt (#78).

- The depth readout no longer looks the same for every depth class. The HUD zone line, the end screen depth class row and the title Best line now show the class name, and the HUD and end screen also show the real Beacon path length in tiles (for example `Shallow · 262 tiles` against `Deep · 768 tiles`). The 0..40 depth metric and every score number are unchanged. A new check pins the text per class.
- Audio: removed clicking sounds. The flame loop is now a warm flame with a soft flicker and gentle ember pops instead of sharp crackle bursts. Softer attacks on mine hit, UI click, eye open, roll, relight, hurt, heartbeat and drip. Seamless noise loops (no thump every 2 s).
- The player's walk and run animation now plays at the pace of the actual movement speed, so the feet no longer slide: slower when moving slowly or along walls, faster when sprinting or flying with noclip.
- Normal descent movement selects walking rather than running; moving with an extinguished torch uses flame-free walking frames and no floating ember glow.
- Death no longer awards the time bonus; wins retain it. Removed the obsolete light-return help tip.
- Plants and resin hidden by foreground wall art move to reachable visible floor when a run starts, preserving pickup counts, types and restoration values.
- Wall collision preserves motion parallel to the wall across tile seams; rock impacts require a final physical player-to-exit route before becoming solid.

- Developer animation labels now include the player's actual displayed clip and frame, with the toggle also accessible from the Player tab.
- Aligned character feet and raised wall art with the collision ground plane. South wall faces now end at the collision boundary, and complete foreground walls hide actors standing to their north.

- Removed stray wall-edge strips inside solid cave walls by using the seamless interior cap instead of fill variants containing a south-edge lip. Cached terrain refreshes on hot reload.
- The title screen and the run start now show the Best score of the selected depth class. Before, the Standard-depth Best showed on load and after switching class. A shared `?depth=N` link follows the same rule.
- The random depth setting is kept across dev hot reloads. Before, it reset to Standard.

### Added

- During the escape run a small glowing ember wisp with a sparkle trail floats ahead of you along the real walkable route to the exit and re-routes around fallen rocks. It is drawn calmer with reduced flashes and thinner on low quality.
- Developer panel (DEV -> Navigate): depth class buttons (Shallow, Short, Standard, Deep). During a run they restart the same seed in the chosen class, keeping debug settings; on the title they set the class for the next run.
- WebAudio audio engine in `src/audio/`: mixer with music, ambience, sfx and ui groups and ducking, music state machine with a danger layer, SFX triggers for all fx events, voice limits and stealing.
- Procedural synth recipes for all 43 sound ids, used as fallback while samples are missing.
- ComfyUI sample generator `npm run gen-audio` (`scripts/gen-audio.ts`, `tools/audio-manifest.json`, `tools/comfy/lastember_post.json`): 4 seed candidates per sound with ACE-Step 1.5 turbo.
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

- Audio sample pair is Ogg Opus + MP3 (the plan said Ogg + m4a). Audio assets live in `src/assets/audio`, and `scripts/check-assets.ts` validates the new pair.
- `game.ts` calls `audioStep` after `platformStep`.
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

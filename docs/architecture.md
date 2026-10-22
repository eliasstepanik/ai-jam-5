---
type: architecture
title: Last Ember – Architecture Hub (precedence, reading order, layer rule, slices, owner decisions)
description: Entry point for the Last Ember architecture – lists every architecture file with title and purpose in groups, the precedence order, a reading order per task, the layer rule, the vertical slices A/B/C/D with first chunks (slice D = 2.5D view migration, ADR-123), the pending owner decisions (OD-1 to OD-7) and the resolved design issues E-1, E-2.
tags: [project, ai-jam-5, architecture, last-ember]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Architecture Hub

**Status (2026-10-18):** Architecture written 2026-10-17 by parallel authors; conflicts resolved in [[architecture-rulings]], [[architecture-rulings-2]] and [[architecture-rulings-3]]; map enlarged to 320×240 (scale and economy rulings, SAE1–SAE4). E-1 and E-2 are RESOLVED (section 6). **OD-1, OD-3 and OD-7 were approved on 2026-10-18; implementation is under way (see [[progress]]).** Cave generator chain (A22 rest, B4-B6) implementation started 2026-10-21 under R-156..R-165 ([[architecture-rulings-3]] §7); depth classes R-164 planned. **2026-10-22:** the owner approved the 2.5D view (fixed-south 3/4 look over the unchanged square grid, [[ADR-123-2-5d-view]]); binding rulings R-178..R-186 in [[architecture-rulings-3]] §9, delivered asset formats in [[ai-jam-5-asset-formats-25d]], migration slice D planned in [[tasks]]; nothing implemented yet.

Project hub: [[index]]. Jam facts: [[jam-brief]]. Implementation agents read this file first, then the files for their task (section 2).

Two review tasks (gameplay consistency, and render/world consistency) did not produce output. [[architecture-rulings]] and [[architecture-rulings-2]] consolidate the conflicts reported by the five module-tree authors only (core, world, systems, render and audio, ui and assets). Cross-checks between topical specs that no module-tree author compared are not covered.

## 1. Precedence

1. [[last-ember-design]] – the product spec. Outranks everything.
2. [[architecture-rulings]], [[architecture-rulings-2]] and [[architecture-rulings-3]] – binding conflict resolutions (R-001 to R-186; R-178..R-186 = 2.5D view, [[ADR-123-2-5d-view]]), together with the binding scale and economy rulings SAE1–SAE4 ([[architecture-scale-and-economy]] … [[architecture-scale-and-economy-4]]).
3. `architecture-modules-*` – file ownership, layers, signatures.
4. Topical specs (state, systems, tuning, monsters, world, render, resources, ui, assets).
5. Older text.

Inside one rank the newer and more specific spec wins. A builder who touches an area first applies the listed KB edits of the rulings for that area (the rulings say who applies each).

## 2. Reading order by task

Always first: this hub, [[architecture-rulings]], [[architecture-rulings-2]], [[architecture-rulings-3]] (incl. §9, 2.5D view), [[last-ember-design]]; render, sprite and asset work also reads [[ADR-123-2-5d-view]] and [[ai-jam-5-asset-formats-25d]]. Cave generator also reads cave-generation-3, cave-generation-4 and scale-and-economy (1–4); tuning and balance read scale-and-economy-2/-3 and economy-simulator (economy-check is history only).

| Task | Read, in order |
|---|---|
| Core types, State, init, migrate | modules-core, state, state-2, state-3, determinism |
| Cave generator | modules-world, cave-generation, cave-generation-2, determinism, state |
| World queries, caches, collision, LOS | modules-world, world-queries, world-queries-2, state-2 |
| Rocks and escape route | modules-world, rocks, rocks-2, world-queries-2, systems-4, tuning-2 |
| Step loop, screens, movement, flame, mining, Beacon | modules-systems, modules-systems-2, systems, systems-2, tuning, state-2 |
| Combat (swing, parry, damage, roll) | modules-systems, systems-3, tuning, monsters-ai (section 5) |
| Monsters, director | modules-systems, monsters-ai, monsters-ai-2, tuning-2, systems-4 |
| Tuning values, live tuning | tuning, tuning-2, economy-check |
| Score and save | scoring-and-save, state-3, modules-core |
| Render | modules-render, modules-render-2, render, render-2, render-3, resources; then rulings-3 §9 (R-178..R-186) and ADR-123 (2.5D view) |
| Audio | modules-render-2, resources, resources-2, resources-3, assets-audio, assets-audio-2 |
| UI | modules-ui-assets, ui, ui-2, render (HUD passes), host-changes |
| Host (`main.ts`, `index.html`), HMR | modules-ui-assets-2, host-changes, host-changes-2, resources |
| Assets: sprites, atlas, loader (packer SUPERSEDED by D1/D2) | assets-style, assets-sprites (1–3), assets-pipeline, assets-pipeline-2, modules-ui-assets; then rulings-3 §9 and ai-jam-5-asset-formats-25d (delivered tileset and character atlas formats) |
| Assets: audio files | assets-audio, assets-audio-2, assets-pipeline, resources-2 |
| Checks and CI wiring | modules-core (checks), modules-ui-assets-2 (wiring), the check section of each module tree |
| Who builds what, task ids, PR process | [[tasks]], [[tasks-files]] (per-file owner and task) |

(Every name above is `architecture-<name>`; links are in section 3.)

## 3. File index

### Rulings and precedence (BINDING, read first)

| File | Title | Purpose |
|---|---|---|
| [[architecture-rulings]] | Last Ember – Architecture Rulings (binding conflict resolutions) | Part 1: precedence, layer rule, R-001 to R-065 (layering, core/state/save, checks, world, rocks) |
| [[architecture-rulings-2]] | Last Ember – Architecture Rulings (binding conflict resolutions) | Part 2: systems and AI, render and audio, UI/assets/host rulings, scale rulings R-102–R-107, consolidated State additions, owner decisions, gaps |
| [[architecture-rulings-3]] | Last Ember – Architecture Rulings (3/3) – Scale Follow-ups and Gap Closures | R-108–R-165: cave-generator GAP closures (incl. per-attempt seed derivation), scale follow-ups, accepted known weaknesses, Day-4 calibration assumptions; §7 R-156–R-165 cave generator chain rulings of 2026-10-21 (T3 window, rule 6/7, finalizeCave, fallback pockets, planned depth classes) |

### Scale and economy rulings (BINDING, 320×240)

| File | Title | Purpose |
|---|---|---|
| [[architecture-scale-and-economy]] | Last Ember – Map Scale Ruling (binding) – 1/3 Map Size and Path Length | SAE1: map 320×240, macro layout, D band 510–690, generation cost, fallback |
| [[architecture-scale-and-economy-2]] | Last Ember – Economy Ruling (binding) – 2/3 New Constants | SAE2: energy rescale, quotas per 100 path tiles, Beacon cluster, rule #14 |
| [[architecture-scale-and-economy-3]] | Last Ember – Economy Ruling (binding) – 3/3 Decision, Scaling, Score Ranges, Tension Test | SAE3: E-1 verdict (O2 + O3), director and rock scaling, score ranges, Day-4 protocol and knobs |
| [[architecture-scale-and-economy-4]] | Last Ember – Scale Ruling (binding) – Size-Dependent Budgets and Edit Manifest | SAE4: State/cache/CPU budgets, rocks BFS cap, host bailout, check runtime, edit manifest |
| [[architecture-economy-simulator]] | Last Ember – Economy Reference Simulator (src/checks/economy.check.ts) | Binding code for the economy check, pinned to SAE3 §1.2 |

### Module tree (file ownership, signatures, slices)

| File | Title | Purpose |
|---|---|---|
| [[architecture-modules-core]] | Last Ember – Module Tree: Core | `src/core` files, signatures, core checks, State additions |
| [[architecture-modules-world]] | Last Ember – Module Tree: World | `src/world` query and generator modules, import graph, world checks |
| [[architecture-modules-systems]] | Last Ember – Module Tree: Entities and Systems | `src/entities` and `src/systems` file list E1–E3, S1–S22 |
| [[architecture-modules-systems-2]] | Last Ember – Module Tree: Entities and Systems (2/2) – Checks, Conflicts, State Additions | Systems checks, conflicts MS-1 to MS-26, State additions |
| [[architecture-modules-render]] | Last Ember – Module Tree: Render and Audio | `src/render` files, seams S1–S8, render import graph |
| [[architecture-modules-render-2]] | Last Ember – Module Tree: Render and Audio (2/2) – Audio Files, Checks, State Additions, Conflicts | `src/audio` files, render/audio checks, conflicts |
| [[architecture-modules-ui-assets]] | Last Ember – Module Tree: UI, Assets, Host, Tooling | `game.ts` facade, `src/ui`, `src/assets` files |
| [[architecture-modules-ui-assets-2]] | Last Ember – Module Tree: UI, Assets, Host, Tooling (2/2) | Host and tooling table, `package.json` scripts, check wiring, asset folders, conflicts |

### State and determinism

| File | Title | Purpose |
|---|---|---|
| [[architecture-state]] | Last Ember – State Architecture (1/3) – Principles, Top Level, Meta, Player | State principles, top level, `meta`, `player` |
| [[architecture-state-2]] | Last Ember – State Architecture (2/3) – World, Entities, FX, RNG, UI, init() | `world`, entities, fx, rng, ui, `init()` |
| [[architecture-state-3]] | Last Ember – State Architecture (3/3) – migrate, Versions, Non-State Data, Budgets, Checks | `migrate`, version policy, non-State data, budgets, checks |
| [[architecture-determinism]] | Last Ember – Determinism Architecture (PRNG, Streams, Seeds) | PRNG, named streams, seed parsing, guard rules |
| [[architecture-scoring-and-save]] | Last Ember – Scoring and Save Architecture | Depth metric, score formula, best and settings storage |

### Gameplay

| File | Title | Purpose |
|---|---|---|
| [[architecture-tuning]] | Last Ember – Tuning Architecture (1/2) – tuning.ts Shape, Player, Flame, Actions, Parry | Shape of `T`, player, flame, mining, Beacon, swing, parry |
| [[architecture-tuning-2]] | Last Ember – Tuning Architecture (2/2) – Monsters, Director, Escape, Minerals, Camera, Live Tuning | Monsters, director, escape, minerals, camera, live tuning |
| [[architecture-systems]] | Last Ember – Gameplay Systems (1/4) – Step Order, Screens, Runs, Intent, Movement | Update order, screens, runs, intent, movement |
| [[architecture-systems-2]] | Last Ember – Gameplay Systems (2/4) – Flame, Pickups, Mining, Beacon, Minerals | Flame, pickups, mining, Beacon, minerals |
| [[architecture-systems-3]] | Last Ember – Gameplay Systems (3/4) – Swing, Parry, Bites, Damage, Roll | Swing, parry, bites, damage rules, roll |
| [[architecture-systems-4]] | Last Ember – Gameplay Systems (4/4) – Explore, Rocks Slot, Escape, End, Score, FX, Camera, State Additions, Checks | Explore, rocks slot, escape, end, score, fx, camera, checks |
| [[architecture-monsters-ai]] | Last Ember – Monster AI (1/2) – Shared Rules, Steering, Lunge Pipeline, Lurker, Stalker, Devourer FSMs | Steering, lunge pipeline, per-kind brains |
| [[architecture-monsters-ai-2]] | Last Ember – Monster AI (2/2) – Devourer Light Push, Escape, Minerals, Director, Walls, Eyes, Ramp, Budget, Debug | Devourer light push, escape hunt, director, budget, debug |
| [[architecture-economy-check]] | Last Ember – Flame Economy and Pacing Check | SUPERSEDED (160×120 history): source of E-1 and E-2; binding values in SAE2/SAE3 and the simulator |

### World

| File | Title | Purpose |
|---|---|---|
| [[architecture-cave-generation]] | Last Ember – Cave Generation (1/2) – Terrain, Connectivity, Loops | `generateCave`, CA terrain, connectivity, loop tunnels, Beacon chamber |
| [[architecture-cave-generation-2]] | Last Ember – Cave Generation (2/2) – Zones, Placement, Validation, Tests | Zones, placement quotas, validation, fallback, tests |
| [[architecture-cave-generation-3]] | Last Ember – Cave Generation (3/4) – Macro Layout Pass, 320x240 Constants, Rejection | Macro tree, mask, spine, pass order, rejection, loop constants, chunked attempts (GAPs closed by R-108–R-115) |
| [[architecture-cave-generation-4]] | Last Ember – Cave Generation (4/4) – 320x240 Placement Quotas, Validation, Fallback, Tests | Quotas by density, front-loading, Beacon cluster, rules #11/#13/#14, fallback ring, tests (GAPs closed by R-116, R-117) |
| [[architecture-rocks]] | Last Ember – Falling Rocks and Route Guarantee (1/2) – Model, Cadence, Selection, Guarantee | Rock model, cadence, selection, route guarantee |
| [[architecture-rocks-2]] | Last Ember – Falling Rocks and Route Guarantee (2/2) – Impact, Races, API, Exit Marker, Tests | Impact, races, `planRockFall` API, exit heading, tests |
| [[architecture-world-queries]] | Last Ember – World Queries (1/2) – Tiles, Coordinates, Solidity, Collision, LOS, Explore | Grid, collision, LOS, explored bitset, sampling |
| [[architecture-world-queries-2]] | Last Ember – World Queries (2/2) – Caches, Distance Fields, Invalidation, HMR, Tests | Caches, distance fields, invalidation, HMR, tests |

### Render and runtime

| File | Title | Purpose |
|---|---|---|
| [[architecture-render]] | Last Ember – Render Architecture (1/3) – Modules, Frame Pipeline, Camera Transform | Render modules, pass order, camera and zoom |
| [[architecture-render-2]] | Last Ember – Render Architecture (2/3) – Tiles, Entities, Particles, Darkness and Memory | Tile pass, entities, particles, darkness layer |
| [[architecture-render-3]] | Last Ember – Render Architecture (3/3) – Glow, Beacon Mode, Overlays, Budget, Quality, Sprites, Raycast Seam, Debug | Glow, Beacon mode, overlays, quality ladder, `drawSprite`, debug |
| [[architecture-resources]] | Last Ember – Runtime Resources (1/3) – Registry, Lifecycle under Hot Reload, Memory, Preload | Non-State resource registry, HMR lifecycle, preload |
| [[architecture-resources-2]] | Last Ember – Runtime Resources (2/3) – Audio Engine, Mixer, Music, Danger, Voices, Event Triggers | Audio engine, mixer, music, danger, voices, triggers |
| [[architecture-resources-3]] | Last Ember – Runtime Resources (3/3) – Synthesis Recipes, Persistence, Pause, Failures | Synthesis recipes, persistence, pause, failure handling |
| [[architecture-ui]] | Last Ember – UI Architecture (1/2) – Decision, Scaling, Fonts, Input Rules, Title and Help | UI decision, scaling, fonts, input rules, title, help |
| [[architecture-ui-2]] | Last Ember – UI Architecture (2/2) – HUD, Paused, End Screens, Animations, Accessibility | HUD, pause, end screens, animation, accessibility |
| [[architecture-host-changes]] | Last Ember – Host Changes and HMR Architecture (Part 1) | `main.ts` host edits and HMR boundary (part 1) |
| [[architecture-host-changes-2]] | Last Ember – Host Changes and HMR Architecture (Part 2) | HMR hazards, `index.html`, seed URL, tests (part 2) |

### Asset library

| File | Title | Purpose |
|---|---|---|
| [[architecture-assets-style]] | Last Ember – Asset Style Guide (Art Direction) | Art direction, palette, master prompt, export rules |
| [[architecture-assets-sprites]] | Last Ember – Sprite Catalog 1 (Conventions, Player, Monsters) | Sprite conventions, player and monster sprites |
| [[architecture-assets-sprites-2]] | Last Ember – Sprite Catalog 2 (Terrain Tiles and Special Tiles) | Terrain and special tiles |
| [[architecture-assets-sprites-3]] | Last Ember – Sprite Catalog 3 (Pickups, Props, UI, Key Art, Totals) | Pickups, props, UI, key art, totals |
| [[architecture-assets-audio]] | Last Ember – Audio Catalog 1 (Rules, Mix, Music, Ambience) | Audio rules, mix, music, ambience |
| [[architecture-assets-audio-2]] | Last Ember – Audio Catalog 2 (Sound Effects) | Sound effect catalog |
| [[architecture-assets-pipeline]] | Last Ember – Asset Pipeline 1 (Layout, Manifests, Loading, Fallbacks) | Asset layout, manifests, loading, fallbacks |
| [[architecture-assets-pipeline-2]] | Last Ember – Asset Pipeline 2 (Packer, Validation, Budget, Hand-off, Licensing) | Atlas packer, validation, budgets, hand-off, licensing |

Project files outside the architecture set: [[last-ember-design]], [[last-ember-production-plan]], [[last-ember-open-questions]], [[jam-brief]], [[index]].

## 4. Layer rule (binding)

```
L0 src/core
L1 src/world, src/assets (data-only registry and manifests)
L2 src/entities
L3 src/systems
L4 src/render, src/audio, src/ui
L5 src/game.ts (facade)
host: src/main.ts, src/merge.ts (game code uses `import type` only)
checks: src/checks/* import L0–L3 only
```

- A module imports only from lower layers or its own layer, with no cycles. Type-only cycles count.
- Checks never touch the DOM, `import.meta.env` or `import.meta.glob` at import time, and use no `node:` imports under `src/` ([[architecture-rulings]] R-039).
- The code lives in `src/`. Gameplay still goes through the hot-swap contract in the repo `AGENTS.md`: all state in `State`, no module-level side effects.

## 5. Vertical slices

Per-file slice tags are in the module trees. Names below follow [[architecture-rulings]] where it moved a file.

### Slice A – descent slice (by 2026-10-20)

Goal: title, run start, walk a seeded cave in the dark, flame burn, parry a Lurker, reach depth, die, restart. Placeholder art, no audio required.

First chunk of work: **core** – `types.ts`, `state.ts`, `rng.ts`, `seed.ts`, `tuning-types.ts`, `tuning.ts`, `math.ts`, `migrate.ts`, `score.ts`, `noise.ts`, `view.ts` ([[architecture-modules-core]], [[architecture-state]], [[architecture-determinism]]). Next: **world** – `bfs`, `gen/ca`, `gen/region`, `gen/places`, `gen/loops`, `generate`, `grid`, `collide`, `los`, `caches` ([[architecture-modules-world]]); then **systems** – `step`, `intent`, `movement`, `flame`, `light`, `combat`, `monsters`, `ai-lurker`, `fx`, `camera`, `run` ([[architecture-modules-systems]]); **render** – `index`, `view`, `keys`, `tiles`, `memory`, `light`, `entities`, `props`, `quality` ([[architecture-modules-render]]); **ui and assets** – `layout`, `screens`/`platform`, `draw`, `menus`, `hud`, `resources`, `sprites`, `sounds`, `placeholders-*`, `images`, `game.ts` facade ([[architecture-modules-ui-assets]]). Check wiring: [[architecture-modules-ui-assets-2]] section 3.

### Slice B – full loop (2026-10-22)

Mining and minerals, Beacon hold and phase change, escape (rocks, exit marker, escape AI), win screen, score and best, seed field and copy link, audio engine with P0 sounds, atlas packer, `checks/all.ts`. First chunk: **systems** `mining`, `beacon`, `quake`, `ai-stalker`, `ai-escape` ([[architecture-modules-systems]]) together with **world** `route`, `gen/pockets`, `gen/populate`, `gen/fallback`, `validate` ([[architecture-modules-world]]). Then audio ([[architecture-modules-render-2]]) and storage ([[architecture-scoring-and-save]]).

### Slice C – polish

Devourer, particle table, music layers and stingers, P1/P2 SFX, help pages, fades, auto quality ladder, debug overlay, final art. First chunk: **render** `particles`, `overlay` polish and `glow` extras ([[architecture-modules-render]]), `ai-devourer` ([[architecture-monsters-ai-2]]), P1/P2 audio ([[architecture-assets-audio-2]]). Cut order is guidance only ([[last-ember-production-plan]]).

## 6. Pending owner decisions

| ID | Decision | Recommended |
|---|---|---|
| OD-1 | Approve `src/main.ts` host edits (`Input.view`, left-button-only clicks, `contextmenu`, blur/visibility pause) as one medium-tier PR | yes (**APPROVED 2026-10-18**; merged as #18) |
| OD-2 | `dprCap` line in `main.ts` | skip |
| OD-3 | Replace `index.html` | yes (**APPROVED 2026-10-18**) |
| OD-4 | 9 MB CI size-budget step | skip until first art PR |
| OD-5 | `?seed=` may not reach the game inside the itch.io iframe; keep the title-screen seed field | keep field |
| OD-6 | Optional safe-route glow in escape | ship off |
| OD-7 | Host `STEP_BUDGET_MS = 12` wall-time bailout in `main.ts` ([[architecture-rulings-2]] R-105, [[architecture-scale-and-economy-4]] §1.8) | yes, part of the OD-1 PR (**APPROVED 2026-10-18**) |

Source: [[architecture-rulings-2]] section 10 (OD-7: [[architecture-rulings-3]] R-124). Full rationale in [[architecture-modules-ui-assets-2]] and [[architecture-host-changes]]. **OD-1, OD-3 and OD-7 were approved on 2026-10-18; implementation is under way (see [[progress]]).** OD-2, OD-4, OD-5 and OD-6 remain open.

### Design issues from [[architecture-economy-check]] (RESOLVED 2026-10-18)

| ID | Issue | Resolution |
|---|---|---|
| E-1 | "Deeper or out?" does not survive the spec as written (energy-free escape, no exit during the descent). | **RESOLVED by architect** under owner delegation: O2 + O3, O1 rejected ([[architecture-scale-and-economy-3]] §0–§1). Verdict SAE3 §1.6: the decision is narrow, a **Z4 greed-budget decision**; residual weaknesses accepted in [[architecture-rulings-3]] §3. |
| E-2 | A competent run took 2–3.5 min on 160×120, not the 6–8 min of the spec. | **RESOLVED** (owner: bigger map, 2026-10-18): 320×240, D band 510–690 ([[architecture-scale-and-economy]]). |

Tracked in [[last-ember-open-questions]]. Decider: owner (eliasstepanik) with design lead saile2204.

## Related

- [[index]]
- [[jam-brief]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[architecture-economy-check]]
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
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-systems-2]]
- [[architecture-modules-render]]
- [[architecture-modules-render-2]]
- [[architecture-modules-ui-assets]]
- [[architecture-modules-ui-assets-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-world-queries]]
- [[architecture-world-queries-2]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[tasks]]
- [[tasks-files]]
- [[progress]]

---
type: architecture
title: Last Ember – Asset Pipeline 2 (Packer, Validation, Budget, Hand-off, Licensing)
description: Asset pipeline part 2 for Last Ember – the superseded Node atlas packer (history only after the 2.5D pivot), the check-assets validation of the two external atlases run by npm run check, bundle and atlas budgets (R-183), team hand-off checklist with folders and file names, asset PR flow under the ci job and the 300-line rule, and licensing/credit rules for AI-generated assets.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Asset Pipeline 2: Packer, Validation, Budget, Hand-off, Licensing

> **2.5D pivot (2026-10-22, [[ADR-123-2-5d-view]], R-178..R-186 in [[architecture-rulings-3]] §9):** Section 1 (packer) is superseded and kept as history only: there is no `scripts/pack-atlas.ts`, no `npm run pack` and no `art/frames/`. Section 2 (check-assets) is rewritten for the two external atlases, Section 3 budgets follow R-183, Sections 4 and 6 are adjusted. Asset facts: [[ai-jam-5-asset-formats-25d]].

Part 1 (layout, manifests, loading, fallbacks): [[architecture-assets-pipeline]]. Hub: [[architecture]]. Style and export rules: [[architecture-assets-style]] Sections 9–11. Catalogs: [[architecture-assets-sprites]], [[architecture-assets-sprites-2]], [[architecture-assets-sprites-3]], [[architecture-assets-audio]], [[architecture-assets-audio-2]]. Schedule: [[last-ember-production-plan]].

## 1. Atlas packer `scripts/pack-atlas.ts` (Node built-ins only) — SUPERSEDED (history, do not implement)

> Superseded by [[ADR-123-2-5d-view]] and R-183: the two atlases are delivered pre-packed and imported as they are. `scripts/pack-atlas.ts` and its 150-line plan are not built; B15 and B16 in [[tasks]] are superseded.

**Recommendation:** a ~150-line Node script, no new dependency. External packers (TexturePacker, free-tex-packer) were rejected: they need every team member to install and run the same GUI with the same settings, and their JSON formats differ from ours. The script is deterministic and runs in CI.

What it must do (implementer spec):

1. **Collect** `art/frames/**/*.png`, sorted by name (determinism). Key = file name without `.png`.
   Player keys append direction to the animation (`walk-ne`) and select `player_body` or `player_body-torch`; never infer player facing by rotating a right-facing frame. Validate per-frame torch-tip anchors against the manifest. Monster body and eye keys also append direction (`lunge-ne`, `telegraph_a-sw`, `blink-n`), with 64×64 frames and all eight directions per action; never synthesize a view by rotation or mirroring (R-155).
2. **Decode PNG** with `node:zlib` `inflateSync`: accept only 8-bit RGBA, non-interlaced (colour type 6, bit depth 8, interlace 0) — the export rule in style Section 9. Undo the 5 PNG scanline filters (None, Sub, Up, Average, Paeth). Anything else → exit 1 with `pack: <file> must be PNG-32 RGBA 8-bit non-interlaced`.
3. **Validate** each frame against `SPRITES` (imported from `src/assets/sprites.ts`): the `SpriteId` and anim exist, frame index `< n`, PNG size equals `w×h`. Unknown key → error (catches typos like `mon_lurkr_idle_00`).
4. **Pack** with shelf packing: sort frames by height desc then name, fill rows left to right in a 1024-wide sheet; cell = frame + 1 px extrusion on each side + 1 px transparent gap (style Section 9). Sheet height = next power of two ≥ used height, max 1024; overflow starts `atlas-1.png`. Tiles and actors get no special treatment.
5. **Extrude**: copy each frame's edge pixels 1 px outward (stops bleeding under rotation).
6. **Encode PNG**: filter type 0 per row, `deflateSync(level 9)`, CRC32 via a 256-entry table (≈10 lines; `node:zlib` has `crc32` from Node 22.2 — use it if present, else the table).
7. **Write** `src/assets/atlas-<n>.png` and `src/assets/atlas.json` (format in part 1 Section 4), with `hash` = sha1 over sorted file names + bytes (`node:crypto`). Skip writing when the hash is unchanged (no git churn).
8. **`--watch`**: `fs.watch(art/frames, { recursive: true })`, debounce 300 ms, repack (Linux recursive watch needs Node ≥ 20; we require ≥ 22.18).

Optional after packing (not in the script): `oxipng -o 4 --strip safe --nc src/assets/atlas-*.png` if installed (`--nc` = keep RGBA colour type, else check #4 fails); oxipng rewrites the file bytes (not the pixels), so the `hash` is computed over the SOURCE frames only, never over the sheet; the script output is already reasonably small because frames are palette-locked.

`ponytail:` shelf packing wastes ~30 %; replace with MaxRects if measured packing exceeds the four-sheet allowance (R-154).

## 2. Validation `scripts/check-assets.ts` (in `npm run check`)

Runs in Node without decoding images or audio. Each failure prints one line and the script exits 1.

| # | Assert | Why |
|---|---|---|
| 1 | `atlas.json` has `version: 2`; every key in its `frames` (if any) parses to a known `SpriteId` + anim + index `< n`; every `external[]` entry names an `image` and `json` that exist in `src/assets/` | stale or misnamed frames, missing atlas file |
| 2 | Every frame rect of `atlas.json` lies inside its sheet; sheets listed in JSON exist on disk | corrupt entry |
| 3 | Tileset (`cave_tileset.json`): `frame_count` is 94 and the category counts are floor 10, wall_cap 19, wall_face 7, corner_cutout 4, corner_rim 4, wall_composite 4, overlay_ground 22, overlay_wall 24; every frame rect lies inside 512×512; `wall_cap_00` … `wall_cap_15` are all present | wrong or truncated tileset delivery |
| 4 | Every `src/assets/*.png` atlas (tileset, characters) has the PNG signature and IHDR colour type 6, depth 8 (read the first 33 bytes) and IHDR size matching the JSON (512×512, 4096×2048). Screens in `src/assets/art/` only need a valid PNG signature and IHDR size ≤ 960×540 (palette PNG allowed) | wrong export |
| 5 | Every `SOUNDS[id].file` and `layers[]` has BOTH `<name>.ogg` and `<name>.m4a` in `src/assets/audio/`, **or** the id is in the allow-list `PENDING_AUDIO` in `sounds.ts` (shrinks to empty by Day 11) | missing format = Safari silence |
| 6 | Every file in `src/assets/audio/` is referenced by some `SOUNDS` entry; no check of unreferenced atlas frames (the atlases are delivered whole) | orphan bloat |
| 7 | `.ogg` starts with `OggS`; `.m4a` has `ftyp` at byte 4 | wrong container |
| 8 | Budgets (Section 3) by `fs.statSync` sizes | bundle creep |
| 9 | Every `loop` has `0 ≤ start < end` | bad manifest |
| 10 | All file names match `^[a-z0-9-]+(_[a-z0-9-]+)*\.(png|ogg|m4a)$` | naming rule (style Section 10) |
| 11 | Characters (`characters.json`): `format === 'gamejam-character-atlas-v1'`; 1232 frames; every rect lies inside 4096×2048 and outside `palette_panel_rect`; every frame is 64×64 with pivot (32,32); every animation named in the game's animation mapping table (the player, lurker, stalker and devourer sets used by `src/render/charatlas.ts`) exists with all eight directions in the order n, ne, e, se, s, sw, w, nw | enforce R-184; a mapped animation missing from the atlas fails the check |

Placeholder and synth coverage are **not** checked here: tsc enforces them (`Record<SpriteId, DrawFn>`, `Record<SoundId, …>`) in `npm run build`.

The script imports `src/assets/sprites.ts` and `sounds.ts`; they stay DOM-free (part 1 Section 2). It is also run by CI through `npm run check`, so the existing `ci` job enforces it with no workflow edit.

## 3. Budgets and limits

| Item | Limit | Target / estimate |
|---|---|---|
| Atlas sheets total | characters ≤ 600 KB, tileset ≤ 100 KB (R-183) | characters.png 361 072 B, cave_tileset.png 23 940 B as delivered; no repack. Replaces the former 1.2 MB / 1064-frame ceiling |
| Screens (`src/assets/art/`) | ≤ 0.6 MB, each ≤ 250 KB, max 960×540 | ≈ 0.24 MB |
| **Art total (bundled)** | **≤ 2 MB** (plan target) | Two atlases (≈ 0.39 MB) plus screens (≈ 0.24 MB); the shipped trimmed `characters.json` counts toward JS, not art |
| Audio, one format | **≤ 3.3 MB** (R-140; 3 MB left only 1.7 % VBR headroom) | ≈ 2.95 MB ([[architecture-assets-audio]] Section 3) |
| Audio, both formats in `dist/` | ≤ 7 MB (2 × 3.3 MB + margin) | ≈ 6 MB |
| Any single audio file | ≤ 900 KB | music loops ≈ 0.5–0.75 MB |
| JS bundle (gzip) | ≤ 150 KB | code + atlas.json + the two atlas JSONs (trimmed `characters.json`, see OD-D6) |
| **`dist/` total on disk** | **≤ 9 MB** | ≈ 6.8 MB |
| Downloaded per player | ≤ 5.5 MB | ≈ 3.8 MB |
| Single frame | Actors exactly 64×64; tileset frames per ground truth (floor 24×24, caps 32×32, faces 32×48, composites 32×80); other sprites per catalog (≤ 96×96) | — |
| Atlas sheet | characters: one sheet ≤ 4096×4096, ≤ 600 KB; tileset: one sheet ≤ 1024×1024, ≤ 100 KB (R-183; supersedes "≤ 1024×1024, max 4 sheets" of R-154) | 4096×2048 and 512×512 as delivered |

itch.io HTML5 games may be up to several hundred MB per file, so these limits are about load time for voters, not hosting.

## 4. Team hand-off checklist

Who: TEAM produces assets (saile2204, undertaker7431, kittingsl); the AI orchestrator integrates ([[last-ember-production-plan]] Art and audio pipeline). Assignment per asset family is set by the team (not decided here).

**For each delivery (one PR per asset family, e.g. "lurker set" or "zone 2 tiles"):**

- [ ] Asset matches its catalog entry: size, frame count, pivot, palette, checklist in style Section 8.
- [ ] Atlas deliveries replace `src/assets/cave_tileset.{png,json}` or `src/assets/characters.{png,json}` as whole files (the characters source JSON goes to `art/characters-source.json`, then `node scripts/trim-characters.ts`); loose frames under `art/frames/` no longer exist.
- [ ] Screens saved as `src/assets/art/<name>.png` (`title-keyart`, `logo`, `help-parry`, `help-goal`); favicon as `public/favicon.png`.
- [ ] Audio: WAV master kept off-repo; encoded `src/assets/audio/<id>.ogg` **and** `.m4a` (ffmpeg lines in [[architecture-assets-audio]] Section 2); loop points written into `sounds.ts` `loop`.
- [ ] Ran `npm run check && npm run build` locally — both exit 0 (there is no `npm run pack`).
- [ ] Ran `npm run dev`, looked at the asset in game (or with `?ph=1` vs `?ph=0` to compare against the placeholder).
- [ ] README `AI process` row added (style Section 11 template).
- [ ] `CHANGELOG.md` `## [Unreleased]` entry under `Added`/`Changed` (AGENTS.md rule for user-visible changes).
- [ ] No raw 1024 px generations, no WAVs, no `.psd`/`.aseprite`/`.kra` files committed. (`ponytail:` source files stay on the shared drive; commit `.aseprite` only if the team wants in-repo editing.)

**Versions:** no version suffixes in names. A redo overwrites the same file in a new PR; git history is the version record. Rejected alternatives stay on the shared drive.

**PR flow:** feature branch → PR → `ci` job (`npm ci`, `npm run check`, `npm run build`, dist sanity) must pass → branch up to date with `master` → merge. Commits/merges go through the user's workflow (AGENTS.md "Git and docs"). Two PRs replacing the same atlas file conflict by design: rebase and keep the newer delivered file; never hand-merge PNG or atlas JSON.

**300-line rule:** `src/assets/cave_tileset.json`, `characters.json` and `art/characters-source.json` are delivered/generated data blobs — valid exception #1 (auto-generated) / #2 (inherently-one-blob data) of the file-size rule. `sprites.ts`, `sounds.ts`, placeholder and synth files are hand-written code and stay ≤ 300 lines (split plan in part 1 Sections 2–3).

## 5. Licensing and credit rules

- Only ship content the team may distribute. For each AI tool, the generating member confirms on the PR that their plan's terms allow commercial/public use of outputs (e.g. paid Midjourney tier, Suno/Udio paid tier for commercial use, ElevenLabs terms). Free tiers of some music tools do not grant ownership — check before using in the jam build. **Not verified here; each member checks their own account.**
- Record for every asset: tool and model version, full asset prompt (master prompt by reference), seed/song id, generation date, author, post-processing — in README `AI process` (style Section 11).
- **No copyrighted references in prompts:** no artist, studio, game, film, franchise or character names; no "in the style of …"; no uploading third-party images as references (`--sref`/`--cref` only with the team's own outputs).
- No samples ripped from games, films or sound libraries. Third-party non-AI assets (fonts, CC0 sounds) only with a licence that allows redistribution; list source URL and licence in the README credits.
- The jam requires that the majority of the game is AI-generated: hand edits are allowed and must be described honestly in the log row.

## 6. Implementation order (for `@build`)

1. `sprites.ts`, `sounds.ts`, placeholder files, `images.ts` `drawSprite` with placeholders only — Day 3 (unblocks gameplay, zero art).
2. `src/audio/*` (R-021: engine, mixer, sfx, synth, synth-2, trigger) + synth recipes for P0 SFX — Day 3–4.
3. `check-assets.ts` + package scripts (`check` per [[architecture-rulings]] R-040); the 2.5D pivot adds `trim-characters.ts` and the rewritten check as tasks D2 and D12 in [[tasks]] (no packer).
4. Screens, music, preload/title gate — Day 5–6.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[jam-brief]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]
- [[tasks]]

---
type: architecture
title: Last Ember – Asset Pipeline 2 (Packer, Validation, Budget, Hand-off, Licensing)
description: Asset pipeline part 2 for Last Ember – the dependency-free Node atlas packer, the check-assets validation run by npm run check, bundle and pixel budgets, team hand-off checklist with folders and file names, asset PR flow under the ci job and the 300-line rule, and licensing/credit rules for AI-generated assets.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T21:10:00Z
---

# Last Ember – Asset Pipeline 2: Packer, Validation, Budget, Hand-off, Licensing

Part 1 (layout, manifests, loading, fallbacks): [[architecture-assets-pipeline]]. Hub: [[architecture]]. Style and export rules: [[architecture-assets-style]] Sections 9–11. Catalogs: [[architecture-assets-sprites]], [[architecture-assets-sprites-2]], [[architecture-assets-sprites-3]], [[architecture-assets-audio]], [[architecture-assets-audio-2]]. Schedule: [[last-ember-production-plan]].

## 1. Atlas packer `scripts/pack-atlas.ts` (Node built-ins only)

**Recommendation:** a ~150-line Node script, no new dependency. External packers (TexturePacker, free-tex-packer) were rejected: they need every team member to install and run the same GUI with the same settings, and their JSON formats differ from ours. The script is deterministic and runs in CI.

What it must do (implementer spec):

1. **Collect** `art/frames/**/*.png`, sorted by name (determinism). Key = file name without `.png`.
   Player keys append direction to the animation (`walk-ne`) and select `player_body` or `player_body-torch`; never infer player facing by rotating a right-facing frame. Validate per-frame torch-tip anchors against the manifest.
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
| 1 | Every key in `atlas.json` `frames` parses to a known `SpriteId` + anim + index `< n` | stale or misnamed frames |
| 2 | Every frame rect lies inside its sheet; sheets listed in JSON exist on disk | corrupt pack |
| 3 | `atlas.json` `hash` equals the hash recomputed from `art/frames/` | someone added frames but forgot `npm run pack` |
| 4 | Every PNG in `art/frames/` and every `src/assets/atlas-*.png` has the PNG signature and IHDR colour type 6, depth 8 (read the first 33 bytes); frame width/height equal the manifest `w×h`. Screens in `src/assets/art/` only need a valid PNG signature and IHDR size ≤ 960×540 (palette PNG allowed) | wrong export |
| 5 | Every `SOUNDS[id].file` and `layers[]` has BOTH `<name>.ogg` and `<name>.m4a` in `src/assets/audio/`, **or** the id is in the allow-list `PENDING_AUDIO` in `sounds.ts` (shrinks to empty by Day 11) | missing format = Safari silence |
| 6 | Every file in `src/assets/audio/` is referenced by some `SOUNDS` entry; same for `art/frames/` vs `SPRITES` | orphan bloat |
| 7 | `.ogg` starts with `OggS`; `.m4a` has `ftyp` at byte 4 | wrong container |
| 8 | Budgets (Section 3) by `fs.statSync` sizes | bundle creep |
| 9 | Every `loop` has `0 ≤ start < end` | bad manifest |
| 10 | All file names match `^[a-z0-9-]+(_[a-z0-9-]+)*\.(png|ogg|m4a)$` | naming rule (style Section 10) |
| 11 | Player sets are 64×64, pivot (32,32), all eight direction keys per action; walk has 4 frames; torch-set tip-anchor count equals frame count and positions lie within the canvas | enforce R-154; missing source images may still use the documented fallback |

Placeholder and synth coverage are **not** checked here: tsc enforces them (`Record<SpriteId, DrawFn>`, `Record<SoundId, …>`) in `npm run build`.

The script imports `src/assets/sprites.ts` and `sounds.ts`; they stay DOM-free (part 1 Section 2). It is also run by CI through `npm run check`, so the existing `ci` job enforces it with no workflow edit.

## 3. Budgets and limits

| Item | Limit | Target / estimate |
|---|---|---|
| Atlas sheets total | ≤ 1.2 MB | 616 catalog frames; up to 4 sheets 1024×1024; compressed size must be measured after packing (R-154) ([[architecture-assets-sprites-3]] Section 6) |
| Screens (`src/assets/art/`) | ≤ 0.6 MB, each ≤ 250 KB, max 960×540 | ≈ 0.24 MB |
| **Art total (bundled)** | **≤ 2 MB** (plan target) | Previous estimate obsolete; measure the two player sets plus screens (R-154) |
| Audio, one format | **≤ 3.3 MB** (R-140; 3 MB left only 1.7 % VBR headroom) | ≈ 2.95 MB ([[architecture-assets-audio]] Section 3) |
| Audio, both formats in `dist/` | ≤ 7 MB (2 × 3.3 MB + margin) | ≈ 6 MB |
| Any single audio file | ≤ 900 KB | music loops ≈ 0.5–0.75 MB |
| JS bundle (gzip) | ≤ 150 KB | code + atlas.json |
| **`dist/` total on disk** | **≤ 9 MB** | ≈ 6.8 MB |
| Downloaded per player | ≤ 5.5 MB | ≈ 3.8 MB |
| Single frame | ≤ 96×96 (devourer); tiles exactly 32×32 | — |
| Atlas sheet | ≤ 1024×1024, max 4 sheets (R-154) | — |

itch.io HTML5 games may be up to several hundred MB per file, so these limits are about load time for voters, not hosting.

## 4. Team hand-off checklist

Who: TEAM produces assets (saile2204, undertaker7431, kittingsl); the AI orchestrator integrates ([[last-ember-production-plan]] Art and audio pipeline). Assignment per asset family is set by the team (not decided here).

**For each delivery (one PR per asset family, e.g. "lurker set" or "zone 2 tiles"):**

- [ ] Asset matches its catalog entry: size, frame count, pivot, palette, checklist in style Section 8.
- [ ] Frames saved as `art/frames/<group>/<SpriteId>_<anim>_<nn>.png` (group folder = first name field: `player`, `mon`, `tile`, `spec`, `item`, `prop`, `ui`, `fx`).
- [ ] Screens saved as `src/assets/art/<name>.png` (`title-keyart`, `logo`, `help-parry`, `help-goal`); favicon as `public/favicon.png`.
- [ ] Audio: WAV master kept off-repo; encoded `src/assets/audio/<id>.ogg` **and** `.m4a` (ffmpeg lines in [[architecture-assets-audio]] Section 2); loop points written into `sounds.ts` `loop`.
- [ ] Ran `npm run pack`, then `npm run check && npm run build` locally — both exit 0.
- [ ] Ran `npm run dev`, looked at the asset in game (or with `?ph=1` vs `?ph=0` to compare against the placeholder).
- [ ] README `AI process` row added (style Section 11 template).
- [ ] `CHANGELOG.md` `## [Unreleased]` entry under `Added`/`Changed` (AGENTS.md rule for user-visible changes).
- [ ] No raw 1024 px generations, no WAVs, no `.psd`/`.aseprite`/`.kra` files committed. (`ponytail:` source files stay on the shared drive; commit `.aseprite` only if the team wants in-repo editing.)

**Versions:** no version suffixes in names. A redo overwrites the same file in a new PR; git history is the version record. Rejected alternatives stay on the shared drive.

**PR flow:** feature branch → PR → `ci` job (`npm ci`, `npm run check`, `npm run build`, dist sanity) must pass → branch up to date with `master` → merge. Commits/merges go through the user's workflow (AGENTS.md "Git and docs"). Two PRs touching `atlas.json`/`atlas-*.png` conflict by design: rebase, rerun `npm run pack`, commit the regenerated files — never hand-merge them.

**300-line rule:** `src/assets/atlas.json` is an auto-generated data blob — valid exception #1 (auto-generated) / #2 (inherently-one-blob data) of the file-size rule; ~622 lines at 616 frames (after R-154). `sprites.ts`, `sounds.ts`, placeholder and synth files are hand-written code and stay ≤ 300 lines (split plan in part 1 Sections 2–3).

## 5. Licensing and credit rules

- Only ship content the team may distribute. For each AI tool, the generating member confirms on the PR that their plan's terms allow commercial/public use of outputs (e.g. paid Midjourney tier, Suno/Udio paid tier for commercial use, ElevenLabs terms). Free tiers of some music tools do not grant ownership — check before using in the jam build. **Not verified here; each member checks their own account.**
- Record for every asset: tool and model version, full asset prompt (master prompt by reference), seed/song id, generation date, author, post-processing — in README `AI process` (style Section 11).
- **No copyrighted references in prompts:** no artist, studio, game, film, franchise or character names; no "in the style of …"; no uploading third-party images as references (`--sref`/`--cref` only with the team's own outputs).
- No samples ripped from games, films or sound libraries. Third-party non-AI assets (fonts, CC0 sounds) only with a licence that allows redistribution; list source URL and licence in the README credits.
- The jam requires that the majority of the game is AI-generated: hand edits are allowed and must be described honestly in the log row.

## 6. Implementation order (for `@build`)

1. `sprites.ts`, `sounds.ts`, placeholder files, `images.ts` `drawSprite` with placeholders only — Day 3 (unblocks gameplay, zero art).
2. `src/audio/*` (R-021: engine, mixer, sfx, synth, synth-2, trigger) + synth recipes for P0 SFX — Day 3–4.
3. `scripts/pack-atlas.ts` + `check-assets.ts` + package scripts (`check` per [[architecture-rulings]] R-040) — Day 4–5, before the Day 5 art delivery.
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

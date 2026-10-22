---
type: architecture
title: Last Ember – Asset Pipeline 1 (Layout, Manifests, Loading, Fallbacks)
description: How Last Ember assets get into the game – repo folder layout, hand-kept SpriteId/SoundId manifests with exhaustive placeholder and synth records, atlas JSON format, Vite import mechanism, per-frame atlas-vs-placeholder resolution, HMR-safe image and audio stores, preload and failure handling.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-22T22:00:00+02:00
---

# Last Ember – Asset Pipeline 1: Layout, Manifests, Loading, Fallbacks

> **2.5D pivot (2026-10-22, [[ADR-123-2-5d-view]], R-178..R-186 in [[architecture-rulings-3]] §9):** there is no atlas packer. Two externally produced atlases (cave tileset, character atlas) are imported as delivered and validated at check time. Sections 1, 2, 4 and 5 below are rewritten for this; the packer text in [[architecture-assets-pipeline-2]] §1 is superseded. Draw scales 0.5/0.75/1.5 quoted in Sections 3.1 and 6 are replaced by scale 1.0 (R-184). Asset facts: [[ai-jam-5-asset-formats-25d]].

Hub: [[architecture]]. Continues in [[architecture-assets-pipeline-2]] (packer, validation, budget, hand-off, licensing). What to produce: [[architecture-assets-style]], [[architecture-assets-sprites]], [[architecture-assets-sprites-2]], [[architecture-assets-sprites-3]], [[architecture-assets-audio]], [[architecture-assets-audio-2]]. Gameplay: [[last-ember-design]].

Repo facts this builds on (read-only, 2026-10-17): Vite 7, TypeScript strict with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`; `base: './'`; `npm run check` = `node src/check.ts` (Node ≥ 22.18 type stripping); **no `@types/node`** installed and `tsconfig.json` includes only `src` and `vite.config.ts` with `types: ["vite/client"]`. Hot-reload contract: AGENTS.md "Hot-reload contract".

## 1. Decisions in one table

| Topic | Decision |
|---|---|
| Runtime dependencies | **None added.** Canvas `drawImage` + WebAudio only. |
| Atlas packing | **No packer.** Two externally produced atlases are imported as delivered: `src/assets/cave_tileset.{png,json}` and `src/assets/characters.{png,json}`. `src/assets/characters.json` is generated from `art/characters-source.json` by `scripts/trim-characters.ts` (run by hand when the source changes, committed), and `scripts/check-assets.ts` validates both atlases at check time; nothing is packed at build time. Details in [[architecture-assets-pipeline-2]] §2–§3 and [[ai-jam-5-asset-formats-25d]]. |
| Atlas JSON | The two external JSONs keep their delivered shape (rects, animations, `duration_ms`, `flame_center_anchor`). `src/assets/atlas.json` shrinks to rect entries for placeholder-era ids and gains `version: 2` with an `external` list (Section 4). Pivots and sizes of non-atlas sprites stay in the hand-kept TS manifest. |
| Id unions | **Hand-kept** `SpriteId` / `SoundId`, derived with `keyof typeof` from `as const satisfies` records. No code generation. |
| Placeholder coverage | Enforced at compile time: `PLACEHOLDERS: Record<SpriteId, DrawFn>` and `SYNTH: Record<SoundId, Recipe \| null>`. A new id without a placeholder fails `npm run build` (tsc). |
| Fallback granularity | **Per frame.** A half-delivered atlas works: each missing frame falls back (Section 6). |
| Audio formats | `.ogg` + `.m4a` per sample, one chosen per browser ([[architecture-assets-audio]] Section 2). |
| Validation | `scripts/check-assets.ts` run by `npm run check`; no image decoding needed (PNG header bytes and file sizes only). |

## 2. Repo folder layout

```
art/                              committed, NOT bundled (processed source frames)
  palettes/global.png zone1.png … zone4.png   1-px-per-colour strips (style Section 7)
  characters-source.json          delivered character atlas JSON (full source, ~485 KB, not bundled)
scripts/
  trim-characters.ts              art/characters-source.json → src/assets/characters.json
  check-assets.ts                 manifest/atlas/audio/budget validation (Node only)
public/
  favicon.png                     copied as-is; index.html links ./favicon.png
src/assets/
  cave_tileset.png .json          512x512 tileset, 94 frames, imported byte-identical (R-183)
  characters.png .json            4096x2048 character atlas, 1232 frames; JSON trimmed (R-183)
  atlas.json                      rect entries for non-atlas ids + version 2 `external` list
  art/title-keyart.png logo.png help-parry.png help-goal.png   screens (not atlased)
  audio/<file>.ogg  audio/<file>.m4a                            encoded samples only
  sprites.ts                      SPRITES manifest + SpriteId (DOM-free)
  sounds.ts                       SOUNDS manifest + SoundId (DOM-free)
  placeholders-actors.ts          player, mon_*            (DrawFn per SpriteId)
  placeholders-world.ts           tile_*, spec_*, fx_*, prop_*
  placeholders-ui.ts              item_*, ui_*  + merges the three into PLACEHOLDERS
  images.ts                       atlas/screen loading + drawSprite()
src/audio/                        R-021: engine, mixer, music, sfx, synth, synth-2, trigger
                                  (replaces the old src/assets/audio.ts + synth*.ts rows)
```

- Raw AI generations (1024 px) and WAV masters are **not committed** (repo size). Keep them in the team's shared drive with the same base names; the README `AI process` row records where the source lives.
- `scripts/` is outside `tsconfig` `include` on purpose: it imports `node:*` modules and `@types/node` is not installed. Node strips types at run time; the scripts import `src/assets/sprites.ts` and `sounds.ts`, which therefore must stay **DOM-free and Node-runnable** (no `import.meta.env`, no `window`, only erasable TS, imports with `.ts` extension).
- `package.json` scripts: no `pack` script (nothing is packed). The `"check"` script is fixed by [[architecture-rulings]] R-040: `node src/check.ts && node src/checks/all.ts && node scripts/check-assets.ts && node scripts/check-guard.ts`.

## 3. Manifests

### 3.1 `src/assets/sprites.ts`

> v1 manifest; superseded for draw by R-183/R-184 and atlas.json v2 (ADR-123).

```ts
export type Anim = {
  readonly n: number; readonly fps: number; readonly loop: boolean
  readonly torchTips?: readonly (readonly [number, number])[] // R-154, torch-set only
}
export type SpriteDef = {
  readonly w: number; readonly h: number   // canvas px, must equal every frame's PNG size
  readonly px: number; readonly py: number // pivot in art px from top-left
  readonly r?: number                      // collision radius, world units (gameplay may read it)
  readonly pri: 0 | 1 | 2                  // P0/P1/P2 from the catalog
  readonly anims: Readonly<Record<string, Anim>>
}
export const SPRITES = {
  // Player definitions: 64x64, pivot (32,32), r:10; player_body and player_body-torch.
  // Each player set contains 48 action-direction animations (6 actions x 8 directions).
  // Monster body and eye definitions: 64x64, pivot (32,32), eight directions per action.
  // Body: 32 animation keys each for Lurker/Stalker, 40 for Devourer; eyes: 24 each (R-155).
  // walk-e, walk-se, walk-s, walk-sw, walk-w, walk-nw, walk-n, walk-ne:
  // each is { n: 4, fps: 10, loop: true }. See catalog Section 4 for the full table.
  tile_z1_wall: { w: 32, h: 32, px: 0, py: 0, pri: 0, anims: { v: { n: 16, fps: 0, loop: false } } },
  // … one entry per SpriteId in the catalog (45 ids after R-097/R-138)
} as const satisfies Record<string, SpriteDef>
export type SpriteId = keyof typeof SPRITES
```

- Player `Anim` extends its existing fields with `torchTips?: readonly (readonly [number, number])[]`. Require `torchTips.length === n` for each torch-set animation; prohibit it on the no-torch set. Anchors are source-pixel coordinates in the 64×64 frame (R-154). At the 2.5D pivot `torchTips` is superseded by the atlas `flame_center_anchor` per frame (render fallback (−12,−11) from the pivot); see [[architecture-modules-render]] `charatlas.ts`.
- Every value comes from the catalog data rows ([[architecture-assets-sprites]] Section 1 format). Variant sets (tiles, props, boulders) are one anim named `v` with `fps: 0`; the caller passes the variant as the frame index.
- Non-atlas screens are not `SpriteId`s; they have a tiny separate record `SCREENS = { keyart: 'title-keyart', logo: 'logo', helpParry: 'help-parry', helpGoal: 'help-goal' } as const`.
- File size: 45 sprite ids; player sets each contain 48 action-direction animation entries. The old ~170-line estimate is obsolete. If it grows past 300, split by group into `sprites-actors.ts` / `sprites-world.ts` and spread them into `SPRITES` in `sprites.ts`.

### 3.2 `src/assets/sounds.ts`

```ts
export type Group = 'music' | 'amb' | 'sfx' | 'ui'
export type SoundDef = {
  readonly group: Group; readonly gain: number; readonly pri: 0 | 1 | 2 | 3; readonly cap: number
  readonly file?: string                          // base name in src/assets/audio/ (sample); absent = synth only
  readonly loop?: readonly [start: number, end: number] // seconds; present = looping
  readonly layers?: readonly string[]             // extra sample files played with it (parry ring)
}
export const SOUNDS = {
  mus_descent: { group: 'music', gain: 0.7, pri: 3, cap: 1, file: 'mus_descent', loop: [0, 72] },
  'sfx_parry-perfect': { group: 'sfx', gain: 1, pri: 3, cap: 1, layers: ['sfx_parry-perfect-ring'] },
  // … 43 entries from the audio catalog (R-138 drops 3 orphans; sfx_mine-empty wired by R-134)
} as const satisfies Record<string, SoundDef>
export type SoundId = keyof typeof SOUNDS
```

- **Id spelling in code:** catalog ids use `-` inside a word (`sfx_parry-perfect`). TS keys keep the exact catalog id as a quoted key (`'sfx_parry-perfect': {…}`) so ids match file names 1:1. Same for sprites (`'item_resin-small'`). Do not "camelCase" them.

### 3.3 Placeholders and synth records

```ts
// placeholders-ui.ts
export type DrawFn = (ctx: CanvasRenderingContext2D, anim: string, frame: number, t: number) => void
export const PLACEHOLDERS: Record<SpriteId, DrawFn> = { ...ACTORS, ...WORLD, ...UI }
```

- Each `DrawFn` draws around the pivot at origin in world units. Actor placeholders select the named direction from the animation key and generate that directional geometry directly, with caller rotation 0 and scale 1. Non-actor callers may translate/rotate/scale. Geometry = the "Placeholder" line of each catalog entry.
- Ids whose catalog placeholder is "none drawn" (`spec_chamber`) get an explicit no-op with `// ponytail: decor invisible until art exists`.
- The spread of three partial records is typed so a missing key is a tsc error: declare `ACTORS: Record<Extract<SpriteId, `player_${string}` | `mon_${string}`>, DrawFn>` and the same pattern per file.
- `SYNTH: Record<SoundId, ((ctx: AudioContext, out: AudioNode, p: PlayParams) => Voice) | null>`; `null` only for music/stingers/ambience (silence fallback). Recipes come from [[architecture-assets-audio-2]].

## 4. Atlas JSON format (version 2)

```json
{
  "version": 2,
  "hash": "sha1-of-the-frames-object",
  "sheets": [],
  "frames": {},
  "external": [
    { "image": "cave_tileset.png", "json": "cave_tileset.json", "kind": "tileset" },
    { "image": "characters.png", "json": "characters.json", "kind": "characters" }
  ]
}
```

- `external[]` lists the two delivered atlases. `kind: 'tileset'` is read through `src/render/tileset.ts`, `kind: 'characters'` through `src/render/charatlas.ts` ([[architecture-modules-render]]); both keep the delivered JSON shape ([[ai-jam-5-asset-formats-25d]]).
- `frames[key] = [sheetIndex, x, y, w, h]` and `sheets` keep the version 1 meaning for any frame that is still packed by hand; both are empty at the pivot because no packer exists. Scripts and `images.ts` accept version 2 only.
- No pivots, no anims for those rects (they are in `sprites.ts`). `ponytail:` no repack, no trimming of the tileset; the character JSON is trimmed by `scripts/trim-characters.ts` only to keep the bundle small (OD-D6).

## 5. Vite import mechanism

```ts
// images.ts
import atlas from './atlas.json'                                   // bundled into JS, version 2
import tilesetJson from './cave_tileset.json'                      // JSON modules, bundled
import charactersJson from './characters.json'
// the two external sheets; screens in ./art/ are globbed separately below
const SHEETS = import.meta.glob(['./cave_tileset.png', './characters.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const SCREEN_URLS = import.meta.glob('./art/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
// src/audio/engine.ts (R-021): the glob path is relative to src/audio/
const AUDIO_URLS = import.meta.glob('../assets/audio/*.{ogg,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
```

- `import.meta.glob` makes missing files a non-error: an absent file is just absent from the map, so the build never breaks on undelivered art or audio.
- URLs are hashed and relative (`base: './'`), so `dist/` works from the itch.io iframe subpath and offline.
- Vite inlines files under 4 KB as data URLs (`assetsInlineLimit`); fine for tiny sheets, irrelevant for the atlas.

## 6. Atlas-vs-placeholder resolution (per frame)

Resolve once when the atlas finishes loading, not per draw:

```
for each SpriteId id, for each anim a, for i in 0..n-1:
  key = `${id}_${a}_${pad2(i)}`
  rect[id][a][i] = frames[key]                         // delivered
              ?? rect[id][a][i-1]                      // missing frame: repeat previous frame
              ?? frames[`${id}_idle_00`] ?? frames[`${id}_v_00`]   // missing anim: first idle/variant frame
              ?? null                                  // nothing delivered: placeholder
```

- Player fallback is variant- and direction-aware: requested frame → previous available frame of the same action/direction → same-set `idle-<direction>_00` → same-set `idle-e_00` → procedural placeholder. Never cross from torch to no-torch or vice versa. Pass angle 0 for authored player art and scale 1.0 (R-184); placeholders already draw in world units and use scale 1. Use the resolved frame's torch-tip metadata. Monster fallback is also direction-aware: requested frame → previous available frame of the same action/direction → same-id `idle-<direction>_00` → directional procedural placeholder. Body and eyes resolve within their own ids; never rotate, mirror, or substitute another facing. The generic resolution pseudocode above applies to non-directional sprites.
- `drawSprite(ctx, id, anim, frame, x, y, angle, scale, alpha)`: if `rect` is null or the sheet image failed → `PLACEHOLDERS[id](ctx, anim, frame, t)`; else `drawImage(sheet, x, y, w, h, -px, -py, w, h)` after translate/rotate. All authored actor art uses angle 0; choose `<action>-<direction>` for monster bodies and eyes and apply scale 1.0 for every actor (R-184; the former per-kind scales 0.5/0.75/1.5 are dropped). Only non-actor rotated draws use 16-step quantisation ([[architecture-assets-sprites]] Section 2). `imageSmoothingEnabled = false` once per frame in `render`.
- When the fallback uses `idle_00` for a missing non-player anim, apply the placeholder transform for that anim (scale/alpha from the catalog) so telegraphs stay readable — this is the "static AI sprites only" cut ([[architecture-assets-sprites-3]] Section 5).
- Dev aid: `?ph=1` in the URL forces all placeholders (compare art vs geometry); `?ph=0` default.

## 7. HMR-safe stores

> **Superseded for audio and stores by [[architecture-rulings]] R-021 and [[architecture-rulings-2]] R-091:** all non-State resources live in the `getResources()` registry ([[architecture-resources]] §2–§5); the `AudioContext` is created once per page and **never closed** (no `import.meta.hot.dispose`, no `ctx.close()`); listeners go through the `installAudioListeners` trampoline. The bullets below are history except the art hot-reload note.

- `images.ts` and `audio.ts` are imported by `game.ts`. Editing `game.ts` does not re-evaluate them (Vite keeps unchanged dependencies), so loaded images and the `AudioContext` survive normal game edits. Editing them re-evaluates them; they must clean up after themselves.
- **Images:** module-level cache `Map<string, HTMLImageElement>` is allowed: it holds resources, not game state (AGENTS.md "never keep game state in module-level variables"). Loading starts lazily on the first `drawSprite`/`preload()` call, not at module evaluation.
- **Audio:** the context is created lazily on the first `pointerdown`/`keydown` (autoplay rule, [[architecture-assets-audio]] Section 7). `audio.ts` adds those two one-shot listeners itself and removes them, stops all voices and `ctx.close()`s in `import.meta.hot?.dispose(...)`. No edit to `main.ts` needed.
- **Art hot reload in dev:** replacing `src/assets/cave_tileset.png`/`.json` or `characters.png`/`.json` is picked up by Vite directly (no repack step). Vite sees the changed files, re-evaluates `images.ts` → `game.ts`, `main.ts` swaps the module and keeps `State` (`[hmr] game.ts swapped, state kept`). New audio files work the same through the glob. Game state is never touched by asset reloads.

## 8. Preload and failure handling

| Step | Behaviour |
|---|---|
| Page load | `title` screen draws immediately with placeholders + text "loading n %"; key art fades in when decoded. |
| Image load | For each sheet and screen: `img.src = url; await img.decode()`. P0 first: atlas sheets, then `title-keyart`, then the rest. |
| Image failure | `decode()` rejects or 10 s timeout → mark the sheet failed, log once per sheet `console.warn('[assets] <sheet file name> failed, using placeholders')` (`cave_tileset.png`, `characters.png`); all frames of that sheet resolve to placeholders. The game never blocks on art. |
| Start gate | "Click to start" accepts input when sheets are loaded or failed, or after 5 s, whichever first. The click is also the audio unlock. |
| Audio after unlock | `fetch(url) → arrayBuffer → ctx.decodeAudioData`, P0 sounds first (`mus_descent`, `amb_cave`), max 4 in parallel. |
| Audio failure | fetch/decode error → log once, mark the id failed; SFX use their `SYNTH` recipe, music/ambience stay silent. Never throw into `update`/`render`. |
| Late audio | A sound requested before its buffer is ready plays its synth fallback (SFX) or music retries its start every update step (R-092). |

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-pipeline-2]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[jam-brief]]
- [[architecture-resources]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]

---
type: architecture
title: Last Ember – Asset Style Guide (Art Direction)
description: Binding art direction for Last Ember – chosen style (dark low-res hand-painted pixel art, top-down flat, unlit sprites), scale and tile size, full hex palette per zone and per flame colour, ambient tints, master style prompt and negative prompt, consistency checklist, export rules, downscale/palette-lock workflow, naming convention and the README AI-process logging template.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – Asset Style Guide

Part of the asset library. Hub: [[architecture]]. Product spec (governs): [[last-ember-design]]. Schedule: [[last-ember-production-plan]]. Sprite catalog: [[architecture-assets-sprites]], [[architecture-assets-sprites-2]]. Audio: [[architecture-assets-audio]]. Integration: [[architecture-assets-pipeline]].

**Lock date: Day 2 (2026-10-18).** After lock, changes to this file need the whole team to agree, because every asset already made depends on it.

## 1. Chosen style (ONE style, no mixing)

**Dark, low-resolution hand-painted pixel art, seen strictly from directly above (top-down flat, 90° camera), drawn UNLIT in dark values.**

Why this style:

- AI generators (Midjourney, FLUX, SDXL) produce "top-down pixel art game sprite" reliably. After downscale and palette-lock (Section 7) every asset ends up in the same pixel grid and colours, which hides generator drift.
- Small sprites (32–96 px) stay readable as silhouettes. Painterly detail would turn to mush at this size.
- The flame is the only light source. Unlit dark sprites let the engine's radial light and additive glow ([[last-ember-design]] Rendering notes) do all the shading. Baked highlights would contradict the moving torch.
- Pixel art scales cleanly with integer zoom and keeps the atlas small (≤ 2 MB budget, [[last-ember-production-plan]]).

Rejected: painterly high-res (inconsistent between generations, large files), vector/flat (looks cheap in darkness, weak in the Graphics category), isometric/3/4 view (spec rejects isometric; 3/4 sprites look wrong under a top-down radial light).

## 2. Scale, grid and camera

| Rule | Value |
|---|---|
| Tile size | **32 × 32 art pixels = 32 world units.** CONFIRMED (the architect default is kept): 32 px holds enough detail for vein colours and cracks; 16 px could not show three mineral colours legibly. |
| Art pixel to world unit | Tiles: 1 art pixel = 1 world unit. Monsters: 64×64 source frames, draw scales 0.5 / 0.75 / 1.5 for Lurker / Stalker / Devourer (R-155). Player: 64×64 source frames drawn at scale 0.5; collision and world footprint unchanged (R-154). |
| Screen zoom | Integer zoom **2×** world zoom (tile art pixel = 2×2 CSS px; actor source pixels use their documented draw scales). At 1920×1080 the view shows 30 × 17 tiles. Implementer may pick 3× above 2560 px width; always an integer. |
| Smoothing | Tiles, UI and props: `imageSmoothingEnabled = false`. Actors use authored directions without rotation: see [[architecture-assets-sprites]] Section "Facing". |
| Camera | Straight down. No perspective, no visible wall faces, no cast shadows drawn into sprites. |
| Facing reference | Player: eight authored directions `e,se,s,sw,w,nw,n,ne`, separate with/without-torch sets, no runtime sprite rotation. Monsters: eight authored directions in the same order, selected by facing; no runtime sprite rotation or mirroring. See R-154/R-155. |
| Pixel density | Never mix pixel sizes. No sub-pixel detail or anti-aliased soft brushes in source files. Player source density is twice world density (R-154); use its documented scale 0.5 rather than changing world units. Monster source density varies by kind; use the R-155 draw scales without changing collision or tiles. |

## 3. Outline and value rules

- **Outline:** 1 art-pixel outline on actors, pickups and props, colour `#0a0809` (near-black, warm). Tiles have NO outline. UI icons use a 1 px outline `#0a0809`.
- **No selective outlining** (no coloured outlines). Same 1 px weight everywhere.
- **Values:** body colours stay between 8 % and 45 % lightness (HSL). Only these elements may go brighter: eyes, mineral crystals, flame-related pickups (resin glint), Beacon crystal, UI.
- **Lighting rule:** sprites are drawn **WITHOUT baked lighting** — no directional highlights, no rim light, no drop shadow, no ambient occlusion beyond a 1-pixel darker edge inside the outline. "Light direction = none." The engine lights everything with the flame.
- **Emissive parts** (eyes, crystals, Beacon core, resin glint) are drawn at full brightness because they glow on their own. There are NO separate `_glow` frames: every glow above the darkness mask is procedural (additive radial sprites, [[architecture-render-3]] §1; the `*_glow` ids were dropped, [[architecture-rulings-3]] R-138).

## 4. Global palette (hex)

Palette-lock every asset to these colours plus the zone ramp it belongs to. Max 32 colours per asset.

### 4.1 Neutrals and background

| Use | Hex |
|---|---|
| Background / unexplored void | `#000000` |
| Outline | `#0a0809` |
| Deep shadow | `#141114` |
| Bone / pale organic | `#8c8070`, highlight `#b8ab94` |
| Wood / roots | `#3b2a1e`, `#5a4030` |
| Memory layer (explored, not lit) | `#3b4a5c` drawn at 35 % alpha over black |

### 4.2 Cave rock per zone

Each zone has a 5-step ramp: `wall-dark`, `wall`, `floor-dark`, `floor`, `floor-light` (floor-light is for pebbles and cracks only).

| Zone | Mood | wall-dark | wall | floor-dark | floor | floor-light |
|---|---|---|---|---|---|---|
| 1 shallow | warm brown limestone, dry | `#1c1714` | `#2a2420` | `#2e2823` | `#3a332d` | `#544a40` |
| 2 | cold blue-grey slate, damp | `#13161b` | `#1f242b` | `#22272e` | `#2d333b` | `#454e59` |
| 3 | mossy green-grey, wet, roots | `#111612` | `#1b231d` | `#1f2821` | `#29342c` | `#3f5044` |
| 4 deepest | violet-black basalt, glassy | `#120d16` | `#1d1524` | `#211a28` | `#2b2234` | `#463a55` |

Moss accent (zone 3): `#2f4a2a`, `#46663a`. Basalt glass glint (zone 4): `#6a5a88`.

### 4.3 Flame colours (engine draws flames; artists use these for icons, key art, Help art)

Every flame = pale core + coloured mantle + darker outer fringe. Sparks use the listed complementary colour.

| Flame type id | Core | Mantle | Outer fringe | Sparks (complement) |
|---|---|---|---|---|
| `plain` (orange, run start) | `#fff4d6` | `#ff8a1e` | `#c2410c` | `#5ab0ff` |
| `sodium` (yellow-white) | `#ffffff` | `#ffe14a` | `#f5b700` | `#6a5cff` |
| `copper` (turquoise) | `#e8fff9` | `#1fd6b8` | `#0e8f9c` | `#ff5c7a` |
| `strontium` (deep red) | `#ffe0e0` | `#e0182d` | `#8a0a1e` | `#3dffb0` |

### 4.4 Minerals (vein crystals, item chunks, hotbar icons)

| Mineral | Crystal base | Crystal light | Crystal glint |
|---|---|---|---|
| `sodium` | `#c9a400` | `#ffe14a` | `#ffffff` |
| `copper` | `#0e7f74` | `#1fd6b8` | `#e8fff9` |
| `strontium` | `#7a0a1a` | `#e0182d` | `#ffd0d0` |

Copper ore also shows a malachite host rock `#2f5a3a` so it reads as copper, not as ice.

### 4.5 Monsters ("shades")

| Use | Hex |
|---|---|
| Shade body dark | `#0d0b12` |
| Shade body mid | `#1b1726` |
| Shade body edge wisps | `#2c2540` |
| Eye glow, idle (dim) | core `#cbb8ff`, halo `#6b4fb8` |
| Eye glow, telegraph (bright, ~0.4 s before lunge) | core `#ffffff`, halo `#b48cff` |
| Devourer maw interior | `#3a0f2a` |

Eyes are pale violet on purpose: no flame colour is violet, so eyes never get mistaken for a mineral flame or a pickup.

### 4.6 Pickups and Beacon

| Use | Hex |
|---|---|
| Resin amber | `#8a4a0c`, `#d9861c`, glint `#ffd27a` |
| Healing plant leaf | `#2e6b3a`, `#4fa35a`, bloom `#b6ff8a` (bloom glows) |
| Beacon stone | `#2a2a30`, `#4a4a55` |
| Beacon brazier metal | `#5a3a1e`, `#8a5a2a` |
| Beacon lit core | `#fff4d6` → `#ffb347` → `#ff6a00` |

### 4.7 UI

| Use | Hex |
|---|---|
| Text primary | `#e8dcc8` |
| Text dim | `#8a7f70` |
| Panel background | `#120f0d` at 85 % alpha |
| Panel border | `#3a2e24`, highlight `#5c4a38` |
| Accent (ember) | `#ff8a1e` |
| HP pip full | `#ff6b4a`, highlight `#ffb59e` |
| HP pip empty | fill `#2a1a16`, rim `#6a4a3e` |
| Selected frame | `#ffd27a` |
| Danger / low HP flash | `#ff3b2a` |
| Win | `#ffd27a` |

## 5. Ambient tint per zone

The engine fills "darkness" not with pure black but with the zone tint, and colours the memory layer with it. Values for the implementer (also guide the artist's mood):

| Zone | Darkness fill | Memory tint (35 % alpha) | Remembered-floor mood |
|---|---|---|---|
| 1 | `#0a0806` | `#4a4236` | dusty warm |
| 2 | `#06080b` | `#3b4a5c` | cold blue |
| 3 | `#050906` | `#3a5244` | damp green |
| 4 | `#0a050c` | `#4a3a5c` | violet dread |
| After Beacon (escape) | whole cave lit: multiply ambient `#ffb36b` at 55 % | n/a | warm, shaking, dusty |

## 6. Master style prompt

Paste this block first in every image prompt, then the asset-specific part from [[architecture-assets-sprites]].

```
top-down pixel art game asset, viewed from directly above, orthographic 90 degree overhead view,
dark low-resolution hand-painted pixel art, limited palette, 1 pixel near-black outline,
unlit flat colours, no lighting, no shadows, no highlights, dark muted values,
crisp pixels, clean silhouette, centered single object, plain flat solid #00ff00 background,
style of a dark cave survival game, moody, gritty
```

Negative prompt (FLUX/SDXL field; for Midjourney append as `--no ...`):

```
perspective, isometric, three-quarter view, side view, front view, horizon, ground plane,
cast shadow, drop shadow, rim light, glow on background, bloom, lens flare, gradient background,
text, watermark, signature, logo, UI frame, border, multiple objects, cropped, blurry,
anti-aliasing, soft brush, 3d render, photorealistic, smooth shading, high detail noise, jpeg artifacts
```

Midjourney parameters: `--style raw --stylize 50 --ar 1:1` (sprites), `--ar 16:9` (key art), `--seed <n>` fixed per asset family (log it). FLUX: guidance 3.5, 28–30 steps, 1024×1024, fixed seed per family.

Key art, cover and Help illustrations use the **illustration variant**: replace the first two lines with `dark painterly pixel art illustration, high-angle top-down view of a cave,` and allow the flame to light the scene (they are not engine-lit).

## 7. Downscale and palette-lock workflow

1. **Generate large:** 1024 × 1024 per single object on flat `#00ff00` (chroma green; no zone, flame or eye colour is that green).
2. **Remove background:** magic wand / colour key on `#00ff00` (tolerance 20 %) in Aseprite, LibreSprite, Krita or GIMP; or `rembg` if the key fails. Delete green spill on edges.
3. **Crop** to the object's bounding box plus 10 % margin, square.
4. **Downscale** to the catalog pixel size: first Lanczos to 4× target, then **nearest-neighbour** to 1×. ImageMagick: `magick in.png -filter Lanczos -resize 128x128 -filter point -resize 32x32 out.png`.
5. **Palette-lock:** remap to the asset's palette (global neutrals + its zone ramp + its special colours), no dither: `magick out.png +dither -remap art/palettes/zone2.png out.png`. Palette PNGs (`art/palettes/global.png`, `zone1.png` … `zone4.png`) are 1-px-per-colour strips built from Section 4; each zone strip also contains the global neutrals, flame, mineral, shade and pickup colours.
6. **Binary alpha:** `magick out.png -channel A -threshold 50% +channel out.png`. No semi-transparent pixels in sprites (glow is engine work).
7. **Outline pass:** add/repair the 1 px `#0a0809` outline by hand. Clean stray pixels. Make silhouette readable at 1× zoom.
8. **Frames:** for animations, generate ONE key pose with AI, then hand-edit or re-prompt with the same seed + `img2img`/`--cref` at strength ≤ 0.35 for the other frames. Keep the body pixels identical where they do not move.
9. **Check** against Section 8. Save to the delivery folder named per Section 10.

Fallback when AI output is unusable at small size: draw the frame by hand over the placeholder shape (the placeholder geometry in the catalog is a valid base sketch).

## 8. Consistency checklist (run on every asset before delivery)

- [ ] Camera straight down; no visible side faces, no horizon.
- [ ] Player matches its named direction and torch variant; monsters face RIGHT; tiles/pickups are symmetric or orientation-free.
- [ ] Light direction = none: no highlight side, no shadow side, no drop shadow.
- [ ] 1 px `#0a0809` outline (actors, props, pickups, icons); none on tiles.
- [ ] Only palette colours (Section 4), ≤ 32 colours, binary alpha.
- [ ] Exact pixel size from the catalog; pivot pixel where the catalog says.
- [ ] Silhouette readable at 1× when squinting; distinct from the other monsters.
- [ ] Emissive parts at full brightness; body in dark values (≤ 45 % lightness).
- [ ] Tiles: seamless on all 4 edges (test 3 × 3 repeat).
- [ ] Animation frames: same canvas size, same pivot, no jitter of static parts.
- [ ] No text, no logos, no references to existing IPs.
- [ ] Prompt, tool, seed, post-processing logged (Section 11).

## 9. Export rules

- **Format:** PNG-32 (RGBA 8-bit), sRGB, no colour profile chunk (strip with `magick -strip` or `oxipng --strip safe`).
- **Delivery unit:** one PNG per frame (team delivers loose frames; the packer builds the atlas, see [[architecture-assets-pipeline]]).
- **Atlas sheets** (packer output): power-of-two dimensions (≤ 1024 × 1024, max 4 sheets (R-154; measure actual packing and compressed bytes)), **1 px transparent padding + 1 px edge extrusion** around each frame to stop bleeding under scaling/rotation.
- **Compression:** `oxipng -o 4 --strip safe --nc` on final sheets (lossless; `--nc` keeps the RGBA colour type; do NOT pngquant the atlas — the check requires RGBA); bundled screens (key art, logo, Help) are PNG (palette-quantised allowed); JPEG only for the non-bundled itch cover and screenshots.
- **Transparent background** for everything except tiles, key art, Help illustrations, cover and screenshots (opaque). The logo is transparent.

## 10. Naming convention

Lowercase ASCII, words joined by `-`, fields joined by `_`. Frame numbers two digits from `00`.

```
<group>_<id>[_<variant>]_<anim>_<nn>.png
```

| group | Example |
|---|---|
| `player` | `player_body-torch_walk-ne_03.png` (64×64; no-torch example: `player_body_walk-ne_03.png`) |
| `mon` | `mon_lurker_lunge-ne_01.png`, `mon_devourer_eyes_idle-s_00.png` (64×64) |
| `tile` | `tile_z2_floor_v_02.png` (variant 2), `tile_z4_wall_v_13.png` (mask 13) |
| `spec` | `spec_beacon_lit_05.png`, `spec_vein-copper_full_00.png` |
| `item` | `item_resin-small_idle_00.png`, `item_mineral-sodium_idle_00.png` |
| `prop` | `prop_mushroom_v_00.png` |
| `ui` | `ui_hp-pip_v_00.png` (full; 01 empty, 02 lost) |
| `art` | delivered as `art_itch-cover.png` (not bundled); bundled screens use the pipeline names without prefix: `src/assets/art/title-keyart.png` (code `SCREENS.keyart`, R-141), `logo.png`, `help-parry.png`, `help-goal.png` |

Player and monster animation names (including monster eyes) append the direction with a hyphen (`walk-ne`, `idle-s`); player set ids are `player_body` and `player_body-torch`. Variant sets and multi-state UI icons use the anim name `v`; the frame number is the variant/state index. Actor eye sprites are their own `SpriteId` (`mon_lurker_eyes`).

The atlas frame key is the file name without `.png`. The engine-facing `SpriteId` is `<group>_<id>[_<variant>]` (for example `mon_lurker`); animation names, frame counts and fps are defined in the TS manifest `src/assets/sprites.ts` ([[architecture-assets-pipeline]]). Versions are NOT in file names; git history is the version record.

## 11. Credit and prompt logging (README `AI process`)

Every delivered asset (or asset family sharing one prompt) gets one row in the README `AI process` table, in the same PR as the asset (AGENTS.md jam rule). Template:

```
| Asset id | Tool (model/version) | Prompt (asset part; master prompt by reference) | Seed | Post-processing | Date | Author |
|---|---|---|---|---|---|---|
| mon_lurker (idle, lunge, death) | Midjourney v7 | "small shadow creature ..." + master style prompt | 18233 | rembg, Lanczos→nearest 64 px, remap zone palette, separately authored frames in all eight directions | 2026-10-21 | kittingsl |
```

- The master style prompt (Section 6) is quoted once in the README; rows refer to it as "+ master style prompt".
- Never put names of artists, studios, games or franchises in prompts.
- Record hand-edit extent honestly (jam rule: majority AI-generated; process sharing is a voting factor).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[jam-brief]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-render-3]]
- [[architecture-rulings-3]]

---
type: architecture
title: Last Ember – Sprite Catalog 3 (Pickups, Props, UI, Key Art, Totals)
description: Sprite catalog part 3 for Last Ember – resin, plant and mineral pickups, zone decor props, HUD and UI icons, title key art, logo, Help illustrations, itch.io cover, screenshots and favicon, followed by image totals, size estimates, atlas size and the per-priority production order tied to the jam schedule.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T20:30:00Z
---

# Last Ember – Sprite Catalog 3: Pickups, Props, UI, Key Art, Totals

Entry format and placeholder conventions: [[architecture-assets-sprites]] Section 1. Palette and `{MASTER}` prompt: [[architecture-assets-style]]. Tiles: [[architecture-assets-sprites-2]]. Loader/atlas/budget: [[architecture-assets-pipeline]]. Gameplay: [[last-ember-design]] (Pickups, Minerals, HUD, Help, End screen). Schedule: [[last-ember-production-plan]].

## 1. Pickups

Pickups do not rotate. Each bobs ±1 px at 1 Hz (engine) and has a **procedural pickup glow** (additive radial gradient, radius 14, alpha pulsing 0.25–0.45 at 1.5 Hz) in its glow colour, so it reads in the dark at the edge of the light. Pickup radius = collision radius below; pickup is on contact.

### 1.1 `item_resin-small`, `item_resin-large`

`item_resin-small` | 16×16 | `idle:4@6 loop` | (8,8) | 8 | **P0**
`item_resin-large` | 24×24 | `idle:4@6 loop` | (12,12) | 11 | **P1**
Glow colour `#d9861c`. Small refuels less than large (values are gameplay tuning, not art).

**Looks:** a lump of hardened tree resin / pitch, like a dark amber teardrop crusted with grit. Body `#8a4a0c` with translucent-looking lighter core `#d9861c` (drawn as flat lighter colour, no gradient), and one bright glint `#ffd27a` that travels across the lump over the 4 frames (shimmer). Large = a fist-sized cluster of 3 lumps on a scrap of bark `#3b2a1e`. Mood: precious, warm, "fuel".

**Prompt:** `{MASTER}, a small lump of dark amber tree resin seen from above, teardrop shape, crusted edges, warm orange core, one tiny bright glint, 16x16 sprite`. Large: `three lumps of dark amber resin on a scrap of bark, 24x24`.

**Placeholder:** small = circle r=5 `#d9861c`, outline `#8a4a0c`, 1×1 `#ffd27a` dot at (−2,−2); large = 3 circles r=4 at (−3,0),(3,−2),(2,3). Glow as above.

### 1.2 `item_plant`

`item_plant` | 24×24 | `idle:4@4 loop` | (12,12) | 10 | **P0**
Glow colour `#b6ff8a` (procedural pickup glow, [[architecture-render-3]] §1).

Dropped (R-138, no State or producer): `item_plant_glow` (glow is procedural) and the `picked`/`wilted` anims (a picked plant leaves State; no decoy plants exist).

**Looks:** a low cave herb seen from above: a rosette of 5–7 fleshy leaves `#2e6b3a`/`#4fa35a` spreading from the centre, with a small pale-green bulb flower in the middle `#b6ff8a` that glows faintly (bioluminescent; the only green light in the cave, so it reads as "heal"). `idle`: leaves sway 1 px, the bloom pulses.

**Prompt:** `{MASTER}, a small cave herb seen from directly above, rosette of fleshy dark green leaves, a tiny pale glowing green bulb flower in the center, 24x24 sprite`.

**Placeholder:** 6 ellipses rx=5 ry=2 `#4fa35a` rotated every 60° around the centre at distance 4; circle r=2.5 `#b6ff8a`.

### 1.3 Mineral chunks `item_mineral-sodium`, `item_mineral-copper`, `item_mineral-strontium`

`item_mineral-<m>` | 16×16 | `idle:1@0` | (8,8) | 7 | **P0**
Glow colour = mineral `Crystal light` hex (style 4.4).

Used three ways (one art, three uses): dropped chunk after mining, the chunk flying into the flame on toss (engine moves it along an arc and scales 1→0.5), and the **hotbar icon** (no separate UI icon files).

**Looks:** one fist-sized broken crystal chunk on a little host-rock base. Sodium: a blocky pale-yellow cube cluster `#c9a400`/`#ffe14a`, white glint. Copper: a turquoise needle spray on green malachite `#0e7f74`/`#1fd6b8`/`#2f5a3a`. Strontium: two deep red prisms crossed `#7a0a1a`/`#e0182d`, pale pink glint. Each must be identifiable by **shape as well as colour** (cube / spray / prisms) for colour-blind players.

**Prompt:** `{MASTER}, a single <crystals> chunk seen from above, broken off, small rock base, 16x16 icon sprite`.

**Placeholder:** sodium = square 8×8 `#ffe14a`; copper = 3 lines from centre (length 6, at −30°, −90°, −150°) width 2 `#1fd6b8` on circle r=3 `#2f5a3a`; strontium = two 3×9 rectangles crossed at ±30° `#e0182d`. All with 1 px outline `#0a0809`.

## 2. Decor props (keep count low)

Max **1 prop per 12 floor cells**, never in corridors 1 tile wide, never on the guaranteed escape route if solid. Props are tinted toward the zone ramp by palette-locking each variant once per zone where noted.

| SpriteId | px | Frames | Pivot | Solid radius | Zones | Priority | Looks | Placeholder |
|---|---|---|---|---|---|---|---|---|
| `prop_stalagmite` | 32×32 | `v:4` (one per zone, frame = zone−1) | (16,16) | 10 (solid) | 1–4 | P2 | a rock spike seen from above: concentric rings narrowing to a pale tip, zone `wall`/`floor-light` colours | circle r=10 zone `wall`, inner r=4 `floor-light` |
| `prop_bones` | 32×32 | `v:2` | (16,16) | — | 1–4 | P2 | v0 a scattered small animal skeleton `#8c8070`/`#b8ab94`; v1 a lone human-ish skull and long bones (no gore) | 3 lines width 2 `#8c8070` |
| `prop_roots` | 32×32 | `v:2` | (0,0) | — | 3 | P2 | thick gnarled roots crawling across the floor from a wall `#3b2a1e`/`#5a4030` | 2 curves width 3 `#3b2a1e` |
| `prop_mushroom` | 16×16 | `v:3` | (8,8) | — | 3–4 | P2 | clusters of small grey-violet mushroom caps `#463a55`/`#6a5a88`, NOT glowing (glow is reserved for pickups/eyes) | 3 circles r=2 `#6a5a88` |
| `prop_puddle` | 32×32 | `v:2` | (0,0) | — | 2–3 | P2 | a shallow irregular dark water puddle `#13161b` with a `#454e59` rim; the engine adds a faint additive flame reflection when lit | ellipse rx=12 ry=7 `#13161b` |

**Prompt pattern:** `{MASTER}, <looks>, seen from directly above, on transparent background, <px> sprite`.

## 3. HUD and UI

All UI is drawn in screen space at integer scale 2× (same as the world), `imageSmoothingEnabled = false`. Text uses the canvas font `bold 16px ui-monospace, monospace` in `#e8dcc8` (no bundled font; ponytail: add an OFL pixel font only if text looks off-style, credit it in README).

Multi-state icons below store their states as anim `v` frames in the listed order (`ui_hp-pip_v_00` = full, `_01` = empty, `_02` = lost; `ui_slot` 00 normal, 01 selected). The aim cursor is a native CSS crosshair, not a sprite ([[architecture-rulings-2]] R-097, [[architecture-ui]] §6); `ui_cursor` is removed from the catalog and `SPRITES`.

| SpriteId | px | Frames | Pivot | Priority | Looks | Placeholder |
|---|---|---|---|---|---|---|
| `ui_hp-pip` | 12×12 | `full`, `empty`, `lost` (3 frames, index 0–2) | (6,6) | P0 | a tiny ember-heart: a rounded flame-drop shape. Full `#ff6b4a` + highlight pixel `#ffb59e`; empty: same outline, fill `#2a1a16`, rim `#6a4a3e`; lost: cracked in two, used for a 0.3 s flash | full: circle r=5 `#ff6b4a`; empty: circle r=5 stroke `#6a4a3e` fill `#2a1a16` |
| `ui_slot` | 24×24 | `normal`, `selected` | (12,12) | P0 | square hotbar frame with chipped stone corners `#3a2e24`/`#5c4a38` on `#120f0d`; selected = same with a `#ffd27a` inner border and corner sparks | rect 22×22 fill `#120f0d` stroke `#3a2e24` (selected: stroke `#ffd27a` width 2) |
| (hotbar icons) | 16×16 | — | — | P0 | reuse `item_mineral-*` drawn centred in the slot; count drawn as text `×2` bottom-right; count 0 → icon at 30 % alpha | as item placeholders |
| `ui_depth` | 12×12 | 1 | (6,6) | P1 | a down-pointing chevron over three stacked strata lines `#8a7f70`; the number is text beside it | triangle pointing down `#8a7f70` |
| `ui_exit-arrow` | 24×24 | 1 (rotated by engine, 16 steps) | (12,12) | P1 | a chunky arrow of daylight `#cfe3ff` with `#0a0809` outline pointing +x, drawn at the screen edge toward the exit during `escape` | triangle (12,0),(−8,−8),(−8,8) `#cfe3ff` |
| `ui_keycap` | 16×16 | 1 | (8,8) | P1 | a blank worn stone key cap `#3a2e24` with `#5c4a38` top; engine prints the key letter (`E`) on it; the **hold ring** around it is procedural (arc r=12, width 3, `#ff8a1e`, sweep = progress) for mining and Beacon | rect 14×14 `#3a2e24` + text |

**Prompt (UI):** `{MASTER}, game UI icon, <looks>, 16x16 (or size), flat front view icon`. UI icons are the one place a flat front view is allowed (they are not world objects); remove "top-down" from the master block for UI.

## 4. Screens and promotional art (not in the atlas)

| Id / file | Source size | Delivered | Format and est. size | Priority | Use |
|---|---|---|---|---|---|
| `title-keyart.png` (`src/assets/art/`, code `SCREENS.keyart`, R-141) | 1920×1080 | 960×540, drawn 2× nearest (cover-crop) | PNG (palette-quantised with `pngquant 256`), ≈150 KB | P0 (Day 5 per plan) | `title` screen background, also `help`/`dead`/`won` backdrop at 40 % brightness |
| `art_logo` | 1920×480 | 480×120 | PNG-32 transparent, ≈25 KB | P1 | wordmark on `title` and on the itch cover |
| `art_help-parry` | 1280×720 | 320×180, drawn 2× | PNG, ≈30 KB | P1 | Help screen, parry panel |
| `art_help-goal` | 1280×720 | 320×180, drawn 2× | PNG, ≈30 KB | P1 | Help screen, goal panel |
| Help mineral table | — | built in code from `item_mineral-*` + flame swatches (style 4.3) + text | 0 KB | P1 | Help screen, minerals panel |
| `art_itch-cover` | 1260×1000 | 630×500 | PNG, ≈200 KB, not bundled | P1 (Day 12) | itch.io cover image |
| screenshots | in-game capture | 1920×1080 ×4 | PNG, not bundled | P2 (Day 12–13) | itch.io page: descent in darkness, perfect-parry flare, mineral flame colours, Beacon escape with falling rocks |
| `favicon` | 32×32 | 32×32 | PNG, ≈1 KB | P2 | browser tab; an ember drop `#ff8a1e` with `#fff4d6` core on transparent |

**Title key art — looks:** illustration variant of the master prompt (style Section 6). A high top-down view into a black cave. In the centre a tiny hooded figure holds up a torch; its orange flame (`#fff4d6` core, `#ff8a1e` mantle) lights a small circle of brown rock floor. At the edge of the light, many pairs of pale violet eyes (`#cbb8ff`) in the dark, one larger set of four eyes at the bottom. In the far top corner, faint coloured crystal glints (yellow, turquoise, red). Bottom third deliberately empty and dark for the menu text; top-centre space for the logo. Mood: lonely, tense, beautiful. **Prompt:** `dark painterly pixel art illustration, high-angle top-down view of a cave, a tiny hooded explorer in the center holding a torch with an orange flame lighting a small circle of rough rock floor, many pairs of pale violet glowing eyes watching from the darkness around the light, faint yellow turquoise and red crystal glints far away, mostly black, empty dark space at the top and bottom, moody, 16:9` + negative prompt minus "glow on background", `--ar 16:9`.

**Logo — looks:** the words "LAST EMBER" in chunky hand-cut pixel capitals, warm bone `#e8dcc8` with an ember gradient done in 3 flat steps (`#fff4d6`, `#ff8a1e`, `#c2410c`) on the lower half of each letter; the "A" of EMBER replaced by a small flame drop. **Tooling:** FLUX renders text reliably (`the words "LAST EMBER" in chunky pixel letters, ...`). Midjourney often misspells; if so, generate only the flame emblem and hand-letter with a pixel font licensed OFL (credit in README).

**Help parry — looks:** three panels left to right on dark: a shade with violet eyes crouching (label space "EYES GLOW"), the player swinging the torch arc into it with a white-orange flare ("CLICK NOW"), the shade bursting into ink ("PERFECT"). Labels are drawn by the engine as text, not in the image. **Help goal — looks:** a vertical cut-through diagram: stairs and daylight at the top, four stacked cave bands darkening in zone colours (style 4.2), a lit brazier at the bottom, a dotted path going down and a red-orange path coming back up with falling rocks. Labels again by engine text.

**Itch cover — looks:** the key art recomposed for 630×500: hooded figure lower-centre, flame bigger, logo top. **Prompt:** key-art prompt with `--ar 63:50`, then place `art_logo` by hand.

## 5. Static fallback (cut-order rule 2)

If animation frames are late, the minimum delivery per actor is frame `00` of each animation. The loader treats a missing frame as "repeat the last available frame". If only `idle_00` exists, the engine uses it for every animation and applies the placeholder transforms (scale/alpha) from [[architecture-assets-sprites]]. This is how "ship static AI sprites only" works without code changes.

## 6. Totals

| Group | Atlas frames | Notes |
|---|---|---|
| Player (body 26 + torch 1) | 27 | [[architecture-assets-sprites]] 4 |
| Lurker (15 + eyes 5) | 20 | |
| Stalker (15 + eyes 5) | 20 | |
| Devourer (19 + eyes 5) | 24 | first cut |
| Terrain tiles (4 zones × (4 floor + 16 wall + 4 inner)) | 96 | [[architecture-assets-sprites-2]] 2 |
| Special tiles (entrance 1, beacon 11, veins 12 (3 × full 1 + mining 3), chamber 3, boulder 3, crater 1, dust 5) | 36 | R-138 dropped beacon glow 10, vein glows 12, depleted 3, small rocks 3, cracks 3 |
| Pickups (resin 8, plant 4, minerals 3) | 15 | R-138 dropped plant glow 4, picked/wilted 2 |
| Props | 13 | |
| UI (hp-pip 3, slot 2, depth 1, exit-arrow 1, keycap 1) | 8 | `ui_cursor` 2 dropped (R-097) |
| **Atlas total** | **259 frames** | 45 distinct `SpriteId`s (wildcards expanded: actors 8, tiles 12, special 9, pickups 6, props 5, UI 5); was 298 / 53 before R-097/R-138 |
| Non-atlas bundled (key art, logo, 2 help, favicon) | 5 | |
| Non-bundled (itch cover, 4 screenshots) | 5 | |

**Atlas size estimate:** padded area ≈ 550 000 px² (devourer 230 k, special ≈ 82 k, tiles 111 k, rest ≈ 127 k; the R-138 drops remove ≈ 70 k, mostly the 64×64 Beacon glow frames) → **one 1024×1024 sheet** at ~52 % fill. Dark, palette-locked pixel art compresses well: **≈ 270–400 KB** after oxipng. Second sheet only if it overflows (then split: `atlas-world` tiles+special, `atlas-actors` actors+items+UI).

**Per-image size estimates (PNG, loose frames before packing):** 16×16 ≈ 0.4 KB, 32×32 ≈ 1 KB, 48×48 ≈ 2 KB, 64×64 ≈ 3 KB, 96×96 ≈ 6 KB. Bundled art total ≈ 0.35 MB atlas + 0.24 MB screens ≈ **0.6 MB** (upper estimate 0.65 MB kept in the dist budget), well under the 2 MB budget ([[architecture-assets-pipeline]]).

## 7. Production order (per priority, tied to [[last-ember-production-plan]])

| When | Deliver | Priority |
|---|---|---|
| Day 2 (Oct 18) | Style guide lock; palette strip PNGs; **style test**: `player_body idle_00`, `mon_lurker idle_00`, `tile_z1_floor v0` approved by the team | P0 |
| Day 3–4 (Oct 19–20) | zone 1 floor + 16 walls; `item_resin-small`; `ui_hp-pip` (Day 4 descent test may still run on placeholders) | P0 |
| Day 5 (Oct 21) | player idle/walk/swing + torch; lurker full set + eyes; 3 veins (full/mining); 3 mineral items; plant idle; Beacon unlit/lit; entrance; `ui_slot`; title key art | P0 |
| Day 6–8 (Oct 22–24) | stalker set; zones 2–4 floors + walls; player roll/hurt/death; resin-large; Beacon charging; boulder; crater; `ui_depth`, `ui_exit-arrow`, `ui_keycap`; inner corners zone 1 | P1 |
| Day 9–10 (Oct 25–26) | devourer set (if not cut); inner corners zones 2–4; logo; 2 Help illustrations | P1 |
| Day 10–11 (Oct 26–27) | props, chamber decor, dust, favicon | P2 |
| **Day 11 (Oct 27)** | **ALL in-game assets frozen** | — |
| Day 12–13 (Oct 28–29) | itch cover, screenshots (captured from the frozen build) | P1/P2 |

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-ui]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]

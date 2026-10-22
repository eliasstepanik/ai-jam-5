---
type: architecture
title: Last Ember – Sprite Catalog 2 (Terrain Tiles and Special Tiles)
description: Sprite catalog part 2 for Last Ember – floor variants and 16-mask wall auto-tile plus inner-corner overlays per zone 1–4, mask bit order and composition workflow, entrance light shaft, Beacon states, mineral vein overlays, side-room decor, falling rocks, crater and dust (glow sprites, depleted veins, small rocks and cracks dropped by R-138), each with size, frames, pivot, look, prompt, priority and placeholder.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Sprite Catalog 2: Terrain and Special Tiles

Entry format, priorities and placeholder conventions: [[architecture-assets-sprites]] Section 1. Palette and master prompt `{MASTER}`: [[architecture-assets-style]] Sections 4 and 6. Continues in [[architecture-assets-sprites-3]]. Atlas/loader: [[architecture-assets-pipeline]]. Gameplay: [[last-ember-design]] (Cave and zones, Beacon).

## 1. Tile grid decisions

- Tile = **32 × 32 art px = 32 world units** (style Section 2). Tiles are opaque, no outline, pivot top-left (0,0), drawn at integer positions, no rotation, no smoothing.
- **Wall faces.** Fixed-south view ([[ADR-123-2-5d-view]], R-178): a wall cell draws its cap (32×32, on the tile cell) plus a 48 px south-facing wall face drawn into the south cell. Faces exist only toward the south (bit S open); there are no E/W/N faces. The pure top-down "no wall faces" rule is superseded. The floor texture is a 24 px repeating pattern (see 2.3).
- Unexplored / outside the map is pure `#000000` (no tile drawn).
- The tileset is one externally produced, zone-agnostic sheet (94 frames, [[ai-jam-5-asset-formats-25d]]). The per-zone ids `tile_z<zone>_floor`, `tile_z<zone>_wall`, `tile_z<zone>_inner` and the per-zone palettes below remain the placeholder/loose-frame spec only. Zone mood comes from the darkness and memory tints (style Section 5) plus a per-zone multiply tint applied when a chunk is painted. DEFAULT (OD-D1): zone 1 none, zone 2 `#b8c4d6` at 25 %, zone 3 `#b4d0b0` at 25 %, zone 4 `#c4b0d8` at 25 %.
- Zone boundaries: the engine uses the same tileset everywhere and changes only the tint by the cell's zone; no transition tiles (the dark lighting hides the seam). Ponytail decision: transition tiles skipped; add only if a playtester notices a seam.

## 2. Auto-tile decision: 16-tile cardinal mask + 4 inner-corner overlays

**Decision: 16-tile 4-neighbour bitmask for walls, plus 4 small inner-corner overlay tiles. Not the 47-tile blob set.**

- The 47-set exists to draw clean inner corners. With 4 overlay tiles the 16-set gets the same result for 20 images instead of 47 per zone (80 vs 188 images for 4 zones).
- Cellular-automata caves are organic; heavy darkness means the player sees at most ~6 tiles of wall edge at once. Subtle corner errors are invisible.
- Composition is mechanical (Section 2.2), so the artist only paints 3 base textures per zone and the 20 tiles are assembled.

### 2.1 Mask bit order (implementer and artist must match)

For a WALL cell, check the 4 orthogonal neighbours. Bit set = neighbour is **floor** (open), i.e. this side of the wall shows an edge rim.

| Bit | Value | Side |
|---|---|---|
| N | 1 | up (y−1) |
| E | 2 | right (x+1) |
| S | 4 | down (y+1) |
| W | 8 | left (x−1) |

Frame index = mask (0–15). `tile_z2_wall` frame 0 = interior rock (no floor neighbour). Frame 15 = isolated pillar (floor on all 4 sides). Out-of-map neighbours count as wall.

**Inner corners:** for a wall cell whose two orthogonal neighbours on a corner are wall but the diagonal between them is floor, the engine draws `tile_z<n>_inner` frame k over the wall tile: k=0 NE, 1 SE, 2 SW, 3 NW. Several can stack.

### 2.2 Composition workflow (removed)

The former mechanical composition workflow (one rock-top texture plus one edge strip, assembled into 16 mask frames, Prompts W and R) is removed by [[ADR-123-2-5d-view]]: the cap and face frames ship in the externally produced tileset ([[ai-jam-5-asset-formats-25d]]). Prompts W and R in 2.4 apply only to replacement or placeholder frames.

### 2.3 Floor variants

Atlas floor: `floor_0` … `floor_9`, **10 frames of 24×24 px**, a repeating pattern on a 24 px grid. For floor coordinates `(fx, fy) = (floor(x / 24), floor(y / 24))` the variant is `floor(hash2(fx, fy, seed) * 10)` (R-179). All ten tile seamlessly with each other. The per-zone rows below describe the placeholder/loose-frame look.

Placeholder/loose frames: `tile_z<n>_floor` | 32×32 | 4 frames (variants 0–3) | (0,0) | — | **P0** (zone 1), P1 (zones 2–4). Variant use: `hash(x,y,seed) % 16` → 0–9 → variant 0 (plain), 10–12 → 1, 13–14 → 2, 15 → 3 (rare feature).

| Zone | Floor look (all in zone palette, style 4.2) |
|---|---|
| 1 | dry packed earth and flat limestone, `#3a332d` base, fine grit; v1 scattered pebbles `#544a40`; v2 a hairline crack; v3 an old ash smear `#2e2823` |
| 2 | smooth cold slate plates `#2d333b` with straight seams; v1 a wet sheen patch `#454e59` (only a lighter value, no highlight); v2 a narrow fissure; v3 a shallow puddle outline `#22272e` |
| 3 | damp dark soil `#29342c` with moss fringes `#2f4a2a`; v1 moss clumps `#46663a`; v2 thin root lines `#3b2a1e`; v3 a fern-like fossil print `#3f5044` |
| 4 | glassy violet-black basalt `#2b2234`, hexagonal column tops; v1 obsidian shards `#6a5a88`; v2 a deep crack; v3 a cooled lava swirl `#463a55` |

**Prompt F (per zone, v0):** `{MASTER}, seamless tileable cave floor texture in a fixed-south 3/4 view, 24x24 tile, <zone floor look>, flat, no lighting`. Variants: same seed, add the variant feature. Use img2img on v0 to keep edges compatible, then fix edges by hand (wrap-around offset by half the tile in the editor, repaint the cross seam).

**Placeholder:** fill the cell with the zone `floor` hex; variants 1–3 add one 2×2 dot in `floor-light` at (8,8), (20,14), (12,24) respectively.

### 2.4 Wall tiles

`tile_z<n>_wall` | 32×32 | 16 frames (mask 0–15) | (0,0) | blocks the whole cell | **P0** (zone 1), P1 (zones 2–4)

`tile_z<n>_inner` | 32×32 | 4 frames (NE, SE, SW, NW) | (0,0) | — | **P1** (P2 for zones 2–4 if late)

| Zone | Rock-top look |
|---|---|
| 1 | rounded brown limestone boulders packed together, `#2a2420`/`#1c1714`, soft lumpy top |
| 2 | layered blue-grey slate, flat stacked plates with sharp straight edges |
| 3 | rock overgrown with moss mats `#2f4a2a` and hanging root tangles `#3b2a1e` crossing the top |
| 4 | hexagonal basalt columns seen end-on, violet-black with thin glassy edges `#6a5a88` |

**Prompt W (wall cap):** `{MASTER}, seamless tileable texture of the flat top of a solid rock wall in a fixed-south 3/4 view, 32x32 tile, <zone rock-top look>, dark, flat, no lighting, no edges`.
**Prompt R (south wall face):** `{MASTER}, the south-facing vertical rock face of a cave wall in a fixed-south 3/4 front view, chipped broken rock, cap on top, 32x48, <zone rock-top look>`.

**Placeholder:** fill cell with zone `wall`; for every set bit draw a 4 px band of `wall-dark` along that side; inner overlay = 4×4 `wall-dark` square in the corner.

## 3. Special tiles

### 3.1 Entrance / exit `spec_entrance`

`spec_entrance` | 64×64 (2×2 tiles) | `idle:1@0` | (32,32) | trigger radius 24 (win zone in `escape`) | **P0**

**Looks:** the way out. Rough stone steps carved upward, seen in the fixed-south 3/4 view as 5 worn ledges stepping up toward the north (top) edge, each with a short south-facing riser, `#544a40` to `#3a332d`, a frayed rope `#8c8070` pegged beside them, a pale dust patch on the floor below. The steps are slightly lighter than zone 1 floor (they catch daylight). The **light shaft is procedural**: the engine draws a soft additive cone of `#cfe3ff` at 25 % alpha from the top of the steps plus slow-drifting dust motes, visible from far as a landmark.

**Prompt:** `{MASTER}, rough carved stone stairs leading up out of a cave in a fixed-south 3/4 front view, worn ledges with south-facing risers, a frayed rope pegged beside them, dusty floor, 64x64 sprite, warm brown stone`.

**Placeholder:** square 56×56 `#544a40` with 4 inner squares inset by 6/12/18/24 px alternating `#3a332d`/`#544a40`; additive circle r=48 `#cfe3ff` at 0.2 alpha.

### 3.2 Beacon `spec_beacon`

`spec_beacon` | 64×64 | `unlit:1@0`, `charging:4@8 loop`, `lit:6@10 loop` | (32,32) | 22 (solid) + interact radius 48 | **P0** (unlit, lit), P1 (charging)

`spec_beacon_glow` is **dropped** (R-138): every glow is procedural ([[architecture-render-3]] §1, Beacon fire row); no render pass draws a `*_glow` sprite. The "glow frames" mentioned below describe the procedural look, not art to deliver.

**Looks:** an ancient round brazier on a stepped stone plinth in the deepest chamber. Plinth: a ring of fitted stone blocks `#2a2a30`/`#4a4a55`, 56 px across, carved with a simple ring of notches. Bowl: a wide iron/bronze dish `#5a3a1e`/`#8a5a2a`, 32 px across, filled with dark old coals `#141114`. `unlit`: cold, coals grey. `charging` (the ~5 s hold, ASSUMPTION in spec): coals show growing ember cracks `#c2410c` from the centre outwards across 4 frames; glow frames add `#ff6a00` pixels in the cracks. `lit`: the bowl holds a big roaring fire core — `#fff4d6` centre, `#ffb347` ring, `#ff6a00` licks outside, frames animate the licks rotating clockwise; the plinth notches glow `#ffb347` in the glow frames. The big cave-wide light is procedural.

**Prompt:** `{MASTER}, an ancient round stone plinth with a wide bronze fire bowl full of cold black coals in a fixed-south 3/4 front view, carved ring of notches, 64x64 sprite`. Lit: same seed, `the bowl burning with a huge bright fire in a fixed-south 3/4 front view, white-hot center, orange flames`.

**Placeholder:** circle r=28 `#4a4a55`; circle r=16 `#5a3a1e`; inner circle r=12 `#141114` (unlit) / radial gradient `#fff4d6`→`#ff6a00` (lit, radius pulses 12±2 at 3 Hz). Charging: arc around r=30, width 3 `#ff8a1e`, sweep = hold progress × 360°.

### 3.3 Mineral veins `spec_vein-<mineral>`

Veins sit in WALL cells that touch floor. They are **overlays** drawn on top of any wall auto-tile frame, so one vein art works in all zones and all masks. In the 2.5D view ([[ADR-123-2-5d-view]], R-186) the production ores are **south-facing tileset frames** `wall_<copper|sodium|strontium>_NN` ([[ai-jam-5-asset-formats-25d]]): the engine draws such a frame in place of the wall frame when the ore sits on a wall cell whose south side is open. Resin ore frames in the tileset are unused (OD-D5). For the other facings (N, E, W) the loose overlays below stay the placeholder spec and keep the engine rotation in 90° steps so the crystals face the open floor side (the art faces DOWN = south).

`spec_vein-sodium`, `spec_vein-copper`, `spec_vein-strontium` | 32×32 | `full:1@0`, `mining:3@6 loop` | (16,16) | — (wall cell blocks) | **P0**

Dropped (R-138, no consumer): the `spec_vein-<mineral>_glow` ids (vein glints are procedural, [[architecture-render-3]] §1) and the `depleted` anim (mined veins leave State, so nothing draws them, [[architecture-render-2]] §3.1).

**Looks (shared):** a cluster of 4–6 angular crystals growing out of the lower half of the cell, toward the floor edge, with 1 px `#0a0809` outlines (overlay exception to the no-outline tile rule; crystals are objects). `mining`: frames show cracks spreading and two chips flying off (the engine also plays chip particles).

| Mineral | Crystals | Host rock | Glint |
|---|---|---|---|
| sodium | stubby pale yellow cubes (halite-like) `#c9a400`/`#ffe14a` | grey crust `#454e59` | `#ffffff` |
| copper | branching turquoise crystal needles `#0e7f74`/`#1fd6b8` | green malachite bands `#2f5a3a` | `#e8fff9` |
| strontium | long deep red prisms in a fan `#7a0a1a`/`#e0182d` | dark grey `#22272e` | `#ffd0d0` |

**Prompt:** `{MASTER}, a cluster of <crystals> growing out of dark rock toward the bottom, in a fixed-south 3/4 front view, crystals pointing down, <host rock>, transparent background, 32x32 sprite`.

**Placeholder:** 4 triangles (base 6, height 10) pointing south at x = 6, 12, 18, 24 along y = 22, filled with the mineral `Crystal light` hex, outline `#0a0809`; mining = triangles shake ±1 px.

### 3.4 Side-room / dark-chamber decor `spec_chamber`

`spec_chamber` | 32×32 | 3 frames `v` (variants) | (0,0) floor decal | — | **P2**

**Looks:** floor overlays (transparent) that mark side rooms where plants grow, so curious players learn "decor = maybe a plant": v0 a ring of small old stones around a blackened fire spot; v1 faded scratch tally marks on the floor `#141114`; v2 a collapsed bedroll and a broken lantern `#3b2a1e`/`#5a4030`. Low contrast, readable only near the flame.

**Prompt:** `{MASTER}, <variant>, on transparent background, flat floor decal in a fixed-south 3/4 view, 32x32 floor decal`.

**Placeholder:** none drawn (decor is skipped until art exists).

### 3.5 Falling rocks, crater, dust (`escape` phase)

`spec_boulder` | 32×32 | `v:3 variants` | (16,16) | 15 (blocks its cell after landing) | **P1**

`spec_crater` | 48×48 | `idle:1@0` | (24,24) floor decal | — | **P1**

`fx_dust` | 32×32 | `puff:5@15 once` | (16,16) | — | **P2**

Dropped (R-138, no State or producer): `spec_rock-small` (debris) and `spec_crack` (spreading cracks); re-add only together with an entity that draws them.

**Looks:** boulder = a rough rounded chunk of the zone-neutral rock `#454e59`/`#2d333b` (one neutral set for all zones; it fell from above, so its colour may differ), lumpy outline, 26–30 px across. Crater = a shallow dished ring of shattered floor with radial cracks, `#141114` lines, transparent outside. Dust puff = 5 frames of a pale `#8c8070` cloud expanding from a disc to a ragged ring and fading (binary alpha, dithered checkerboard in later frames). The falling **telegraph shadow circle** (~1 s before impact) and the falling motion (boulder drawn scaled 1.8→1.0 with alpha 0.4→1) are procedural.

**Prompt:** `{MASTER}, a single rough grey cave boulder in a fixed-south 3/4 front view, lumpy outline, 32x32 sprite`; `{MASTER}, a shallow impact crater in a stone floor with radial cracks, flat floor decal in a fixed-south 3/4 view, transparent outside, 48x48`; dust: hand-pixel the 5 frames (AI is weak at small FX).

**Placeholder:** boulder = circle r=13 `#454e59`, outline `#0a0809`; crater = ring r=18 width 3 `#141114`; dust = circle r grows 4→14, alpha 0.6→0, `#8c8070`; telegraph shadow = filled circle `#000000` at alpha 0.2→0.6 with r growing 6→16 over the warning time.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-rulings-3]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]

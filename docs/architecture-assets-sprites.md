---
type: architecture
title: Last Ember – Sprite Catalog 1 (Conventions, Player, Monsters)
description: Sprite catalog part 1 for Last Ember – entry format, facing/rotation policy, pivot and collision conventions, then full entries (size, frames, fps, pivot, radius, visual description, generation prompt, priority, placeholder) for the player and the three shades lurker, stalker, devourer including eyes-only sprites.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Sprite Catalog 1: Conventions, Player, Monsters

Hub: [[architecture]]. Style rules, palette and the master prompt: [[architecture-assets-style]] (read it first). Continues in [[architecture-assets-sprites-2]] (tiles, special tiles) and [[architecture-assets-sprites-3]] (pickups, props, UI, key art, totals, production order). Loading and atlas format: [[architecture-assets-pipeline]]. Sounds tied to these animations: [[architecture-assets-audio]]. Gameplay source: [[last-ember-design]].

## 1. How to read an entry

Every asset has one block:

- **Data row:** `SpriteId` | canvas px (w×h) | animations as `name:frames@fps loop/once` | pivot (x,y from top-left, in art px) | collision radius (world units) | priority.
- **Looks:** visual description with hex codes from [[architecture-assets-style]] Section 4.
- **Prompt:** asset part. Always prepend the master style prompt (style Section 6) and use the negative prompt. `{MASTER}` marks where it goes.
- **Placeholder:** exact procedural drawing the engine uses until art for that `SpriteId` exists. Coordinates are relative to the pivot, in world units, before rotation; angle 0 = facing +x (right).

Priorities: **P0** = needed for the vertical slice (Day 4 descent test, Day 5 core sprites). **P1** = full game (Day 6 loop through Day 11 freeze). **P2** = polish/stretch, first to cut.

Frame file names follow style Section 10: `<SpriteId>_<anim>_<nn>.png`, for example `mon_lurker_lunge-ne_02.png`.

## 2. Facing / rotation policy (decision)

**Actor facing (user decisions, 2026-10-18; R-154 and R-155): player and all three monsters use eight separately authored directions for every animation.** All monster body and eye frames are 64×64. Facing changes select a different directional animation; the engine never rotates or mirrors actor sprite art.

**Superseded in part by [[ADR-123-2-5d-view]] (R-184):** the directions now come from the externally produced character atlas, in the atlas order `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`; per-frame timing comes from `duration_ms`; all characters draw at scale 1.0 with pivot (32,32). The nearest-45° selection and tie rules below still apply, but map the selected direction to the atlas direction name. The `<SpriteId>_<action>-<direction>_<nn>.png` file keys describe the placeholder/loose-frame path only; atlas frames are keyed as in [[architecture-assets-style]] Section 10.

- Player direction order (legacy loose-frame order) is clockwise in canvas coordinates: `e`, `se`, `s`, `sw`, `w`, `nw`, `n`, `ne`. Select the nearest 45° direction to the aim angle in descent and movement angle in escape; retain facing when stationary. Exact halfway ties select the next clockwise direction. Do not rotate or mirror authored player frames.
- Monster direction order is also `e`, `se`, `s`, `sw`, `w`, `nw`, `n`, `ne`. Select the nearest 45° direction to the monster facing angle, with exact halfway ties going clockwise. Body and eyes use the same direction; draw both with angle 0 and `imageSmoothingEnabled = false`.
- Player and monster death hold the direction selected on their first frame. Changing direction during other actions switches the direction suffix while retaining the action timer and frame index.
- The torch stick is included in the player's torch-set frames; no separate torch sprite or stick draw is used. Flame, glow, sparks and the swing trail remain procedural.

## 3. Shared conventions for actors

- Canvas: square, pivot at the exact centre pixel `(w/2, h/2)` = the collision centre = rotation centre.
- Body occupies about 60–70 % of the canvas; the rest is room for lunge stretch and death particles.
- Player and monster frames face their named direction (Section 2). The right-facing descriptions below are the east reference pose; author all eight views separately.
- Emissive parts (eyes) are NOT in body frames. They are separate `eyes` frames on the same canvas size and pivot, so the engine can draw them additively above the darkness mask (spec: outside the light a shade is only glowing eyes).
- Flames are never in sprites. The player torch stick is baked into the torch-set frames; its flame, glow, sparks, light mask, Beacon light and pickup glow are procedural ([[last-ember-production-plan]] Art pipeline).

## 4. Player

### 4.1 Player body sets

The player is the `player` character of the externally produced character atlas (v1, see [[ai-jam-5-asset-formats-25d]] and [[ADR-123-2-5d-view]]): **64×64** frames, pivot **(32,32)**, eight directions, per-frame `duration_ms`. The former `player_body` / `player_body-torch` loose-frame sets are replaced. The three torch states map to atlas animation names:

| Torch state | Meaning | Atlas animation family |
|---|---|---|
| lit | descent, flame burning | `*_lit_torch_base` |
| unlit | descent, flame out | `*_unlit_torch` |
| none | escape (no torch) | `*_no_torch` / `*_without_torch` |

Atlas player animation sets: `death_with_unlit_torch`, `death_without_torch`, `dodge_roll_no_torch`, `hurt_lit_torch_base`, `hurt_no_torch`, `hurt_unlit_torch`, `idle_lit_torch_base`, `idle_no_torch`, `idle_unlit_torch`, `material_change_lit_torch_base`, `pickup_lit_torch_base`, `run_lit_torch_base`, `run_without_torch`, `swing_lit_torch_base`, `walk_lit_torch_base`. There is no walk or run with an unlit torch: DEFAULT (OD-D3) shows `idle_unlit_torch` while moving. Roll uses `dodge_roll_no_torch` in every torch state; DEFAULT (OD-D2) the torch is visually dropped during the roll.

| Action | Frames per direction | Playback (atlas) | Notes |
|---|---|---|---|
| `idle` | 4 | 4 fps, loop | P0 |
| `walk` | 4 | 6 fps, loop | P0 |
| `run` | 4 | 10 fps, loop | escape and sprint |
| `swing` | 4 | 6 fps, once | P0 |
| `roll` | 8 | 10 fps, once | `dodge_roll_no_torch` |
| `hurt` | 2 | 8 fps, once | |
| `death` | 6 | 6 fps, hold last | |
| `pickup` | 18 | 6 fps, once | new, atlas only |
| `material_change` | 9 | 6 fps, once | new, atlas only |

Playback values are the rates measured from the atlas `duration_ms`; the engine always uses the per-frame `duration_ms`, and clamps the gameplay duration of an action (for example swing 0.2 s) by holding or cutting the last frame, never by stretching art.

**Keys:** the atlas keys frames by animation id `<character>_<animation>` (for example `player_idle_lit_torch_base`), direction and frame index; see [[architecture-assets-style]] Section 10. The old file-name keys `player_body-torch_walk-ne_03.png` apply only to loose placeholder frames.

**World-size default:** all characters draw at scale **1.0** (64×64 world units, pivot (32,32)); collision radius **10** and the camera/gameplay scale are unchanged (R-184). Do not enlarge collision or tiles. Depth sorting uses the foot position `pos.y + footOffset` (player 24, R-180).

**Looks:** a small hooded cave-walker, with dark brown hood, worn leather shoulders, backpack and rope, no visible face. Keep the silhouette, palette and aligned centre consistent across all directions and all torch states. Lit and unlit torch frames contain the wooden stick and charred head, without baked flame or glow. No-torch frames contain no stick. `swing` lasts 0.2 s; `roll` 0.25 s (gameplay durations; the atlas frames are held or cut to fit); `hurt` recoils then returns; `death` slumps and holds its last frame.

**Torch-tip anchor:** the torch tip is the `flame_center_anchor` of the current atlas frame, a source-pixel `[x, y]` measured from the top-left of its 64×64 frame. The renderer uses `(anchor - [32,32]) * 1.0 + player position` for procedural flame/glow; no extra body rotation. When art falls back, use the anchor belonging to the resolved fallback frame. Animations without a torch (`*_no_torch`, `*_without_torch`, `dodge_roll_no_torch`) have no anchor.

**Prompt:** prepend the master style prompt (fixed-south 3/4 front view), then specify a hooded explorer, 64×64 final canvas, the named direction, action and either a held wooden torch stick without flame or empty hands. Use a consistent reference across all torch states and all eight directions. Prompts serve placeholder or replacement frames; the shipped player art is the atlas.

**Placeholder:** retain the existing radius-9 body, hood and facing line in world units, oriented to the selected eight-way direction. The torch-set placeholder includes a stick; no-torch does not. Draw this procedural geometry at world scale 1 so it is not halved again. Roll compresses to 0.8; hurt flashes red; death flattens to an ellipse. Placeholders allow gameplay to progress while the art is incomplete.

### 4.2 Removed separate torch sprite

`player_torch` is removed from the catalog and manifest. Its stick is part of the torch animations of the `player` atlas character; flame and trails remain engine effects. Do not ship a loose torch frame or draw a second stick over the player.

## 5. Monsters (shades)

Shared look: shades are living shadow — semi-solid ink with ragged wispy edges, body `#0d0b12`/`#1b1726`, wisps `#2c2540`. They have no visible mouth except the Devourer. They are drawn fully only inside the light; outside, only the `eyes` frames show (spec Monsters).

**Directional delivery (R-184, replaces R-155 draw scales):** the three shades are the `lurker`, `stalker` and `devourer` characters of the externally produced character atlas ([[ai-jam-5-asset-formats-25d]], [[ADR-123-2-5d-view]]): **64×64** frames, pivot **(32,32)**, eight directions in the atlas order `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`, per-frame `duration_ms`. The engine never rotates or mirrors them. The action keys and file examples below (`idle-e`, `lunge-ne`, `mon_lurker_lunge-ne_02.png`) describe the placeholder/loose-frame path; the frame counts and fps in the data rows below are the original art targets, whereas the atlas supplies the real counts and `duration_ms`.

**World-size default:** all three draw at scale **1.0** (64×64 world units). Collision radii are unchanged: lurker 9, stalker 14, devourer 30. Foot offsets for depth sorting (`pos.y + footOffset`, R-180): lurker 25, stalker 30, devourer 24. The visual dimensions, eye offsets and procedural placeholder geometry below stay world-unit references for the east pose. Procedural placeholders draw in world units at scale 1 and select geometry for the named direction.

**Animation mapping (atlas):** `ring` and `stalk` use `walk_forward`; `recover` and `stunned` use `idle`; `windup` uses `idle` for lurker and stalker and attack frames 0–1 for the devourer; `lunge` uses `sprint` (lurker), `leap` (stalker) or attack frames 2–3 (devourer); `dying` uses `death`; `hurt` uses `hit` (stalker), `hurt` (devourer) or `idle` (lurker).

Shared eyes rules (all three): the atlas bakes the eyes into the enemy palette (`#C85AF0`). DEFAULT (OD-D7): the separate `mon_*_eyes` ids stay as placeholders, drawn only outside the light (pass 16), until the atlas provides eye-only frames. The eye rules below apply to those placeholder `eyes` frames. `eyes` frames contain ONLY the eye pixels on a transparent canvas the size of the body canvas. Animations: `idle:1@0` (dim, core `#cbb8ff`, halo `#6b4fb8`), `telegraph:1@0` (bright, core `#ffffff`, halo `#b48cff`, 1 px bigger), `blink:3@12 once` (open, half, closed). The engine adds an additive radial glow under each eye (procedural). The eyes switch to `telegraph` exactly when the lunge telegraph starts (spec: about 0.4 s before the lunge) and stay until the lunge ends. Death: eyes fade out over the first 3 death frames (engine alpha).

### 5.1 `mon_lurker` (small, zone 1+)

`mon_lurker` | 64×64 | `idle:4@8 loop` (orbit uses idle), `telegraph:2@6 once (hold last)`, `lunge:3@16 once`, `death:6@12 once` | (32,32) | 9 | **P0**

`mon_lurker_eyes` | 64×64 | `idle`, `telegraph`, `blink` (shared rules) | (32,32) | — | **P0**

**Looks:** a fist-sized drop of ink, round front, tapering into 3–4 thin trailing tendrils toward the left (in the east reference pose; it always seems to flow forward). Body ellipse about 16×14 px. Two eyes close together near the front (+5,±2), each 2×2 px. `idle`: tendrils sway (each frame moves tendril tips 1 px). `telegraph`: body compresses to about 12×16 (wider, flatter, crouched), tendrils pull in. `lunge`: body stretches to about 24×10 toward +x, tendrils stream straight back. `death`: the body splits into 4–6 ink droplets that drift outward and shrink to single pixels; final frame empty. Mood: nervous, quick, a nuisance.

**Prompt:** `{MASTER}, a small shadow creature in a fixed-south 3/4 front view, a drop of black-violet ink with a round front and three thin wispy tendrils trailing to the left, two tiny pale violet eyes near the right front, living shadow, 64x64 sprite, named facing direction, consistent reference for all eight authored directions`. Lunge: `same creature stretched long and thin dashing in the named facing direction`. Death: `same creature bursting into small ink droplets`.

**Placeholder:** circle r=8 `#1b1726`, outline `#2c2540`. Eyes: two circles r=1.5 at (5,−2),(5,2) `#cbb8ff` (telegraph: `#ffffff`, r=2). `telegraph`: scale x 0.8, y 1.15. `lunge`: scale x 1.5, y 0.7. `death`: alpha fades 1→0 over 0.5 s while scale grows 1→1.4.

### 5.2 `mon_stalker` (medium, zone 2+)

`mon_stalker` | 64×64 | `idle:4@8 loop`, `telegraph:2@6 once (hold last)`, `lunge:3@16 once`, `death:6@12 once` | (32,32) | 14 | **P1**

`mon_stalker_eyes` | 64×64 | shared rules | (32,32) | — | **P1**

**Looks:** long, low and angular — a mantis-like shadow in a fixed-south 3/4 front view. Narrow elongated body 30×12 px along the x axis, a wedge-shaped head at the front, and **four long jointed limbs** (two pairs) splayed to the sides like a water strider, limbs 1–2 px thick `#2c2540`. Three eyes in a tight triangle on the head (+11,0),(+9,±2), each 2×2. The silhouette must read as "spiky X", never as a blob (the Lurker is the blob). `idle`: limbs shift in a slow gait, each frame moves one limb pair 1–2 px. `telegraph`: body lowers and limbs fold back (silhouette shrinks to a tight arrow). `lunge`: arrow shape, limbs fully swept back, body stretched to 38 px. `death`: limbs snap off and drift, body unravels into wisps. Mood: patient, predatory, circles behind you.

**Prompt:** `{MASTER}, a medium shadow predator in a fixed-south 3/4 front view, long narrow black-violet body pointing right with a wedge-shaped head, four long thin jointed legs splayed out like a water strider, three small pale violet eyes in a triangle on the head, living shadow, wispy edges, 64x64 sprite, named facing direction, consistent reference for all eight authored directions`.

**Placeholder:** ellipse rx=14 ry=5 `#1b1726`, outline `#2c2540`; 4 lines width 1.5 `#2c2540` from (±4,0) to (±10,±14) in an X; eyes: 3 circles r=1.5 at (11,0),(9,−2),(9,2). Telegraph/lunge/death scaling as Lurker.

### 5.3 `mon_devourer` (large, zones 3–4)

`mon_devourer` | 64×64 | `idle:4@6 loop`, `telegraph_a:2@6 once (hold last)` (beat 1), `telegraph_b:2@8 once (hold last)` (beat 2), `lunge:3@12 once`, `death:8@10 once` | (32,32) | 30 | **P1** (first cut per [[last-ember-production-plan]])

`mon_devourer_eyes` | 64×64 | shared rules, plus the eyes show only 2 of 4 eyes open in `idle` and all 4 in `telegraph` | (32,32) | — | **P1**

**Looks:** a huge round mass of shadow, body circle about 64 world units across (the placeholder reference; atlas frames at scale 1.0 fill the 64×64 frame), with a heavy fringe of thick wisps all round that make the edge "boil". At the front (+x) a wide crescent maw, closed in `idle` as a dark seam `#3a0f2a`. Four eyes in a horizontal arc behind the maw (+14,±6) and (+10,±14), each 3×3. `telegraph_a` (beat 1): the body swells 6 % and the maw opens halfway, showing `#3a0f2a` inside with jagged shadow teeth `#2c2540`. `telegraph_b` (beat 2): maw fully open (a half-moon gap 20 px wide), fringe wisps pulled forward. `lunge`: body stretched forward 20 %, maw wide. `death`: the mass collapses inward, the maw closes, the fringe peels off in big flakes, last two frames a dissolving puddle. Mood: slow, inevitable, hungry — the light itself shrinks near it (engine effect).

**Prompt:** `{MASTER}, a huge round shadow beast in a fixed-south 3/4 front view, boiling black-violet mass with thick wispy fringe all around, a wide crescent-shaped mouth on the right side, four small pale violet eyes in an arc behind the mouth, living shadow, 64x64 sprite, named facing direction, consistent reference for all eight authored directions`. Beat frames: `same beast with mouth half open`, `same beast with mouth wide open showing dark red inside and shadowy teeth`.

**Placeholder:** circle r=28 `#0d0b12`, ring stroke width 3 `#2c2540`; maw arc from −40° to +40° at r=20, width 3 `#3a0f2a` (telegraph_a width 6, telegraph_b width 10); eyes 4 circles r=2.5. Death: scale 1→0.6 and alpha 1→0 over 0.8 s.

## 6. Monster animation timing contract

These timings are art-side defaults so frames line up with the gameplay telegraph. The gameplay values stay tunable ([[last-ember-design]] Parry, OPEN window); the engine stretches the held last frame, never the art. The 2.5D pivot ([[ADR-123-2-5d-view]]) leaves the gameplay timings unchanged (telegraph 0.4 s, lunge 0.19 s); atlas frame timing comes from `duration_ms` and is clamped to the gameplay duration by holding or cutting the last frame. The frame counts in the table are the placeholder/loose-frame targets.

| Monster | Telegraph total | Frames before hold | Lunge duration | Eye state |
|---|---|---|---|---|
| lurker | 0.4 s | 2 frames @6 = 0.33 s, then hold | 3 @16 = 0.19 s | telegraph from telegraph start to lunge end |
| stalker | 0.4 s | same as lurker | same | same |
| devourer | beat A 0.4 s + beat B 0.4 s | A 2@6 hold, B 2@8 hold | 3 @12 = 0.25 s | 2 eyes in A, 4 eyes in B |

Sounds tied to these frames: eye-open on telegraph start, lunge on lunge frame 0, death on death frame 0 ([[architecture-assets-audio]]).

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]

---
type: architecture
title: Last Ember – Sprite Catalog 1 (Conventions, Player, Monsters)
description: Sprite catalog part 1 for Last Ember – entry format, facing/rotation policy, pivot and collision conventions, then full entries (size, frames, fps, pivot, radius, visual description, generation prompt, priority, placeholder) for the player and the three shades lurker, stalker, devourer including eyes-only sprites.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T20:10:00Z
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

Frame file names follow style Section 10: `<SpriteId>_<anim>_<nn>.png`, for example `mon_lurker_lunge_02.png`.

## 2. Facing / rotation policy (decision)

**Decision: ONE right-facing top-down sprite per frame; the engine rotates it to the facing angle.** No 4- or 8-direction sheets.

- Rationale: top-down flat view has no "front/back" problem that 3/4 views have; a rotated top-down body is correct geometry. 8-direction sheets would multiply the actor frame count by 8 (about 50 frames → 400) and break the Day 5 delivery.
- Pixel-art rotation shimmer: the engine **quantises the drawn angle to 16 steps (22.5°)** and draws with `imageSmoothingEnabled = false`. At 2× zoom this reads as clean, chunky pixel rotation. If shimmer bothers playtesters, the upgrade path is to pre-rotate the 16 angles in the packer (offline, no runtime cost) — not planned.
- What rotates: player body (to mouse aim in `descent`, to movement direction in `escape`), monsters (to movement direction; during telegraph and lunge, to the player), the torch stick (swing arc).
- What never rotates: eyes-only sprites are drawn rotated with the body (they are on the same canvas), tiles, pickups, props, UI.
- **Death animations do not rotate after they start** (freeze the angle at the first death frame).

## 3. Shared conventions for actors

- Canvas: square, pivot at the exact centre pixel `(w/2, h/2)` = the collision centre = rotation centre.
- Body occupies about 60–70 % of the canvas; the rest is room for lunge stretch and death particles.
- Head/front points to the right edge (+x).
- Emissive parts (eyes) are NOT in body frames. They are separate `eyes` frames on the same canvas size and pivot, so the engine can draw them additively above the darkness mask (spec: outside the light a shade is only glowing eyes).
- Flames are never in sprites. The torch flame, glow, sparks, light mask, Beacon light and pickup glow are procedural ([[last-ember-production-plan]] Art pipeline).

## 4. Player

### 4.1 `player_body`

`player_body` | 32×32 | `idle:4@4 loop`, `walk:6@10 loop`, `swing:4@20 once`, `roll:4@16 once`, `hurt:2@12 once`, `death:6@8 once (hold last)` | (16,16) | 10 | **P0** (idle, walk, swing), P1 (roll, hurt, death)

- `walk` is reused for escape sprint at playback ×1.6 fps (16 fps). No separate sprint frames.
- `swing` = 0.2 s, matches the parry swing; the engine sweeps the torch stick separately (4.2).
- `roll` = 0.25 s: body tucks into a ball and spins; the engine also moves the body.
- Torch-held pose: in `descent` all body frames are drawn with the right hand extended forward-right, empty, at the **hand anchor (+9,+6)** from pivot (forward = +x, right side of body = +y). The engine draws `player_torch` there. In `escape` there is no torch; the same frames are used with the hand empty (reads as a running arm).

**Looks:** a small hooded cave-walker seen from above. Round dark hood `#2a2420` with a slightly lighter crown `#3a332d`, worn leather shoulders `#3b2a1e`/`#5a4030`, a short pack on the back (left side of the canvas) `#3b2a1e` with a rope coil `#8c8070`. Shoulders are wider than the hood; the silhouette is a rounded "T": hood in the middle, two shoulder lumps, right arm reaching forward-right. Feet show only in `walk` as two small `#1c1714` ovals alternating in front of/behind the shoulders. No face visible (top-down hood). Mood: fragile, small, determined. `hurt`: frame 0 body shifted 1 px back with hood squashed; frame 1 normal. The engine also flashes it white for 2 frames. `death`: body slumps forward, shoulders flatten, frames 3–5 the figure lies as an elongated dark shape with the pack beside it. `roll`: frame 0 crouched, 1–2 a tight ball rotated 90°/180° (the pack shows as a lump circling), 3 unfolding.

**Prompt (key pose, idle_00):** `{MASTER}, a small hooded explorer seen exactly from above, round brown hood in the center, worn leather shoulders, small backpack with coiled rope on the left side, right arm reaching forward to the right holding nothing, no face visible, 32x32 sprite, dark brown and leather tones`. Other frames: same seed, img2img strength ≤ 0.35, prompt adds `walking, feet visible`, `crouched rolling ball`, `collapsed lying on the ground` per animation.

**Placeholder:** circle r=9 `#5a4030` with 1 px outline `#0a0809`; inner circle r=5 `#2a2420` (hood); line from (0,0) to (12,0) width 2 `#e8dcc8` showing facing. `roll`: same circle scaled to 0.8. `hurt`: fill `#ff3b2a` for the 2 frames. `death`: ellipse rx=11 ry=6 `#2a2420`.

### 4.2 `player_torch`

`player_torch` | 16×8 | `idle:1@0` | (2,4) (the grip end) | — | **P0**

**Looks:** a wooden torch stick pointing +x, 14 px long, `#5a4030` with a darker grip wrap `#3b2a1e` at the left, a charred head 4 px wide at the right end `#141114` with 2 ember pixels `#c2410c`. The flame is drawn by the engine at the stick tip (+12,0 from the torch pivot).

**Swing arc:** the engine rotates the stick from −60° to +60° around the aim angle over the 0.2 s `swing`. The arc trail is procedural (additive arc in the current flame mantle colour).

**Prompt:** `{MASTER}, a single wooden torch stick lying horizontally pointing right, leather grip on the left, charred black head on the right, no flame, 16x8 sprite`.

**Placeholder:** rectangle 12×2 `#5a4030` from (0,−1); rectangle 3×4 `#141114` at the tip.

## 5. Monsters (shades)

Shared look: shades are living shadow — semi-solid ink with ragged wispy edges, body `#0d0b12`/`#1b1726`, wisps `#2c2540`. They have no visible mouth except the Devourer. They are drawn fully only inside the light; outside, only the `eyes` frames show (spec Monsters).

Shared eyes rules (all three): `eyes` frames contain ONLY the eye pixels on a transparent canvas the size of the body canvas. Animations: `idle:1@0` (dim, core `#cbb8ff`, halo `#6b4fb8`), `telegraph:1@0` (bright, core `#ffffff`, halo `#b48cff`, 1 px bigger), `blink:3@12 once` (open, half, closed). The engine adds an additive radial glow under each eye (procedural). The eyes switch to `telegraph` exactly when the lunge telegraph starts (spec: about 0.4 s before the lunge) and stay until the lunge ends. Death: eyes fade out over the first 3 death frames (engine alpha).

### 5.1 `mon_lurker` (small, zone 1+)

`mon_lurker` | 32×32 | `idle:4@8 loop` (orbit uses idle), `telegraph:2@6 once (hold last)`, `lunge:3@16 once`, `death:6@12 once` | (16,16) | 9 | **P0**

`mon_lurker_eyes` | 32×32 | `idle`, `telegraph`, `blink` (shared rules) | (16,16) | — | **P0**

**Looks:** a fist-sized drop of ink, round front, tapering into 3–4 thin trailing tendrils toward the left (it always seems to flow forward). Body ellipse about 16×14 px. Two eyes close together near the front (+5,±2), each 2×2 px. `idle`: tendrils sway (each frame moves tendril tips 1 px). `telegraph`: body compresses to about 12×16 (wider, flatter, crouched), tendrils pull in. `lunge`: body stretches to about 24×10 toward +x, tendrils stream straight back. `death`: the body splits into 4–6 ink droplets that drift outward and shrink to single pixels; final frame empty. Mood: nervous, quick, a nuisance.

**Prompt:** `{MASTER}, a small shadow creature seen from above, a drop of black-violet ink with a round front and three thin wispy tendrils trailing to the left, two tiny pale violet eyes near the right front, living shadow, 32x32 sprite`. Lunge: `same creature stretched long and thin dashing to the right`. Death: `same creature bursting into small ink droplets`.

**Placeholder:** circle r=8 `#1b1726`, outline `#2c2540`. Eyes: two circles r=1.5 at (5,−2),(5,2) `#cbb8ff` (telegraph: `#ffffff`, r=2). `telegraph`: scale x 0.8, y 1.15. `lunge`: scale x 1.5, y 0.7. `death`: alpha fades 1→0 over 0.5 s while scale grows 1→1.4.

### 5.2 `mon_stalker` (medium, zone 2+)

`mon_stalker` | 48×48 | `idle:4@8 loop`, `telegraph:2@6 once (hold last)`, `lunge:3@16 once`, `death:6@12 once` | (24,24) | 14 | **P1**

`mon_stalker_eyes` | 48×48 | shared rules | (24,24) | — | **P1**

**Looks:** long, low and angular — a mantis-like shadow seen from above. Narrow elongated body 30×12 px along the x axis, a wedge-shaped head at the front, and **four long jointed limbs** (two pairs) splayed to the sides like a water strider, limbs 1–2 px thick `#2c2540`. Three eyes in a tight triangle on the head (+11,0),(+9,±2), each 2×2. The silhouette must read as "spiky X", never as a blob (the Lurker is the blob). `idle`: limbs shift in a slow gait, each frame moves one limb pair 1–2 px. `telegraph`: body lowers and limbs fold back (silhouette shrinks to a tight arrow). `lunge`: arrow shape, limbs fully swept back, body stretched to 38 px. `death`: limbs snap off and drift, body unravels into wisps. Mood: patient, predatory, circles behind you.

**Prompt:** `{MASTER}, a medium shadow predator seen from above, long narrow black-violet body pointing right with a wedge-shaped head, four long thin jointed legs splayed out like a water strider, three small pale violet eyes in a triangle on the head, living shadow, wispy edges, 48x48 sprite`.

**Placeholder:** ellipse rx=14 ry=5 `#1b1726`, outline `#2c2540`; 4 lines width 1.5 `#2c2540` from (±4,0) to (±10,±14) in an X; eyes: 3 circles r=1.5 at (11,0),(9,−2),(9,2). Telegraph/lunge/death scaling as Lurker.

### 5.3 `mon_devourer` (large, zones 3–4)

`mon_devourer` | 96×96 | `idle:4@6 loop`, `telegraph_a:2@6 once (hold last)` (beat 1), `telegraph_b:2@8 once (hold last)` (beat 2), `lunge:3@12 once`, `death:8@10 once` | (48,48) | 30 | **P1** (first cut per [[last-ember-production-plan]])

`mon_devourer_eyes` | 96×96 | shared rules, plus the eyes show only 2 of 4 eyes open in `idle` and all 4 in `telegraph` | (48,48) | — | **P1**

**Looks:** a huge round mass of shadow, body circle about 64 px across, with a heavy fringe of thick wisps all round that make the edge "boil". At the front (+x) a wide crescent maw, closed in `idle` as a dark seam `#3a0f2a`. Four eyes in a horizontal arc behind the maw (+14,±6) and (+10,±14), each 3×3. `telegraph_a` (beat 1): the body swells 6 % and the maw opens halfway, showing `#3a0f2a` inside with jagged shadow teeth `#2c2540`. `telegraph_b` (beat 2): maw fully open (a half-moon gap 20 px wide), fringe wisps pulled forward. `lunge`: body stretched forward 20 %, maw wide. `death`: the mass collapses inward, the maw closes, the fringe peels off in big flakes, last two frames a dissolving puddle. Mood: slow, inevitable, hungry — the light itself shrinks near it (engine effect).

**Prompt:** `{MASTER}, a huge round shadow beast seen from above, boiling black-violet mass with thick wispy fringe all around, a wide crescent-shaped mouth on the right side, four small pale violet eyes in an arc behind the mouth, living shadow, 96x96 sprite`. Beat frames: `same beast with mouth half open`, `same beast with mouth wide open showing dark red inside and shadowy teeth`.

**Placeholder:** circle r=28 `#0d0b12`, ring stroke width 3 `#2c2540`; maw arc from −40° to +40° at r=20, width 3 `#3a0f2a` (telegraph_a width 6, telegraph_b width 10); eyes 4 circles r=2.5. Death: scale 1→0.6 and alpha 1→0 over 0.8 s.

## 6. Monster animation timing contract

These timings are art-side defaults so frames line up with the gameplay telegraph. The gameplay values stay tunable ([[last-ember-design]] Parry, OPEN window); the engine stretches the held last frame, never the art.

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

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

**Player update (user decision, 2026-10-18; R-154): eight authored directions, with separate torch and no-torch animation sets.** Monster facing remains one right-facing sprite rotated by the engine.

- Player direction order is clockwise in canvas coordinates: `e`, `se`, `s`, `sw`, `w`, `nw`, `n`, `ne`. Select the nearest 45° direction to the aim angle in descent and movement angle in escape; retain facing when stationary. Exact halfway ties select the next clockwise direction. Do not rotate or mirror authored player frames.
- Monsters keep the existing 16-step (22.5°) quantised rotation, with `imageSmoothingEnabled = false`.
- Player death holds the direction selected on its first frame. Monster death freezes its rotation on its first frame.
- The torch stick is included in the player's torch-set frames; no separate torch sprite or stick draw is used. Flame, glow, sparks and the swing trail remain procedural.

## 3. Shared conventions for actors

- Canvas: square, pivot at the exact centre pixel `(w/2, h/2)` = the collision centre = rotation centre.
- Body occupies about 60–70 % of the canvas; the rest is room for lunge stretch and death particles.
- Monsters face right (+x). Player frames face their named direction (Section 2).
- Emissive parts (eyes) are NOT in body frames. They are separate `eyes` frames on the same canvas size and pivot, so the engine can draw them additively above the darkness mask (spec: outside the light a shade is only glowing eyes).
- Flames are never in sprites. The player torch stick is baked into the torch-set frames; its flame, glow, sparks, light mask, Beacon light and pickup glow are procedural ([[last-ember-production-plan]] Art pipeline).

## 4. Player

### 4.1 Player body sets

Two `SpriteId`s, both **64×64**, pivot **(32,32)**:

- `player_body`: without torch (escape).
- `player_body-torch`: with the torch stick included in every frame (descent, including when the flame is out).

Each action below exists for **all eight directions in each set**. Other than walk, frame counts and playback rates are unchanged.

| Action | Frames per direction per set | Playback | Priority |
|---|---|---|---|
| `idle` | 4 | 4 fps, loop | P0 |
| `walk` | **4** | 10 fps, loop | P0 |
| `swing` | 4 | 20 fps, once | P0 |
| `roll` | 4 | 16 fps, once | P1 |
| `hurt` | 2 | 12 fps, once | P1 |
| `death` | 6 | 8 fps, once, hold last | P1 |

That is **24 frames × 8 directions × 2 sets = 384 player frames**. This is the full catalog target, not a claim that all art has been delivered. No separate sprint frames: escape reuses `walk` at 16 fps. No pickup or mining action is added by this update.

**Keys:** `<SpriteId>_<action>-<direction>_<nn>.png`, e.g. `player_body-torch_walk-ne_03.png` or `player_body_idle-s_00.png`. Animation keys are `walk-ne`, `idle-s`, etc. This retains the pipeline's three underscore-separated fields. Manifest entries enumerate all 48 action/direction combinations per set.

**World-size default:** 64×64 is the source canvas size. Draw player art at scale **0.5** (32×32 world units), preserving collision radius **10** and the existing camera/gameplay scale; pivot becomes (16,16) world units. Do not enlarge collision or tiles. Monsters retain their catalog sizes and scale 1.

**Looks:** a small hooded cave-walker, with dark brown hood, worn leather shoulders, backpack and rope, no visible face. Keep the silhouette, palette and aligned centre consistent across all directions and both sets. Torch-set frames contain the wooden stick and charred head, without baked flame or glow. No-torch frames contain no stick. `swing` lasts 0.2 s; `roll` 0.25 s; `hurt` recoils then returns; `death` slumps and holds its last frame.

**Torch-tip anchor:** the torch-set animation manifest supplies one source-pixel `[x, y]` tip position per frame, measured from the top-left of its 64×64 canvas (array length equals the action frame count). The renderer uses `(tip - [32,32]) * 0.5 + player position` for procedural flame/glow; no extra body rotation. When art falls back, use the anchor belonging to the resolved fallback frame. No-torch animations have no torch-tip anchors.

**Prompt:** prepend the master style prompt, then specify a hooded explorer, 64×64 final canvas, the named direction, action and either a held wooden torch stick without flame or empty hands. Use a consistent reference across both sets and all eight directions.

**Placeholder:** retain the existing radius-9 body, hood and facing line in world units, oriented to the selected eight-way direction. The torch-set placeholder includes a stick; no-torch does not. Draw this procedural geometry at world scale 1 so it is not halved again. Roll compresses to 0.8; hurt flashes red; death flattens to an ellipse. Placeholders allow gameplay to progress while the art is incomplete.

### 4.2 Removed separate torch sprite

`player_torch` is removed from the catalog and manifest. Its stick is part of `player_body-torch`; flame and trails remain engine effects. Do not ship a loose torch frame or draw a second stick over the player.

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

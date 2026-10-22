---
type: reference
title: Last Ember – Gameplay Design Spec
description: Self-contained gameplay design spec of the chosen ai-jam-5 jam concept Last Ember – run structure, flame and health model, parry, monsters, minerals and flame-colour rules, pickups, cave, rendering notes, controls, HUD, help, end screen and local score.
tags: [project, ai-jam-5, game-design, last-ember, spec]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Gameplay Design Spec

Chosen jam concept (2026-10-17). Hub: [[index]]. Schedule: [[last-ember-production-plan]]. All unconfirmed points: [[last-ember-open-questions]].

> **Status:** author-approved answers from the Q&A of 2026-10-17. Points marked **ASSUMPTION** or **OPEN** are not decided. **The architecture exists** (hub [[architecture]]); this file defines gameplay only, not code structure.

## Pitch

Last Ember is a single-run game. It descends from the team's original Torch-Roguelite concept (design lead saile2204). That concept has been removed from the KB, and the owner confirmed on 2026-10-17 that it is removable. This file is self-contained.

- Your flame is fuel, health and sight in one object.
- The shrinking light radius is the UI-free gauge.
- Descend a seeded cave, light the Beacon at the deepest point, then escape alive.
- **No hub, no crafting UI, no shop, no codex, no hardcore mode.** The only persistence is the personal best in `localStorage`.
- A run takes about 6–8 minutes (fits the 5–10 minute voter session, see [[jam-brief]]).
- Theme: TORCH.
- Reason for the cut: the original design (hub, crafting UI, shop, savegame, six torches, codex, hardcore mode, procedural dungeon) was roughly 3x the effort of the alternative [[alt-blowtorch-defense]] and too big for 14 days. Voters play 5–10 minutes, so meta progression would rarely be seen.

## Run structure

### Phase 1: Descent

- 2D gameplay on a square tile grid, drawn in a fixed-south 3/4 front view (2.5D look): wall tops plus a 48 px wall face hanging into the cell below. The camera follows the player; no tilt, no rotation. See [[ADR-123-2-5d-view]].
- One seeded cave with **4 depth zones** by distance from the entrance. A zone sets monster size, mineral rarity and ambient colour.
- Generation: cellular automata. Keep only the largest connected region. Carve 2–3 tunnels so loops exist. **No shortcuts:** no gates, ladders or lifts that open a faster way back. The way out stays the full way in every run. This is what gives "deeper or out?" weight.
- Memory layer: explored tiles stay faintly visible (grey-blue). Monsters in remembered tiles are hidden. The player knows the way but not the current dangers.
- The player stays minimally visible even when the flame is tiny.

### Beacon

- Located at the deepest point.
- Lighting it lights up the **whole cave**. The torch is then no longer needed.
- The cave shakes. Falling rocks hit the floor: a shadow circle telegraphs each impact about 1 s before it lands. Rocks may block paths.
- **Hard requirement:** the generator MUST guarantee at least one clear route from the player to the exit at all times. Rocks never soft-lock the run.
- **ASSUMPTION (not confirmed by the user):** lighting the Beacon is a hold interaction of about 5 s that costs flame energy.
- **ASSUMPTION:** a wake-up horn sound plays when the Beacon is lit.

### Phase 2: Escape

- The player always moves at sprint speed, with **no stamina cost**. Sprint speed is about 2x the phase-1 walk speed.
- No torch and no parry in this phase.
- Defensive verb: a short **ROLL**. It dodges lunges. It has a cooldown so spamming is punished (tunable, start about 1.5 s).
- Shades keep lunging constantly.
- All paths are visible on the lit cave. A **directional marker** shows the exit.
- The original descent path is not always available because of rocks.
- Reaching the entrance = **win**. Death = run over.
- Fallback if the full loop is flat at the Day 6 playtest: win at the Beacon and drop this phase ([[last-ember-production-plan]]).

### Death and restart

- Restart instantly on a new seed with one press. Show depth reached and the other end-screen values.
- The seed is part of the URL (`?seed=123`) so runs can be shared. The end screen shows the seed.
- By default every run uses a new random seed.

## Flame and health model

Two pools.

| Pool | Size | Role |
|---|---|---|
| Flame energy | one number | sets light radius (shrinking radius is the UI-free gauge); acts as the SHIELD |
| HP | 5 pips | each hit while the flame is out costs 1 pip, regardless of monster type |

- Flame energy burns down over time. Mining and lighting the Beacon cost energy.
- **Hit rule:** while the flame is lit, a shade hit removes flame energy instead of HP. While the flame is out (energy 0), a hit costs 1 HP pip.
- A shade that attacks you dies at the flame but takes some light with it. The energy loss scales with monster size (Lurker < Stalker < Devourer). **Only the torch damage scales; HP damage is always 1 pip.**
- **Flame out:** the player takes HP damage when attacked and cannot parry (parry needs a lit flame).
- A **resin** pickup relights the flame INSTANTLY and refuels it. Resin is the panic button.
- A lit flame is consumed. There are no persisted torch stubs and no "one safe torch for the way back" exploit.
- **Healing:** a PLANT found in the cave heals 1 HP on pickup. It cannot be stored. Plants are rare and placed in side rooms and dark chambers.
- **Light economy risk:** the safety margin (how much light is left for the way back, rule of thumb 50 %) is the heart of the game. Burn rate, burn curve and resin frequency can only be felt in a running build, so tune them live with hot reload ([[vite-canvas-hmr-state-preservation]]). Mining means standing still, which costs light. Keep that.

## Parry (phase 1 only)

- Click swings the torch in a short arc toward the mouse. Swing cooldown about 0.5 s (tunable) so spamming is punished.
- If a lunging shade is hit during its telegraphed lunge window, it is parried and dies.
- **Timing accuracy sets flame loss.** The earlier or later the parry versus the perfect moment, the more flame energy is lost.
- A **PERFECT parry** costs zero flame loss, plays a satisfying sound and a short flare visual.
- **OPEN:** exact size of the perfect window and the loss curve (tunable at playtest).
- Telegraph: the eyes glow about 0.4 s (start value) before the lunge.
- A successful parry prevents the torch from burning out faster from that attack.

## Monsters

Three sizes by depth, with different behaviours. "Shades" is the general name.

**General behaviour:** most shades stay away from the light and mostly try to avoid it. They surround the player at a distance based on the current light area, a ring that closes in as the flame shrinks. Only some shades lunge. Outside the light a shade is only glowing eyes; inside the light it is drawn fully.

| Monster | Size and zone | Behaviour |
|---|---|---|
| Lurker | small, zone 1+ | orbits at the light edge, occasional quick lunge |
| Stalker | medium, zone 2+ | circles behind the player; lunges when the player faces away, so the player must turn and parry |
| Devourer | large, zone 3–4 | slow, 2-beat telegraph, big energy cost, pushes the light radius back while near |

- The Devourer is the **first thing cut** if time runs short ([[last-ember-production-plan]]).
- Monsters react to flame colour, not only to bright versus dark (see Minerals). Specific colour reactions are deferred until the palette and effects are final and may change after playtesting.

## Minerals

The greed item.

- **Inventory:** 3 types (Sodium, Copper, Strontium), up to 3 pieces each.
- **Mining:** a vein takes about 2 s of standing still (costs light and time).
- **Rarity:** rarer in deeper zones. **ASSUMPTION:** direction of rarity. The user said "greed item" and that zones set rarity; deeper = more valuable and rarer is the default.
- **Toss** a mineral into the flame to change its colour and effect. The effect lasts UNTIL the player tosses another mineral or SHAKES IT OFF (a button returns to the plain orange flame, as at run start).
- If a mineral type runs out, that effect cannot be used until more is found.
- **ASSUMPTION / OPEN:** each toss consumes one piece; swapping back to a type costs another piece.
- **ASSUMPTION / OPEN:** whether an effect survives the flame going out and being relit by resin is not decided. Default: the effect is kept.

| Mineral | Flame colour | Effect |
|---|---|---|
| Sodium | yellow-white | bigger radius, burns faster, LURES MORE monsters |
| Copper | turquoise | same radius as plain; parries more forgiving (bigger perfect-parry window, lower flame loss on a bad parry) |
| Strontium | deep red | small radius and least visibility (hard navigation); FEWER monsters are attracted |

### Flame-colour rules

Based on the real flame test (sodium yellow, copper blue-green, strontium red). Possible later additions: barium green, potassium violet.

- Effects are **percentages**, not absolute values, so they scale with the base flame and need no per-mineral balancing.
- The flame always has a **pale, almost white core plus a coloured mantle**, so the colour is readable in the dark.
- At most **5–6 clearly distinguishable tones** (readability in the dark). Last Ember ships plain orange plus three minerals.
- Effects may change after playtesting.

## Pickups

- **Resin:** relights the flame instantly and refuels it.
- **Plant:** heals 1 HP on pickup, cannot be stored, rare, side rooms and dark chambers.
- **Mineral veins:** see Minerals.

## Cave and zones

- One seeded cave per run; the seed is in the URL.
- 4 depth zones by distance from the entrance. Zone sets monster size (Lurker zone 1+, Stalker zone 2+, Devourer zone 3–4), mineral rarity and ambient colour.
- Loops from carved tunnels; no shortcuts (see Phase 1).
- Side rooms and dark chambers hold plants.
- **OPEN:** the definition of "depth" (zone index versus path distance) is left to the architecture task; it feeds the score.

## Rendering notes

Technique guidance for the later architecture task (not a code structure).

- **Perspective:** 2D grid, fixed-south 3/4 view. Light stays a radial gradient in world space and costs almost nothing; wall faces are lit by the same radial mask and are drawn above actors standing north of them (y-sort by foot position). No cast shadows. 360° threat is what makes darkness dangerous.
- **Rejected perspectives:** side-scroller (light wasted, frustrating jumps), first person (3D effort), isometric (occlusion makes light masking expensive), pure top-down (replaced 2026-10-22 by owner decision, see [[ADR-123-2-5d-view]] and R-178..R-186 in [[architecture-rulings-3]]).
- **Light mask:** radial gradient. Colour is driven by only three parameters: `tint`, `radiusMul`, `flickerFreq`.
- **Flame:** two layers, a near-white core and a coloured mantle. Blend additively with a glow instead of a plain tint. Sparks use the complementary colour of the flame.
- **Monster AI:** compare the flame type as a string-literal union (for example `'plain' | 'sodium' | 'copper' | 'strontium'`), not a boolean and not a TS `enum`. The repo uses `erasableSyntaxOnly`, so `enum` is forbidden (scaffold background: [[vite-canvas-hmr-state-preservation]]).
- **Wall shadows:** raycast occlusion is a **stretch goal**, not part of the core build.

## Controls and HUD

Desktop only, keyboard plus mouse.

- WASD move. The mouse aims. Click = swing/parry.
- Roll key (default Space).
- Mineral select (number keys 1–3 or Q/E) and toss.
- A key to shake off the effect.
- Interact/hold for mining and the Beacon.
- Exact bindings are a build detail.

**HUD (minimal):**

- Light radius is the energy gauge.
- 5 HP pips.
- Mineral hotbar of 3 icons with counts.
- Depth number.
- Exit direction marker after the Beacon.
- No other menus beyond the title/menu screen.

## Help screen

A Help button on the menu screen explains the goal, parrying and the mineral effects. There is no in-game tutorial overlay.

## End screen and score

- Shows: depth, time, minerals used, score, personal best (`localStorage`) and the shareable seed (`?seed=`).
- One press restarts on a new seed.
- Win and death are both scored.
- There is no online leaderboard and no player name entry. Everything is local to the browser.

**Score formula (approved):**

```
score = depth*100 + (win ? 1000 : 0) + max(0, 600 - seconds) + minerals_used*25 + hp_left*50
```

`depth` = the deepest zone/distance metric, to be defined in the architecture task (OPEN).

## Related

- [[index]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[alt-blowtorch-defense]]
- [[jam-brief]]
- [[vite-canvas-hmr-state-preservation]]
- [[ADR-123-2-5d-view]]

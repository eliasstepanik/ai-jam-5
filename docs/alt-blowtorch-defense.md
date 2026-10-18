---
type: note
title: Alternative concept – Blowtorch Defense (not chosen)
description: Alternative ai-jam-5 concept considered – top-down tower defense in darkness with a blowtorch as build, repair and light tool; review notes, fallback plan, and earlier brainstorm ideas.
tags: [project, ai-jam-5, game-design, torch-roguelite, alternative-concept, tower-defense]
timestamp: 2026-10-17T12:00:00Z
---

# Alternative concept – Blowtorch Defense

**Status: NOT chosen.** Superseded by Last Ember ([[last-ember-design]]), the chosen jam concept. Kept as a fallback. Hub: [[index]].

## Concept

Top-down tower defense in darkness. The player defends a generator.

- The blowtorch builds defenses and repairs them by tracing weld seams. Faster and more accurate tracing restores more HP.
- Monsters come from all sides. Their glowing eyes are visible in the dark.
- The player maintains torches for visibility.
- Scrap drops from kills.
- Fuel is refilled only at a station.
- **Hook:** balancing repairs, fuel and light.
- **Risk: medium.** Keep building options (wall, turret, torch post) and enemy types (crawler, brute, spitter) limited.

### Design defaults floated

- Turrets only shoot enemies inside light.
- No pathfinding.
- Building = welding.
- Procedural visuals + WebAudio.

## Review notes

**Strong:**

- One verb for three jobs (build, repair, light).
- Free visuals (procedural).
- Readable.
- Hot-reload friendly.

**Risks and mitigations:**

- Three systems compete for attention.
- Mouse seam-tracing while under attack is fiddly → wide tolerance, 1–2 s seams, stand still while welding.
- A bad weld = weaker, not failing.
- Cut torch-post burn-down.
- 2–3 enemy types max.
- Endless waves with a score.
- Scrap trickle to avoid a death spiral.
- Teach welding in the first wave.

**Fallback:** a 2-day vertical slice.

## Earlier brainstorm ideas

- Last Light
- Pass the Torch
- Shadowcast
- Beacon Run
- Mob Hunt
- Controlled Burn
- Flame Keeper

(Only the titles were provided; no further details were recorded.)

## Related

- [[index]]
- [[last-ember-design]]
- [[jam-brief]]

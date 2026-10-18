---
type: note
title: Last Ember – Open Questions and Assumptions
description: Checklist of all ASSUMPTION and OPEN items, unresolved conflicts and a short decision log for the Last Ember concept, with current default and who decides.
tags: [project, ai-jam-5, last-ember, open-questions, assumptions, checklist]
timestamp: 2026-10-17T19:00:00Z
---

# Last Ember – Open Questions and Assumptions

Hub: [[index]]. Sources: [[last-ember-design]], [[last-ember-production-plan]]. Tick an item only after the decider has confirmed it.

## Checklist

| # | Done | Item | Current default | Decides |
|---|---|---|---|---|
| 1 | [ ] | Beacon interaction: hold about 5 s, energy cost, wake-up horn | ASSUMPTION: hold about 5 s, costs flame energy, horn plays | saile2204 |
| 2 | [ ] | Mineral consumption per toss, swap-back cost, effect persistence across a resin relight | ASSUMPTION: a toss consumes 1 piece; swapping back costs another piece; effect is kept after relight | saile2204 |
| 3 | [ ] | Mineral rarity direction by zone | ASSUMPTION: deeper = rarer / more valuable | saile2204 |
| 4 | [ ] | Tunables: perfect-parry window, loss curve, swing cooldown, telegraph length, roll cooldown, burn rates, ring distance | Start values: swing about 0.5 s, telegraph about 0.4 s, roll about 1.5 s; the rest OPEN | team, at playtest |
| 5 | [ ] | Audio production tooling | ASSUMPTION: AI music (Suno/Udio) plus AI or WebAudio SFX | team |
| 6 | [ ] | Collaborator invites (undertaker7431, kittingsl) | Collaborators with write access can run CI code; owner **accepted** this 2026-10-17. **Invites not yet sent**; sending needs the owner's explicit go at the time. | eliasstepanik (owner) |
| 7 | [ ] | Definition of `depth` for the score (zone index versus path distance) | OPEN; to be defined in architecture | architecture task |
| 8 | [ ] | Day numbering | Day 1 = Oct 17; Day 4 = **Oct 20** (an earlier chat message said "Day 4 (Oct 21)"; that was wrong) | resolved; confirm only |
| 9 | [ ] | Architecture, and `main.ts` changes (`Input` type for mouse position in world units, roll/toss keys) | Architecture written: [[architecture]] (hub), binding rulings in [[architecture-rulings]]. `main.ts` edits wait for owner approval OD-1 (see [[architecture]] section 6) | eliasstepanik (owner) for OD-1 |
| 10 | [ ] | Player name entry | ASSUMPTION: the name was only for the leaderboard, so name entry is dropped along with it | eliasstepanik (owner) |
| 11 | [ ] | E-1: "deeper or out?" does not survive the spec as written. The escape after the Beacon costs no flame and there is no exit during the descent, so turning back is never better ([[architecture-economy-check]]). | Open. Options: O1 retreat ending (changes the approved score formula and win rule); O2 Beacon hold needs >= 40 E and steeper burn per zone (within spec); O3 Beacon path-length band for seed fairness | owner / saile2204 |
| 12 | [ ] | E-2: a competent run takes about 2–3.5 minutes on a 160x120 map, not the 6–8 minutes in the spec ([[architecture-economy-check]]) | Open. Options: read 6–8 min as session length (several runs), or enlarge the map or slow the walk speed | owner / saile2204 |

## Unresolved conflicts

| Conflict | Detail | Proposed resolution | Decides |
|---|---|---|---|
| Source wording on the hit rule | The Q&A text first asked "no attack on the torch while HP pips are intact?" and then answered itself | Recorded as: flame lit = a hit costs flame energy; flame out = a hit costs 1 HP. See [[last-ember-design]]. Confirm. | saile2204 |
| Scope | Remaining scope is larger than the original pitch ([[last-ember-production-plan]], Risks) | Owner decision: build what we can and see how far we get; cut order is guidance | owner |

## Decision log

- **2026-10-17, scope:** owner decided "we will build what we can and see how far we get". Cut order (Devourer, then AI animation, then escape-phase simplification) is guidance, not a commitment. Day 4 (Oct 20) and Day 6 (Oct 22) stay as checkpoints.
- **2026-10-17, leaderboard dropped** by owner. Reason: scope. It also removes the AGENTS.md "no external runtime services" conflict, so AGENTS.md needs **no amendment**. The end screen is local only: depth, time, minerals used, score, personal best (`localStorage`) and a shareable seed.
- **2026-10-17, collaborators:** Collaborators with write access can run CI code; owner accepted this (2026-10-17); invites not yet sent.
- **2026-10-17, concept:** the original Torch-Roguelite concept was confirmed removable by the owner and was deleted from the KB. Last Ember is the jam build; the earlier "lead confirmation pending" item is closed. Its open decisions #7 (no hub/extraction meta layer) and #11 (a lit flame is consumed, no persisted stubs) are settled for Last Ember.

## Related

- [[index]]
- [[architecture]]
- [[architecture-economy-check]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[jam-brief]]

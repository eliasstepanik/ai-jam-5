---
type: reference
title: Last Ember – Production Plan
description: Schedule, checkpoints, cut-order guidance, art/audio pipeline, team workflow and risks for the chosen ai-jam-5 concept Last Ember.
tags: [project, ai-jam-5, last-ember, production, schedule, risks]
timestamp: 2026-10-17T19:00:00Z
---

# Last Ember – Production Plan

Hub: [[index]]. Gameplay: [[last-ember-design]]. Unconfirmed points: [[last-ember-open-questions]]. Jam facts: [[jam-brief]].

> Status: plan drafted 2026-10-17 from author-approved answers. **Scope decision (owner, 2026-10-17): "we will build what we can and see how far we get".** The schedule and cut order below are guidance, not a commitment. **The architecture exists** (hub [[architecture]], 57+ architecture files, binding rulings 1–3). Implementation may start once the owner approves OD-1 (main.ts host PR), OD-3 (index.html) and OD-7 (STEP_BUDGET_MS bailout); slice A first. Tasks: [[tasks]] and [[tasks-files]].

## Schedule

**Day 1 = 2026-10-17.** Submission closes 2026-10-31 03:00 UTC, so work effectively ends **Oct 30**. Treat Oct 30 as the real last day.

| Day | Date | Milestone |
|---|---|---|
| 2 | Oct 18 | Art STYLE GUIDE locked (one fixed style prompt + palette) |
| 4 | Oct 20 | INTERNAL descent-only test (checkpoint, see below) |
| 5 | Oct 21 | Core AI sprites delivered: player, 3 monsters, tiles, minerals, resin, plant, beacon, title image |
| 6 | Oct 22 | First FULL-loop team playtest (checkpoint: descent, Beacon, escape) |
| 11 | Oct 27 | ALL assets frozen |
| 12–14 | Oct 28–30 | Polish, balance, itch.io page, README AI-process notes, buffer |

Day 4 and Day 6 stay as checkpoints. Missing a milestone triggers the cut order, not a schedule slip.

### Day 4 checkpoint

The descent-only build must already be tense: cave, flame energy, Lurkers, resin and parry. If it is not, **fix the light economy BEFORE building the Beacon and escape**. Vertical-slice rule: if the slice is not tense by Day 4, adding content will not fix it. Tune it live with hot reload.

## Cut order if time runs short (guidance)

1. Devourer ([[last-ember-design]], Monsters).
2. AI animation (ship static AI sprites only).
3. Escape-phase simplification: **win at the Beacon** (drop or reduce the escape phase) if the full loop is flat on Day 6.

## Art and audio pipeline

- **Heavy AI art for everything.** One style guide plus palette.
- Generate: player, three monsters, tiles, minerals, resin, plant, Beacon, title image.
- Pack into 1–2 compressed sprite atlases, **target under about 2 MB total**, imported through Vite (hashed, relative paths).
- **Light, glow, fog and sparks stay procedural** (drawn by code) so lighting reacts to the flame.
- **Music/ambient:** AI-generated (Suno/Udio) is the intended direction. **ASSUMPTION:** the user said "heavily AI ... for everything"; the tooling is not confirmed.
- **SFX:** AI-generated or WebAudio-synthesised (not decided).
- **Who does what:** the TEAM generates the assets. The AI orchestrator integrates them: defines sizes, naming, atlas layout and loading.
- **Logging:** every tool and prompt goes into the README `AI process` section (AGENTS.md rule; jam rule in [[jam-brief]]). Credit all third-party tools and assets.
- Until assets arrive, code uses placeholders (coloured shapes) so it never blocks on art.

## Team workflow

- Team: saile2204 (design lead), undertaker7431, kittingsl. Repo owner: eliasstepanik.
- **Plan:** add undertaker7431 and kittingsl as repo collaborators. Work on feature branches and PRs.
- PRs from collaborators are same-repo PRs, so they run on the project CI runner. `master` stays protected (`ci` required).
- **Accepted risk (owner, 2026-10-17):** collaborators with write access can run CI code. The owner accepts this.
- **Invites not yet sent.** Collaborator invites are a state-changing GitHub action and need the owner's explicit go-ahead at that time.
- Work split by module: art, audio, level generation, gameplay.

## Risks

Scope is larger than the original Last Ember pitch:

- Two different game phases (parry descent versus roll-based escape).
- Three distinct monster behaviours.
- Route guarantee for falling rocks.
- Heavy dependency on team-made AI art.

**Mitigations:**

- Cut order above.
- Day 4 and Day 6 checkpoints.
- Placeholders (coloured shapes) until assets arrive.
- Hot reload allows live tuning of parry window, burn rate and ring distance ([[vite-canvas-hmr-state-preservation]]).
- No backend and no external runtime services, so the offline `dist/` rule in AGENTS.md holds without amendment.

## Related

- [[index]]
- [[last-ember-design]]
- [[last-ember-open-questions]]
- [[jam-brief]]
- [[vite-canvas-hmr-state-preservation]]

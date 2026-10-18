---
type: reference
title: AI Browser Game Jam 5 – Jam Brief
description: Facts and rules of itch.io AI Browser Game Jam 5 (host Focaccai) – theme TORCH, dates, submission rules, voting categories, and voter behaviour.
tags: [project, ai-jam-5, game-design, torch-roguelite, jam-rules, itch-io]
timestamp: 2026-10-17T12:00:00Z
---

# AI Browser Game Jam 5 – Jam Brief

Hub: [[index]].

## Facts

- **Host:** Focaccai (itch.io).
- **Theme:** "🔥TORCH🔥" – described as *a suggestion, not a hard requirement*. It is still a voting category (Theme).
- **Submissions:** 2026-10-17 03:00 UTC to 2026-10-31 03:00 UTC.
  - The page metadata also shows 2026-11-07. Unconfirmed; possibly the end of voting.
- **Platform:** web/HTML5 only, no download.
- **AI rule:** the majority of the game must be AI-generated.
- **Existing projects:** allowed if the majority of the content is new.
- **Multiple entries:** allowed if they are significantly different.
- **Assets:** credit third-party assets (source and licence).
- **Process sharing:** share the process. Log prompts and tools in the README `AI process` section.

## Voting categories

Overall, Fun, Graphics, Audio, Theme, AI Usage.

## Voter behaviour

A typical voter plays a game for 5–10 minutes. The first run must be satisfying on its own. Meta payoff (codex, multi-run progression) may never be seen. See [[last-ember-design]].

## Repo constraints (summary)

Browser only, small bundle, no external runtime services, offline build from `dist/`. Gameplay in `src/game.ts` with the hot-reload contract. Background: [[2026-10-13-ai-jam-5-repo-and-hmr-scaffold]], [[vite-canvas-hmr-state-preservation]].

## Related

- [[index]]
- [[last-ember-design]]
- [[alt-blowtorch-defense]]
- [[2026-10-13-ai-jam-5-repo-and-hmr-scaffold]]
- [[vite-canvas-hmr-state-preservation]]

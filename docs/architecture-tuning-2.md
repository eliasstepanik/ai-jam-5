---
type: architecture
title: Last Ember – Tuning Architecture (2/2) – Monsters, Director, Escape, Minerals, Camera, Live Tuning
description: Initial values of src/core/tuning.ts for Last Ember part 2 – per-kind monster tuning, devourer light push, director spawn rates and weights per zone, AI constants, escape phase, mineral effect table with tints, camera and shake, score constants, the hot-reload live-tuning workflow and the ranked top 8 feel knobs for the Day 4 tension test.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:00:00Z
---

# Last Ember – Tuning Architecture (2/2)

Part 2 of 2. Previous: [[architecture-tuning]] (shape of `T`, player, flame, resin, mining, Beacon, swing, parry, roll). Systems: [[architecture-systems]], [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]]. AI behaviour that consumes §1–§4: [[architecture-monsters-ai]], [[architecture-monsters-ai-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]].

All values **DEFAULT (architect)** unless marked **spec**.

## 1. `T.monsters` (per kind)

| Key | lurker | stalker | devourer | Unit | Meaning |
|---|---|---|---|---|---|
| `radiusPx` | 9 | 14 | 30 | px | collision radius ([[architecture-assets-sprites]] §5) |
| `hp` | 1 | 1 | 1 | int | a parry or a lit-flame hit kills ([[architecture-state-2]] §2) |
| `ringSpeedPxS` | 70 | 85 | 35 | px/s | max speed while holding/moving on the ring |
| `chaseSpeedPxS` | 95 | 130 | 45 | px/s | max speed when far from the ring (> 80 px off) |
| `steerPerS` | 6 | 5 | 2 | 1/s | velocity blend rate toward desired velocity |
| `ringFactor` | 1.00 | 1.10 | 0.85 | × R | ring radius = `R * ringFactor + ringMarginPx` |
| `ringMarginPx` | 14 | 20 | 30 | px | |
| `orbitRadS` | 0.35 | 0.60 | 0.15 | rad/s | angular drift of `ringAngle` |
| `driftAmpPx`, `driftHz` | 12, 0.25 | 10, 0.20 | 6, 0.10 | px, Hz | in/out breathing of the ring; must stay < `ringMarginPx` for lurker/stalker or the ring dips into the light and triggers flee |
| `lungeChancePerS` | `[.03,.04,.05,.06]` | `[0,.50,.60,.70]` | `[0,0,.25,.30]` | 1/s | hazard rate when eligible (stalker: only while behind) |
| `telegraphS` | 0.40 | 0.40 | 0.80 | s | **spec** 0.4 s; devourer = 2 beats × 0.4 s |
| `beats` | 1 | 1 | 2 | int | |
| `lungeRangePx` | 260 | 280 | 150 | px | centre distance at which a windup may start. Must exceed the largest ring (sodium, e = 100: lurker 221 + 14 + 12 = 247 px, stalker 243 + 20 + 10 = 273 px) so shades can attack at any energy |
| `contactS` | 0.20 | 0.24 | 0.30 | s | lunge time of the perfect moment = `PERFECT_AT[kind]` |
| `biteSlackPx` | 4 | 4 | 6 | px | contact tolerance added to the radii sum |
| `lungeOverrunS` | 0.25 | 0.30 | 0.30 | s | lunge continues this long past `contactS` if it missed |
| `recoverS` | 0.8 | 1.2 | 1.5 | s | back off to the ring after a miss |
| `lungeCdS` | `[3,5]` | `[2.5,4]` | `[4,6]` | s | uniform range, gameplay stream |
| `lungeCdStartS` | `[2,4]` | `[3,5]` | `[3,5]` | s | after spawn |
| `energyHitE` | 12 | 20 | 35 | E | flame energy taken by a hit while lit (**spec** scaling L < S < D) |
| `dyingS` | 0.5 | 0.5 | 0.8 | s | `dying` length (death animation) |
| `escapeStrikePx` | 140 | 160 | 130 | px | escape: windup starts within this distance |
| `escapeLeadS` | 0.15 | 0.20 | 0.10 | s | escape: aim at `player + v * lead` |
| `escapeLungeCdS` | `[0.8,1.6]` | `[1.0,1.8]` | `[2,3]` | s | escape: constant lunging (**spec**) |

Lunge speed is not a constant: it is derived so that contact happens at `contactS` for a standing player: `speed = max(30, d0 - rp - rm) / contactS`. Example lurker at d0 = 131 px: gap = 131 − 10 − 9 = 112 px, speed = 560 px/s (9.3 px/step). Devourer at 150 px: gap 110, speed 367 px/s.

## 2. `T.devourerLight`

| Key | Value | Unit |
|---|---|---|
| `pushMax` | 0.35 | fraction of radius removed at `nearPx` |
| `nearPx` | 80 | px centre distance for full push |
| `farPx` | 260 | px, no push beyond |

Formula and coupling: [[architecture-monsters-ai-2]] §1.

## 3. `T.director` (descent)

| Key | Zone 1 | Zone 2 | Zone 3 | Zone 4 | Unit |
|---|---|---|---|---|---|
| `maxAlive` | 3 | 5 | 6 | 7 | monsters |
| `spawnIntervalS` | 4.0 | 3.5 | 3.0 | 2.5 | s between spawn attempts |
| `weights.lurker` | 1.00 | 0.60 | 0.45 | 0.35 | relative |
| `weights.stalker` | 0 | 0.40 | 0.40 | 0.35 | relative (**spec** zone 2+) |
| `weights.devourer` | 0 | 0 | 0.15 | 0.30 | relative (**spec** zone 3–4) |
| `attackSlots` | 1 | 1 | 2 | 2 | max shades in `windup`+`lunge` at once |

| Key | Value | Unit | Notes |
|---|---|---|---|
| `monstersMax` | 24 | – | hard cap (`MONSTERS_MAX`, [[architecture-state-3]] §8) |
| `devourerMax` | 1 | – | at most one alive |
| `spawnGapPx` | `[60, 140]` | px | spawn at distance `R + gap` from the player, i.e. outside the light |
| `spawnTries` | 8 | – | random angles tried per attempt; all fail = skip, retry next interval |
| `despawnPx` | 560 | px | farther than this from the player = removed (off screen, > view half-diagonal ≈ 367 px at 16:9) |
| `flameOutSpawnMul` | 1.5 | × | spawn interval divided by this while the flame is out |
| `firstSpawnS` | 3 | s | `director.spawnT` at run start ([[architecture-state-2]] §6) |

Effective values: `interval = spawnIntervalS[z] / (attractMul * (out ? 1.5 : 1))`, `cap = clamp(round(maxAlive[z] * attractMul), 1, monstersMax)`. Example zone 2 with sodium: interval 3.5 / 1.6 = 2.19 s, cap round(5 × 1.6) = 8. Zone 2 with strontium: 7.0 s, cap round(2.5) = 3 (JS `Math.round(2.5) = 3`).

## 4. `T.ai`

| Key | Value | Unit | Meaning |
|---|---|---|---|
| `separationPx` | 8 | px | extra gap kept between two shades |
| `separationPxS` | 60 | px/s | push speed at full overlap |
| `stuckFrac` | 0.3 | – | moved < 30 % of intended distance = "blocked" step |
| `stuckNudgeS` | 0.5 | s | blocked time before a nudge |
| `stuckRelocateS` | 2.5 | s | blocked time before relocate/despawn |
| `fleeMul` | 1.4 | × | speed multiplier while fleeing out of the light |
| `eyeRangeExtraPx` | 220 | px | eyes visible up to `R + 220` (plus LOS) |
| `darkLungeMul` | 1.0 | – | `λ *= 1 + darkLungeMul * (1 - e/energyMax)` |
| `flameOutLungeMul` | 2.5 | × | `λ` multiplier while the flame is out |
| `stalkerBehindDeg` | 110 | deg | behind if angle off facing > 110° |
| `stalkerArcPx` | 0 | px | extra radius for the behind point (0 = use ring radius) |
| `bonkS` | 0.25 | s | a lunge that hits a wall ends; `stunned` for this long |

## 5. `T.escape`

| Key | Value | Unit | Notes |
|---|---|---|---|
| `sprintMul` | 2.0 | × walk | **spec** |
| `accelPxS2` | 1800 | px/s² | |
| `maxAlive` | 8 | – | no zone scaling; kinds still by current zone weights |
| `spawnIntervalS` | 1.2 | s | |
| `spawnGapPx` | `[220, 340]` | px | distance from the player (cave is lit, no "outside light") |
| `despawnPx` | 700 | px | |
| `rockWarnS` | 1.0 | s | **spec** shadow ~1 s before impact (`ROCK_WARN`) |
| `rocksMax` | 200 | – | `ROCKS_MAX` landed rocks; not reached at DMAX (152) ([[architecture-scale-and-economy-3]] §2.1) |
| `firstRockS` | 1.5 | s | `quakeT` set by `lightBeacon` (FINAL) |
| `firstSpawnS` | 1.0 | s | `director.spawnT` set by `lightBeacon`: the escape horde arrives after 1 s (R-147; was the literal `1.0` in [[architecture-systems-2]] §5) |
| `quakeShakePx` | 2 | px | constant low shake during escape (render) |
| `winRadiusTiles` | 1 | tiles | Chebyshev distance to `world.exit` ([[architecture-scoring-and-save]] §5) |

`maxAlive` 8 / `spawnIntervalS` 1.2 s are FINAL ([[architecture-scale-and-economy-3]] §2.1). `rockIntervalS` is **deleted** (rule R-056, [[architecture-rulings]]); the rock cadence is the `T.rocks` ramp `rate(e) = rateStart + (rateEnd − rateStart) × min(1, e / rampS)`, `quakeT = max(minIntervalS, randRange(0.75, 1.25) / rate(e))` ([[architecture-rocks]] §2):

| `T.rocks` key | Value | Unit | Status |
|---|---|---|---|
| `rateStart` / `rateEnd` | 0.6 / 1.6 | rocks/s | FINAL |
| `rampS` | 80 | s | FINAL; 104 s escape at D\* → 126 rocks |
| `minIntervalS` / `retryS` | 0.4 / 0.25 | s | DEFAULT |
| `pendingMax` | 4 | telegraphs | FINAL |
| `p2Start` / `p2End` | 0.15 / 0.40 | – | DEFAULT, chance of a 2×2 |

Selection and guarantee constants (`damageHp`, `lookahead`, `routeModeP`, `lateralTiles`, `exitClearTiles`, `beaconClearTiles`, `playerGapPx`, `detourMaxTiles`, `detourMaxFrac`, `bfsTestsMax`): [[architecture-rocks]] §1, §3, §4.

## 6. `T.minerals.table` (percent effects, **spec**: percentages)

| FlameKind | radiusMul | burnMul | attractMul | perfectMul | lossMul | flickerMul | core | mantle | deep | spark |
|---|---|---|---|---|---|---|---|---|---|---|
| `none` (plain) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.0 | `#fff4d6` | `#ff8a1e` | `#c2410c` | `#5ab0ff` |
| `sodium` | 1.30 | 1.50 | 1.60 | 1.00 | 1.00 | 1.2 | `#ffffff` | `#ffe14a` | `#f5b700` | `#6a5cff` |
| `copper` | 1.00 | 1.00 | 1.00 | 1.60 | 0.60 | 0.8 | `#e8fff9` | `#1fd6b8` | `#0e8f9c` | `#ff5c7a` |
| `strontium` | 0.70 | 1.00 | 0.50 | 1.00 | 1.00 | 0.9 | `#ffe0e0` | `#e0182d` | `#8a0a1e` | `#3dffb0` |

Colours are copied from [[architecture-assets-style]] §4 (flame table); render reads them from `T` so a palette tweak is a live edit. `attractMul` multiplies spawn rate, cap and lunge hazard ([[architecture-monsters-ai-2]] §3). Strontium `burnMul = 1.0`: the spec gives it no burn effect.

Examples at e = 50 (plain R = 131.9 px): sodium R = 171.5 px and burn zone 2 = 0.7 × 1.5 = 1.05 E/s (zone 4: 2.1 E/s); strontium R = 92.3 px; copper perfect window ±56 ms (= ±3 steps instead of ±2) and every imperfect loss × 0.6.

## 7. `T.cam`, `T.shake`, `T.score`

| Key | Value | Unit | Notes |
|---|---|---|---|
| `cam.lerpPerS` | 8 | 1/s | **from** [[architecture-state-2]] §6; `cam += (target - cam) * (1 - exp(-8 * dt))` = 12.5 % per step |
| `cam.shakeMaxPx` | 12 | px | clamp on combined shake |
| `cam.shakeDecayS` | 0.35 | s | normaliser for linear decay: offset amplitude = `shakeMag * min(1, shake / 0.35)` |
| `shake.flameHit` | 0.25 s, 5 px | | |
| `shake.hpHit` | 0.35 s, 8 px | | |
| `shake.rockLand` | 0.30 s, 6 px | | scaled by `max(0, 1 - d/400)` |
| `shake.parryPerfect` | 0.12 s, 3 px | | |
| `score.depthPts` | 100 | pts/depth | **spec** formula |
| `score.winPts` | 1000 | pts | **spec** |
| `score.timeCapS` | 600 | s | **spec** `max(0, 600 - seconds)` |
| `score.mineralPts` | 25 | pts/piece | **spec** |
| `score.hpPts` | 50 | pts/pip | **spec** |

`computeScore` ([[architecture-scoring-and-save]] §2) keeps its literal numbers; `src/checks/score.check.ts` asserts `T.score` equals them, so a tuning edit that breaks the approved formula fails `npm run check`.

## 8. Live-tuning workflow (hot reload)

1. `npm run dev`, start a run, play to the situation you want to tune (e.g. zone 2, flame 30 E, two lurkers in the ring).
2. Edit a number in `src/core/tuning.ts`, save. Vite re-evaluates `tuning.ts` and every importer up to `game.ts`; `main.ts` swaps the module and logs `[hmr] game.ts swapped, state kept` ([[architecture-host-changes]] §4). State (player position, energy, monsters, timers) is untouched; the next step uses the new value.
3. Values read every step take effect instantly: burn, radius curve, ring factor, speeds, λ, windows, attack slots. Values copied into State at a moment take effect at the next such moment: `lungeCdS` (next cooldown draw), `spawnIntervalS` (next `spawnT` refill), `telegraphS` (next windup). That is acceptable and needs no migration.
4. Never store a tuning value in State "for convenience" (it would freeze on swap). Read `T` at the point of use. Only exception: `player.energyMax` / `hpMax`, copied from `T` by `initPlayer()` once per run (R-146, [[architecture-state]] §8); a change applies from the next run.
5. Dev helpers (debug overlay, [[architecture-monsters-ai-2]] §9): `Shift+Digit1` reveal, `Shift+Digit2` god (no damage, no drain), `Shift+Digit3` overlay, `Shift+Digit4` freeze AI, `Shift+Digit5` paths, `Shift+Digit6` quality override. Never F-keys: `F5` reloads the page and F1/F3/F6 are browser shortcuts (R-132, R-133 in [[architecture-rulings-3]]). The toggles are gated by `import.meta.env.DEV` in `src/game.ts` only; layers L0–L3 never read `import.meta.env`. God mode is how you tune parry timing without dying.
6. When a value is settled after a playtest, note it in the PR body (old → new, why). There is no separate tuning log file.
7. Rule: tuning edits never require a `STATE_VERSION` bump. If one seems to, the value has leaked into State.

## 9. Top 8 feel knobs for the Day 4 tension test (ranked)

| # | Knob | Default | Try range | Symptom it fixes |
|---|---|---|---|---|
| 1 | `flame.burnPerS` | `[.5,.7,1.0,1.4]` | Z3 .80–1.20, Z4 1.10–1.80 E/s | "No tension, I never worry about light" → raise; "I die before reaching zone 2" → lower; beginner Z4 deaths → Z4 1.2 first |
| 2 | `resin.smallE` + resin quotas (generator) | 25 E (large 50) | 20–35 E | "Resin is everywhere, flame is always full" → lower; "Empty runs, no recovery" → raise |
| 3 | `flame.curveExp` | 0.5 | 0.35–1.0 | "The light shrinks too late, panic is sudden" → raise toward 0.7; "Feels gloomy all the time" → lower |
| 4 | `lurker.ringFactor` / `ringMarginPx` | 1.00 / 14 | 0.9–1.3 / 0–40 | "Eyes too far away, no pressure" → lower; "Shades sit in my light" → raise |
| 5 | `parry.perfectS` / `earlyMaxS` / `lateMaxS` | 35 / 140 / 90 ms | 18–70 (±1..±4 steps) / 100–200 / 60–130 ms | "Perfects are luck" → widen perfect; "Parry is free" → narrow max windows |
| 6 | `lurker.lungeChancePerS` + `attackSlots` | `[.03…]`, `[1,1,2,2]` | 0.03–0.2 / 1–3 | "Nothing happens" → raise; "Attacks feel spammy/unfair" → lower, keep slot 1 |
| 7 | `lurker.telegraphS` + `contactS` | 0.40 / 0.20 s | 0.3–0.6 / 0.15–0.3 s | "I can't react" → longer telegraph; "Too easy to read" → shorter contact |
| 8 | `mining.costPerS` + `mining.holdS` | 3 E/s, 2 s | 1–5 E/s, 1.5–3 s | "Mining is a no-brainer" → raise cost; "Never worth mining" → lower |

Order rationale: knobs 1–3 are the light economy the spec calls the heart of the game; Day 4 rule ([[last-ember-production-plan]]): fix these BEFORE building the Beacon. Knobs 4–7 are threat pressure; 8 is the greed decision. Target metrics for the Day 4 tension test (binding protocol, pass bands and 8-knob table: [[architecture-scale-and-economy-3]] §5): seed 42, scripted beeline run A and greedy run B; mid player reaches depth 20 with 30–60 E (computed 52 E), Z3→4 border 35–45 E, Beacon arrival 40–80 E with the Beacon cluster (without it mid ≈ 5–20 E and the 40 E gate blocks); the gate blocks in run B and a back-fill ≤ 60 tiles fixes it; flame-outs A 0–1, B ≥ 1; time per zone 60–95 s; Z1 one attack per 8–20 s. Where this table and part 3 §5.3 differ, part 3 wins.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-tuning]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-scoring-and-save]]
- [[architecture-assets-style]]
- [[architecture-host-changes]]
- [[last-ember-production-plan]]
- [[architecture-scale-and-economy-2]]
- [[architecture-scale-and-economy-3]]
- [[architecture-rocks]]
- [[architecture-rulings]]

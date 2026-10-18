---
type: note
title: Last Ember review – State type vs systems sketches and tuning (narrow)
description: Narrow read-only consistency review of projects/ai-jam-5 architecture-state 1-3 against architecture-systems-2/3/4 and architecture-tuning §1.1, checked against last-ember-design and architecture-rulings-2. Numbered findings table with quotes, recomputed worked numbers and exact edits. BLOCKERS 1.
tags: [ultrathink, reasoning, review, last-ember, ai-jam-5, state]
timestamp: 2026-10-17T22:30:00Z
---

# Last Ember review – State vs systems (narrow)

Scope: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]] vs [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]], [[architecture-tuning]] §1.1. Arbiter: [[last-ember-design]] > [[architecture-rulings-2]] > topical specs. Rulings-1/-3 hold no matches for `denied|minStartE|hitstop|contactT|Pickup.size|exploreKey|dodge`, so they are not cited.

## Findings

| id | sev | finding | quote A (file §) | quote B (file §) | exact edit |
|---|---|---|---|---|---|
| F1 | **blocker** | `denied` event kind: the binding rulings reject it, but the Beacon gate emits it, and the UI needs it to tell the Beacon toast apart from a failed toss | systems-2 §5 `if it.interactEdge: emit(s, 'denied', p.x, p.y)`; systems-4 §6 row `FxEventKind member 'denied'`; economy-2 §2 `emit denied (existing FxEventKind ...)` | rulings-2 R-082 `Union adds exactly: dodge, windup, lunge, uiMove, uiConfirm, uiBack, copyLink ... denied = toss a=-1`; rulings-2 §9 `Rejected: ... kinds telegraph/resin/denied (R-082)`; state-2 §7 union has no `denied` | Amend R-082. Add `'denied'` to the union, with the note "Beacon START GATE only, a = 0". A failed toss stays `toss a=-1`. Edit the rulings-2 §9 FxEventKind row to `+ dodge, windup, lunge, denied, uiMove, uiConfirm, uiBack, copyLink`. Delete `denied` from the "Rejected" line. Add `\| 'denied'` to the state-2 §7 `FxEventKind`. Change "existing" to "added by R-082" in economy-2 §2. Without this, the systems-2 §5 sketch does not compile under the binding union. |
| F2 | major | Float accumulation: `beaconHold += dt` needs 301 steps to reach 5.0 (measured: 4.99999 after 300). The check expects escape after 300 steps. | systems-2 §5 `if beaconHold >= T.beacon.holdS: lightBeacon(s)` | systems-4 §8 #7 `hold 300 steps → phase === 'escape' ... energy ≈ 13.1 (±0.1)` | Change to `if beaconHold + 1e-9 >= T.beacon.holdS`. This is the same epsilon as `resolveBites`. After the fix, energy = 40.1 − 300 × 5.4/60 = 13.10. |
| F3 | major | Same defect in mining: 120 × 1/60 < 2 (needs 121 steps) | systems-2 §4 `progress >= T.mining.holdS (2 s)` | systems-4 §8 #5 `hold KeyE at a vein for 120 steps → vein removed` | Change to `progress + 1e-9 >= T.mining.holdS`. |
| F4 | major | Ownership principle broken. Many systems write fields that state-3 assigns to a single owner. No ruling covers this except R-073 (monster ai only). | state-1 §2.5 `Each field is written by exactly one system`; state-3 §6 `player.energy ... src/systems/flame.ts`, `player.hp ... damagePlayer()`, `fx ... emit() and tickFx()`, `player.mining ... mining.ts`, `director.spawnT ... director.ts`, `director.quakeT ... quake.ts` | systems-2 §3 (pickups write `energy`, `hp`), §4 (mining writes `energy`), §5 (beacon writes `energy`, `mining`, `director.spawnT/quakeT`, `fx.beaconFlash/shake/shakeMag`); systems-3 §3 (parry writes `energy`, `fx.flare/hitstop`) | Reword state-1 §2.5 to "one PRIMARY owner; co-writers listed in state-3 §6". Rewrite these state-3 §6 rows: `player.energy` → flame.ts, pickups.ts, mining.ts, beacon.ts, combat.ts. `player.hp` → combat.ts `damagePlayer`, pickups.ts (plant). `fx` timers → fx.ts, combat.ts (`flare`, `hitstop`), beacon.ts (`beaconFlash`). `player.mining` → mining.ts, beacon.ts. `director.spawnT/quakeT` → director.ts/quake.ts, beacon.ts `lightBeacon`. |
| F5 | major | `Monster.beat`: the type and default conflict between state-2 and rulings-2. Rulings-2 itself defers the decision ("verify"). | state-2 §2 `beat: number // int, devourer telegraph beat 0..2 ...; 0 for others`, spawn default `beat = 0`; systems-4 §4 `windup a = beat index for devourer` | rulings-2 §9 `Monster.beat ... 1 \| 2  1 ... (verify against state-2 §2 in the AI PR)` | Rule now. Keep `beat: number`, default `0`, as the beat index during windup. Edit the rulings-2 §9 row to `Monster.beat` number `0` (state-2 §2). The number of beats per kind stays in `T.monsters[k].beats`. |
| F6 | major | `baseRadius` hardcodes literals, so the tuning keys are ignored. Changing `T.flame.curveExp`, `radiusMinPx` or `radiusMaxPx` live (a spec-mandated hot-tune knob) has no effect. | systems-2 §1 `baseRadius(e) = e <= 0 ? T.flame.radiusOutPx : 40 + 130 * (e / 100) ^ 0.5` | tuning §3.1 `radiusMinPx + (radiusMaxPx - radiusMinPx) * (e / energyMax) ^ curveExp` | Replace with `T.flame.radiusMinPx + (T.flame.radiusMaxPx - T.flame.radiusMinPx) * (e / T.flame.energyMax) ** T.flame.curveExp`. |
| F7 | major | `stepExplore` with `debug.reveal` on: `lightRadius` returns 1e6, so `rt = 31 250` and the loop scans about 3.9e9 tiles, which hangs the dev tab. The `exploreKey` packing `floor(R) < 1024` also breaks. | systems-4 §1 `R = lightRadius(s), rt = ceil(R / 32) ... exploreKey ... = tile * 1024 + floor(R)` | systems-2 §1 `lightRadius(s) = phase === 'escape' \|\| debug.reveal ? LIGHT_ALL` | In stepExplore, use the radius without reveal: `R = debug.reveal ? 0 : lightRadius(s)` (skip). Alternatively export `flameRadius(s)` (lightRadius without the escape/reveal branch) and use it in stepExplore. |
| F8 | minor | Literals where `T` and State keys exist | systems-2 §3 `e = min(100, ...)`; §5 step 6 `fx.beaconFlash = 1.2, fx.shake = 1.0, fx.shakeMag = 8` (bypasses `addShake`); step 4 `director.spawnT = 1.0`; systems-3 §4.1 rule 6 `hurtT = 0.8; hitFlash = 0.25` | tuning §1.1 `flame.energyMax`, `beacon.flashS/shakeS/shakePx`, `hurt.hpInvulnS/flashS`; state-1 `energyMax` | Use `p.energyMax`, `T.beacon.flashS`, and `addShake`-style writes from `T.beacon.shakeS/shakePx`. Rule 6 uses `T.hurt.*`. The `spawnT = 1.0` literal should become a new key `T.escape.firstSpawnS` (needs a §1.1 type line; R-074 does not list it). |
| F9 | minor | Duplicate source of truth: `player.energyMax`/`hpMax` in State vs `T.flame.energyMax` in tuning. A hot-tune of T does not reach a live run, and the two can disagree. | state-1 §8 `energyMax: number // flame units, 100` | tuning §3 `flame.energyMax 100` | Add to state-1 §8: "`energyMax` is set from `T.flame.energyMax` by `initPlayer()`; systems read `p.energyMax`". Alternatively drop the field. |
| F10 | minor | Rule 3 (`hurtT > 0`) lets a lunging shade survive a lit-flame contact. The spec says an attacker at a lit flame dies. | systems-3 §4.1 row 3 `p.hurtT > 0 \| none \| recover` | design § Flame and health `A shade that attacks you dies at the flame` | Accept and record it as a DEFAULT (architect) in systems-4 §7 item 6. Alternatively, in descent with a lit flame, call `setDying` without energy loss (no kill credit). |
| F11 | minor | Rock damage path has no signature. `damagePlayer(s, m: Monster)` needs a monster. | systems-4 §2 `costs 1 HP through damagePlayer-equivalent rules row 6 (no i-frames from rolling, hurt invulnerability applies)` | systems-3 §4 `damagePlayer(s: State, m: Monster): void` | Add `hurtPlayerHp(s, src: 'bite' \| 'rock')` in combat.ts. Rows 3, 5 and 6 call it. Rocks skip row 2. `T.rocks.damageHp` is already in tuning §1.1. |
| F12 | minor | Exact float equality on accumulated time | state-2 §2 `the perfect moment is m.ai === 'lunge' && m.aiT === PERFECT_AT[kind]` | systems-3 §3.1 `if \|δ\| <= P + 1e-9` | Reword state-2 §2: "perfect moment = lunge time `K.contactS`; compared only through δ with ε (systems-3 §3.1)". |
| F13 | minor | DOM side effect inside the simulation function. `check` calls `startRun(s,'12345')` under Node, where `history` is undefined. | state-2 §10 step 7 `history.replaceState the ?seed= URL ... (a host-side effect in the input handler)` | state-3 §7 #2 `s = init(); startRun(s, '12345')`; rulings-2 R-077 `platformStep` owns URL/clipboard | Move the `replaceState` call to `platformStep` (R-077). Delete it from startRun step 7. |
| F14 | minor | Pickup radius formula duplicated as a literal | systems-2 §3 `> (10 + 14)^2` | rulings-2 R-074 `use ... T.player.radiusPx + T.pickup.radiusPx` | Apply R-074 to the systems-2 §3 sketch (already ruled; listed so the edit is not missed). |

Already ruled, so no new finding: `stepRoll` literal `420` and undefined `sprint` (R-072); bite latch capsule (R-066); `setDying`/`toRecover` (R-073).

## Check 1 – State fields read or written by sketches

All other `s.*` paths used in systems-2/3/4 exist with the same name, type and default. That covers meta.{phase,zone,steps,screen}, player.{x,y,vx,vy,facing,hp,hpMax,energy,activeMineral,selected,minerals,swing.{active,t,dir,cooldown},parry.{lastGrade,lastDelta,lastAt,energyLost},roll.{t,cooldown,dirX,dirY,invuln},mining.{targetTile,progress},beaconHold,hurtT,hitFlash,stats.*}, world.{beacon,beaconLit,exit}, monsters[].{ai,aiT,aiDur,lungeCd,x,y,kind}, fx.{flare,beaconFlash,shake,shakeMag}, director.{spawnT,quakeT} and debug.{god,reveal}.

These fields are missing from state 1-3 but are listed in BOTH systems-4 §6 and rulings-2 §9: `fx.hitstop`, `player.swing.buffer`, `Monster.contactT`, `Monster.lastX/lastY` (used by R-066), `Pickup.size`, `world.exploreKey`, `director.escapeT`, `FxEventKind` additions `dodge`, `windup`, `lunge`. The exceptions are `denied` (F1) and `beat` (F5).

## Check 2 – `T.*` keys

Every key used in the sketches exists in tuning §1.1 with a matching type. Checked: flame.{radiusOutPx,burnPerS:Z4,flameHitInvulnS}, minerals.table[FlameKind].{radiusMul,burnMul,perfectMul,lossMul}, resin.{smallE,largeE}, mining.{reachPx,costPerS,tickS,holdS}, beacon.{minStartE,minEnergyE,costPerS,reachPx,holdS}, swing.*, parry.*, roll.*, hurt.hpInvulnS, monsters[k].{radiusPx,contactS,biteSlackPx,energyHitE,dyingS,recoverS,lungeCdS,lungeOverrunS}, escape.{firstRockS,rockWarnS,rocksMax,quakeShakePx,winRadiusTiles}, rocks.{minIntervalS,pendingMax,retryS,rateStart,rateEnd,rampS}, cam.{lerpPerS,shakeMaxPx,shakeDecayS}, shake keys flameHit/hpHit/rockLand/parryPerfect, ai.bonkS.

Gaps are limited to unused keys and literals (F6, F8). The proposed key `T.escape.firstSpawnS` is new (F8).

## Check 3 – hit rules vs spec

- Lit flame: energy loss, attacker dies. Matches systems-3 rule 4.
- Flame out: 1 HP. Matches rule 5.
- Escape: 1 HP. Matches rule 6 and state-1 §8 last line.
- Rocks: 1 HP, the roll does not dodge them. Matches systems-3 §6 and systems-4 §2 (no signature, F11).
- Parry needs a lit flame: `resolveParries` returns on `e <= 0`, and only runs in descent.
- Only deviation: F10.

## Check 4 – Beacon gate (40 E)

Consistent in tuning §5 (`minStartE 40`), tuning §1.1 (type), systems-2 §5 (pseudo-code and worked numbers), systems-4 §7.2 and §8 7/7a, and economy-2 §2. Inconsistent only in the event kind (F1).

## Check 5 – worked numbers, recomputed with node

| Example | Claimed | Recomputed |
|---|---|---|
| baseRadius 50 / 25 / 10 / 4 / 1 / 75 | 131.9 / 105.0 / 81.1 / 66.0 / 53.0 / 152.6 | 131.92 / 105.0 / 81.11 / 66.0 / 53.0 / 152.58 OK |
| Rule-4 hit at e = 25 → 5, radius | 105.0 → 69.1 | 69.07 OK |
| Resin small at e = 0; large at e = 60 | 25 E, 105 px; 100 (10 lost) | OK |
| Mining zone 1 / zone 4 at e = 40 | 33.0 / 31.2 | OK (the step count needs F3) |
| Beacon zone-4 hold | 27 E → 13.0; 72.8 → 45.8; floor at 3.52 s from 20 E | OK; 19/5.4 = 3.52 |
| Burn: sodium zone 2 from e = 10; zone 1 from e = 10 | 572 steps; 1200 steps to exactly 0 | 572; 1200 OK |
| Parry table (9 rows plus the ±5-step rows) | 3.99 / 7.57 / 1.80 / 3.86 / 11.63 / 9.60 / 4.24 / 8.22 | 3.988 / 7.573 / 1.795 / 3.856 / 11.633 / 9.600 / 4.236 / 8.226 OK (frac 0.6311 vs 0.6310, rounding only) |
| Lunge timeline (d0 = 131) | touch step 8, latch step 12 (d = 19), bite step 18, δ −0.117 / −0.0333 / +0.0833 | OK |
| Camera lag | 35.0 / 18.0 / 3.6 | 35.01 / 17.97 / 3.63 OK |
| Score | 5488 | OK |

## Check 6 – determinism and JSON red flags

- No `Math.random`, `Date.now` or `performance.now` in the sketches. No Map, Set, typed array, `undefined` or `Infinity` stored. `LIGHT_ALL` = 1e6 is never stored.
- `crypto.getRandomValues` runs only for an empty seed text. The drawn seed is then stored in `meta`, so a replay stays deterministic.
- Residual risks: F13 (DOM call in startRun). `Math.atan2`, `asin`, `exp` and `**` are not correctly rounded across engines, so the same seed may diverge between browsers in the simulation. Same-browser checks are unaffected. If a monster misses `lastX`/`lastY`, migrate fills them from the template, not from the spawn position. That causes a one-step stuck-detector glitch and is accepted.

## Verdict

BLOCKERS: 1 (F1). Majors: F2–F7. Minors: F8–F14.

Confidence: high for F1–F3 and F7 (quoted text and measured arithmetic); medium for F4 (it may be an accepted convention, but no ruling says so).

## Related

- [[session-state]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-rulings-2]]
- [[last-ember-design]]

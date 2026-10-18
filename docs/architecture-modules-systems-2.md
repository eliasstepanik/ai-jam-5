---
type: architecture
title: Last Ember – Module Tree – Entities and Systems (2/2) – Checks, Conflicts, State Additions
description: Part 2 of the Last Ember entities and systems module tree – the src/checks files that cover systems and what each asserts, every conflict and gap found across the systems, monster AI and tuning specs with the winning side and the exact edit, and the consolidated list of State additions required.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Module Tree: Entities and Systems (2/2)

Part 2 of 2. Part 1, with the layer rule and file list E1–E3 and S1–S22: [[architecture-modules-systems]]. Siblings: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-render]], [[architecture-modules-ui-assets]]. Hub: [[architecture]], [[index]]. The game design spec governs: [[last-ember-design]].

## 1. Checks covering systems (`src/checks/`)

Rules for every check file:
- Import from L0 to L3 only. Never import `src/game.ts` (L5) or `src/main.ts`, except through `import type`.
- Use `.ts` import paths. Run under Node ≥22.18 type stripping.
- No DOM, `window` or `import.meta.env` access at import time.
- Each file exports `run(): void` and throws on failure.
- `src/checks/all.ts` (EDIT) imports every file and prints `check ok`.
- A file whose code needs `init()` uses `initState()` instead (MS-19).

| File | Status | Asserts | Spec | Slice |
|---|---|---|---|---|
| `light-flame.check.ts` | NEW | `baseRadius(100) = 170`, `(50) ≈ 131.92`, `(0) = 22`, monotonic on 0..100; burn: zone 1, e = 10, 1200 empty steps gives e exactly 0, one `flameOut`, never negative | [[architecture-systems-4]] §8 #1, #3 | A |
| `parry.check.ts` | NEW | parry curve: every row of [[architecture-systems-3]] §3.2 within 0.01 E; `δ = −2/60` is perfect; copper loss < plain for the same δ; `δ < −earlyMaxS` is a whiff; perfect and graded parries both kill | §8 #2 | A |
| `damage.check.ts` | NEW | damage rules 1–6: latched lurker on a lit flame gives −12 E, `dying`, kills +1; flame out gives hp −1 and `recover`; escape with `roll.invuln > 0` gives no change and emits `dodge`; `hurtT > 0` gives no change; god mode gives no change; a lit hit that empties the flame does not cost HP | §8 #4, [[architecture-systems-3]] §4.1 | A |
| `economy.check.ts` | NEW | mining: 120 steps of `KeyE` at a vein removes the vein, adds pieces capped at 3, and drains ≥4 E; moving at step 60 resets progress and keeps the vein. Mineral rules: the worked sequence ends with copper 0, sodium 1, used 2, then denied; toss into a dead flame is denied. Beacon: e = 6 and 300 hold steps give `escape`, `beaconLit`, e ≥ 1, all monsters `dying` | §8 #5–#7 | B |
| `movement.check.ts` | NEW | 120 steps pushing into a wall never overlap a solid tile (closest-point distance ≥ r − 1e-6); the substep count for a 9.3 px/step lunge at r = 9 is 2 | §8 #8, [[architecture-systems]] §5.2 | A |
| `flow.check.ts` | NEW | screens: `title` + Enter gives `playing`; Blur gives `paused`; `dead` + Enter within 0.5 s stays `dead`. Determinism: two runs with the same seed and scripted input are `JSON.stringify`-equal after 1800 steps | §8 #9, #10 | A |
| `order.check.ts` | NEW, PROPOSED | update-order smoke test: (a) a swing and a bite landing on the same step give a parry and no bite (#13 before #14); (b) a resin under the player with e = 0 relights before the mining cost (#6 before #7); (c) hp 0 on the exit tile gives `dead`, not `won`; (d) during hitstop only the clocks advance and a click survives into `swing.buffer` (MS-25); (e) every step function is called at most once per step (counting spy through a test-only wrapper array in `step.ts`, PROPOSED) | [[architecture-systems]] §1 | A |
| `escape.check.ts` | NEW, PROPOSED | escape rules: after `lightBeacon`, `lightRadius = LIGHT_ALL`, energy is frozen across 600 steps, resin stays on the floor, a plant heals; sprint steady speed is 240 px/s; a roll covers 126 px ±1 and gives 18 steps of i-frames; cooldown 1.5 s; win within Chebyshev 1 tile of `world.exit` | [[architecture-systems-4]] §3, [[architecture-systems-3]] §6 | B |
| `ai.check.ts` | NEW | budget: 3600 steps with 24 forced shades take < 1 s total. PROPOSED additions: wrapPi wrap examples (3.0 vs −3.0 gives in front; 2.2 gives behind); the `devourerMul` table of [[architecture-monsters-ai-2]] §1 within 0.001; capsule latch worked example (no latch at 24 px, latch at 12 px) | [[architecture-monsters-ai-2]] §8, [[architecture-monsters-ai]] §5.1, §7 | A (devourer row C) |
| `score.check.ts` | NEW | `T.score` equals the literal numbers of `computeScore`; the worked win at 412 s, depth 40, 6 minerals and 3 HP scores 5488 | [[architecture-tuning-2]] §7, [[architecture-systems-4]] §3.1 | A |

The 10 assertions of [[architecture-systems-4]] §8 in a single `systems.check.ts` would pass 300 lines, so they are split as above (MS-20).

## 2. Conflicts and gaps found

Format: id. Both sides, which side wins, exact edit. "Layer" means the global layer rule of the brief, which always wins over a file path in a spec.

**MS-1 Layer: step.ts in core.** [[architecture-systems]] §1 puts `step()` in `src/core/step.ts` (L0) but it imports L3 and L4. Layer wins. Edit §1 and §1.3: replace `src/core/step.ts` with `src/systems/step.ts`; `game.ts update()` calls it.

**MS-2 Layer: screens.ts in ui.** [[architecture-systems]] §1.1 #0 and §2 put `stepScreens` in `src/ui/screens.ts` (L4), but it is called from step (L3) and calls `startRun`. The same section reads `?seed=` and copies the link (DOM). Layer wins. Edit: move the file to `src/systems/screens.ts`. Make the `KeyC` row emit `copyLink` with no clipboard work, and let L4 (`src/ui`) do the clipboard write. The URL seed comes from `ui.urlSeed`, set once by L4/L5. [[architecture-systems-2]] §4 "owner: src/ui/screens.ts" changes to `src/systems/screens.ts`.

**MS-3 Layer: run.ts in core.** [[architecture-systems]] §1.1 #16 and §3, and [[architecture-systems-4]] §3.1, put `startRun/endRun/checkEnd` in `src/core/run.ts` (L0). They import `lightRadius`, `emit` and the world generator. Layer wins. Edit: `src/systems/run.ts` in all three places.

**MS-4 Layer: monster step in entities.** [[architecture-systems]] #12 and [[architecture-monsters-ai]] header and §3 put `stepMonsters`, the pipeline, `ai-*.ts` and `separate` in `src/entities/`. They import `insideLight`, `moveCircle`, `emit` and `findSpawn` (L3). Layer wins. Edit:
- Move `stepMonsters`, `pipeline`, `updateStuck` and `separate` to `src/systems/monsters.ts`.
- Move `ai-lurker/stalker/devourer/escape.ts` to `src/systems/`.
- Keep `spawnMonster`, `seek` and `blend` in entities.
- Move `devourerMul` from `ai-devourer.ts` to `src/entities/monster.ts`. [[architecture-monsters-ai-2]] §1 header changes, so `light.ts` does not depend on a C-slice file.

**MS-5 wrapPi owner.** [[architecture-systems-3]] §3 defines `wrapPi` inside combat. [[architecture-monsters-ai]] uses it in steering and the stalker predicate. Layer wins. Edit: export `wrapPi` from `src/core/math.ts` and reference it there in both files.

**MS-6 Bite latch test.** [[architecture-systems-3]] §4 uses the end-point test `d <= rp + rm + K.biteSlackPx`. [[architecture-monsters-ai]] §5.1 says `resolveBites` uses the swept capsule `segDist(m.lastX, m.lastY, m.x, m.y, p.x, p.y)`. Monsters-ai §5.1 wins: it is the later refinement and catches strafing. Edit the systems-3 §4 pseudo-code line to `if m.contactT < 0 and segDist(m.lastX, m.lastY, m.x, m.y, p.x, p.y) <= rp + rm + K.biteSlackPx`. Put `segDist` in `src/core/math.ts`.

**MS-7 Side effects of entering dying or recover.** [[architecture-systems-4]] §4 says the monster AI emits `monsterDie` on entering `dying`. [[architecture-systems-3]] §4.1 says the same and adds: recover sets `aiDur = K.recoverS` and `lungeCd = randRange(K.lungeCdS)`. But `damagePlayer`, `resolveParries` and `lightBeacon` assign `m.ai` directly, so the event and timers would be skipped. Resolution: add `setDying(s, m)` and `toRecover(s, m)` in `systems/monsters.ts`. `toRecover` uses escape values (0.4 s, `escapeLungeCdS`) in escape. All writers call them. Edit systems-3 §3 and §4.1 and systems-2 §5 step 4 to call the helpers. `lightBeacon` deaths still do not add to kills.

**MS-8 Rock damage path.** [[architecture-systems-4]] §2 says a rock hit costs 1 HP through "`damagePlayer`-equivalent rules row 6". But `damagePlayer(s, m: Monster)` needs a monster. Resolution: add `hurtPlayerHp(s)` in combat, with the rule 5/6 body (hp −1, `hurtT` 0.8, `hitFlash`, `hpHit`, shake, `damageTaken`). `damagePlayer` and `quake.ts` both call it. Edit systems-4 §2 accordingly.

**MS-9 planRockFall contract unverified.** [[architecture-systems-4]] §2 uses `planRockFall(...)` without arguments and says "confirm against [[architecture-rocks]]; that file governs". That file was not in this read set. [[architecture-rocks]] wins. Gap: the [[architecture-modules-world]] sibling must copy the exact signature and the landing API, and `quake.ts` follows them.

**MS-10 LOS helper missing.** `losTiles(s, m, p)` ([[architecture-monsters-ai]] §4), eye LOS (ai-2 §6) and explore Bresenham ([[architecture-systems-4]] §1) all need one tile-LOS function. None of them gives a signature. Proposed: `losTiles(s, a, b): boolean` in `src/systems/light.ts`, reading landed rocks through `isSolidTile`. If [[architecture-modules-world]] already exports a grid LOS, use that and delete this one.

**MS-11 Brain type.** [[architecture-monsters-ai]] §1 says `brain[m.kind](s, m)` "returns desired velocity" but gives no type. The steering functions return `[number, number]`. Proposed: `type Brain = (s: State, m: Monster) => [number, number]`, also used by `escapeBrain`.

**MS-12 randRange form.** [[architecture-systems-4]] §2 uses `randRange(s, 'gameplay', 0.9, 1.8)`. [[architecture-monsters-ai]] §5 and ai-2 §5 use `randRange(K.lungeCdS)` and `randRange(0, 2π)`. Core governs the signature ([[architecture-modules-core]]). Edit the AI files to the full form `randRange(s, 'gameplay', lo, hi)`, with `...K.lungeCdS` for tuples.

**MS-13 stepRoll literals.** [[architecture-systems-3]] §6 uses `420` and an undefined `sprint`. The tuning file wins. Edit: `T.roll.speedPxS` and `T.player.walkPxS * T.escape.sprintMul`.

**MS-14 Tuning keys missing.** These values are literals in the specs. Add them to `T` ([[architecture-tuning]] §1.1 type) under `T.escape`:
- `frictionMul: 2` ([[architecture-systems]] §5.1)
- `attackSlots: 3`, `chaseMul: 1.3`, `interceptS: 0.3`, `recoverS: 0.4` ([[architecture-monsters-ai-2]] §2)
Also `T.ai.recoverBackPx: 40` and `T.ai.stalkerRetreatPx: 60` ([[architecture-monsters-ai]] §5), and `T.hurt.flashS` replaces the literal `hitFlash = 0.25` in systems-3 §4.1. Pickups use `T.player.radiusPx + T.pickup.radiusPx` instead of `(10 + 14)` in systems-2 §3.

**MS-15 Debug data.** The overlay ([[architecture-monsters-ai-2]] §9) shows the current λ and "relocates per minute". Edit: export `lungeHazard(s, m)` from `systems/monsters.ts`. Add the debug counter `director.relocates`, which `updateStuck` increments.

**MS-16 Systems binding vs screens.** [[architecture-systems]] says "no DOM in core|world|entities|systems". Screens loads settings and best once (`settings.loaded`). Resolution: the localStorage access lives in L0 save helpers and runs at call time, never at import time. Checks never call it, or guard it with `typeof localStorage`. See [[architecture-modules-core]].

**MS-17 Input type from host.** `intent.ts` and `step.ts` need `Input`, which is defined in `src/main.ts` (host, DOM at import). Rule: use only `import type { Input } from '../main.ts'`; the import is erased under type stripping. Checks build `Input` literals. No edit needed; record the rule.

**MS-18 initPlayer location.** [[architecture-systems-4]] §6 names `initPlayer()` and `spawnMonster()` without a file. Assigned to entities (E1, E2). If [[architecture-modules-core]] places `initPlayer` in core, core wins and E1 is deleted.

**MS-19 Checks need init.** [[architecture-systems-4]] §8 #3 calls `init`, which lives in `game.ts` (L5). Checks may import L0–L3 only. Edit: `init()` in `game.ts` returns `initState()` from an L0 module (owner [[architecture-modules-core]]); checks call `initState()`.

**MS-20 Single check file too big.** [[architecture-systems-4]] §8 names one `systems.check.ts` for 10 scenario checks, which would pass 300 lines. Edit: use the split in section 1.

**MS-21 Escape checks missing.** No spec defines escape-rule checks or an update-order test, yet the brief requires both. Added as PROPOSED `escape.check.ts` and `order.check.ts`.

**MS-22 lungeDir at windup.** [[architecture-state-2]] §2 says "locked at windup start". [[architecture-monsters-ai]] §5 tracks during windup and locks at lunge start (DEFAULT, architect, stated as a refinement). Monsters-ai wins. Edit the state-2 §2 comment.

**MS-23 Bite resolve vs latch pin.** [[architecture-monsters-ai]] §5 says a latched shade is placed at `p + (rp + rm) · unit` by the AI (#12). [[architecture-systems-3]] §4 latches in #14, after the AI. So the shade sticks one step late. Accepted as is (one step, no gameplay effect). Documented here so nobody "fixes" the order.

**MS-24 Phase write owner.** `lightBeacon` writes `meta.phase`, "owner per [[architecture-state-3]] §6". That file was not read here, so this is not verified. It is a gap for the state owner.

**MS-25 Hitstop eats clicks.** [[architecture-systems]] §1.3 says a click during hitstop survives through `swing.buffer`. But the hitstop branch returns before `stepSwing`, so nothing writes the buffer. Edit the skeleton's hitstop branch to `if (input.clicks.length > 0) s.player.swing.buffer = T.swing.bufferS`. The buffer is not decremented during hitstop, because `stepSwing` does not run, so 0.10 s is enough.

**MS-26 Devourer cut safety.** The C-slice cut changes these things:
- `T.director.weights.devourer = [0, 0, 0, 0]`
- remove `ai-devourer.ts` and its brain entry
- the windup beat logic in the pipeline stays, but is unreachable

`devourerMul` returns 1 with no devourer, `parry.check.ts` keeps the devourer row because it is a pure function, and the `ai.check.ts` devourer row stays valid. No other file changes.

## 3. State additions required

From [[architecture-systems-4]] §6 and [[architecture-monsters-ai]] / [[architecture-monsters-ai-2]], plus the proposals above. All are additive, need defaults in `initState()` / `initPlayer()` / `spawnMonster()` and the `DEFAULT_*` constants of [[architecture-state-3]] §3, and need no `STATE_VERSION` bump.

| Field | Type | Default | Source |
|---|---|---|---|
| `fx.hitstop` | number | `0` | systems-4 §6 |
| `player.swing.buffer` | number | `0` | systems-4 §6 |
| `Monster.contactT` | number | `-1` | systems-4 §6, systems-3 §1 |
| `Monster.stuckT` | number | `0` | systems-4 §6, ai-2 §4 |
| `Monster.lastX`, `Monster.lastY` | number | spawn x, y | systems-4 §6, ai §1, §5.1 |
| `Monster.fleeing` | boolean | `false` | systems-4 §6, ai §2 |
| `Monster.behindT` | number | `0` | systems-4 §6, ai §7 |
| `Pickup.size` | `'small' \| 'large'` | `'small'` | systems-4 §6, tuning §4 |
| `world.exploreKey` | number | `-1` | systems-4 §6 |
| `FxEventKind` + `'dodge' \| 'windup' \| 'lunge'` | union | – | systems-4 §6 |
| `Debug.overlay` | boolean | `false` | systems-4 §6, ai-2 §9 |
| `Monster.beat` | `1 \| 2` | `1` | ai §5 (used, absent from the systems-4 table; verify against [[architecture-state-2]] §2) |
| `Monster.ringRadius` | number | ai §2 formula | ai §2 (stored mirror; state-2 default refined) |
| `FxEventKind` + `'copyLink'` | union | – | PROPOSED, MS-2 |
| `ui.urlSeed` | string | `''` | PROPOSED, MS-2 |
| `director.relocates` | number | `0` | PROPOSED, MS-15 |

Fields assumed to already exist in [[architecture-state-2]] and read by these systems: `ringAngle`, `orbitDir`, `lungeDir`, `lungeCd`, `stunned`, `seen`, `aiT/aiDur`, `player.roll.{t,invuln,cooldown,dirX,dirY}`, `player.parry`, `director.{spawnT,quakeT,alive}`. Not verified here, because state-2 is outside this read set.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-systems]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-render]]
- [[architecture-modules-ui-assets]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-rocks]]
- [[architecture-scoring-and-save]]

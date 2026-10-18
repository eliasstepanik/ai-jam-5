---
type: architecture
title: Last Ember – Module Tree – Entities and Systems
description: Authoritative src/entities and src/systems file list for Last Ember (part 1 of 2) – layer rule as applied, per-file path, status, responsibility, exported signatures copied from the specs, allowed imports, spec section, update-order index, size, owner area and slice. Checks, conflicts and State additions are in part 2.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Module Tree: Entities and Systems (1/2)

Part 1 of 2. Part 2: [[architecture-modules-systems-2]] covers checks, conflicts and gaps, and the State additions. Siblings: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-render]], [[architecture-modules-ui-assets]]. Hub: [[architecture]], [[index]]. The game design spec governs: [[last-ember-design]]. Sources: [[architecture-systems]], [[architecture-systems-2]], [[architecture-systems-3]], [[architecture-systems-4]], [[architecture-monsters-ai]], [[architecture-monsters-ai-2]], [[architecture-tuning]], [[architecture-tuning-2]]. Typed State shapes: [[architecture-state-2]]. Rocks: [[architecture-rocks]]. Save and score: [[architecture-scoring-and-save]].

This file is binding wherever it moves a symbol to satisfy the layer rule. Every move is listed as a conflict in part 2, with the exact edit needed in the source spec. Symbols marked **PROPOSED** have no signature in any spec. They need the owner's approval before implementation.

## 1. Layer rule as applied

```
L0 src/core     types, constants, tuning (T), rng, math (+wrapPi, segDist: MS-5/MS-6), ids, save helpers
L1 src/world    generator, tiles, solid grid, path fields, planRockFall     src/assets
L2 src/entities player.ts, monster.ts, steer.ts         (imports L0, L1 only)
L3 src/systems  everything in section 3                 (imports L0–L2 + own layer, acyclic)
L4 src/render, src/audio, src/ui (may import light.ts, camera.shakeOffset, fx types)
L5 src/game.ts  init/update/render/migrate facade: update() calls systems/step.ts step()
host            src/main.ts, src/merge.ts
checks          src/checks/*.ts import L0–L3 only, DOM-free at import time
```

These rules apply to all L0–L3 files. They use no `document`, `window`, `navigator`, `localStorage` or `import.meta.env` at import time. Systems never call them at run time either; the systems binding in [[architecture-systems]] says "no DOM". Imports use `.ts` extensions. No enum, namespace or parameter properties. State is mutated only through `s`. Randomness comes only from `rand(s, 'gameplay' | 'cosmetic')`.

Verified: no file in section 3 imports from render, audio or ui once MS-1 to MS-4 are applied. `light.ts` is imported upward by render. That is allowed.

Intra-L3 import DAG. An arrow means "imports". It is acyclic.

```
step ─► screens ─► run ─► fx, light            step ─► every step fn below
monsters ─► light, movement, fx, director, ai-*    ai-* ─► light, movement(none), entities
combat ─► fx, monsters(setDying/toRecover)        beacon ─► fx, monsters(setDying)
director ─► light, fx(none), entities/monster     quake ─► fx, combat(hurtPlayerHp, MS-8)
light ─► entities/monster(devourerMul)            flame, pickups, mining ─► fx
```

Rule: `monsters.ts` must never import `combat.ts`, `beacon.ts` or `quake.ts`. `director.ts` must never import `monsters.ts`.

## 2. src/entities (L2)

Allowed imports for all three files: `src/core/*` and `src/world/*` only. The Monster-step logic moved to L3 (MS-4), because it needs `light.ts`, `moveCircle` and `emit`.

**E1 `src/entities/player.ts`** NEW. Default player record. Exports `initPlayer()`, the name from [[architecture-systems-4]] §6. Its typed shape is in [[architecture-state-2]], which is not in this read set. Defaults include the additions `swing.buffer = 0`. Order: none. About 50 lines. Owner: entities. Slice A. See MS-18 for location.

**E2 `src/entities/monster.ts`** NEW. Monster spawn defaults and the devourer light query.
- `spawnMonster(s, kind, x, y)`. Call form from [[architecture-monsters-ai-2]] §5. The typed signature is in [[architecture-state-2]] §2. Additions: `contactT -1`, `stuckT 0`, `lastX/lastY = x/y`, `fleeing false`, `behindT 0`, `lungeCd = randRange(K.lungeCdStartS)`, `ringRadius` per [[architecture-monsters-ai]] §2.
- `devourerMul(s): number` ([[architecture-monsters-ai-2]] §1). It moved here from `ai-devourer.ts` (MS-4). It is a pure smoothstep push and returns 1 with no live devourer, so cutting the Devourer is safe.
- Order: none. Called by #11 director, by `light.ts` and by #12. About 70 lines. Owner: entities. Slice A; `devourerMul` is C, harmless if unused.

**E3 `src/entities/steer.ts`** NEW. Pure steering maths ([[architecture-monsters-ai]] §3.1–§3.2).
- `seek(mx: number, my: number, tx: number, ty: number, vmax: number, arriveK = 3): [number, number]`
- `blend(m: Monster, dvx: number, dvy: number, rate: number, dt: number): void`
- `separate` moved to `systems/monsters.ts` (MS-4).
- About 30 lines. Owner: entities. Slice A.

## 3. src/systems (L3)

Order indices come from [[architecture-systems]] §1.1 (descent, D#) and §1.2 (escape, X#). Allowed imports: L0 to L2 plus the L3 files named in each entry.

**S1 `src/systems/step.ts`** NEW (moved from `src/core/step.ts`, MS-1). Fixed-step driver.
- `step(s: State, input: Input, dt: number): void`, with the body copied from [[architecture-systems]] §1.3 plus the hitstop click fix (MS-25).
- Imports every step function in this section and `Input` as `import type` from `main.ts`.
- Order: D0–D18 and X0–X18. About 45 lines. Owner: systems-flow. Slice A.

**S2 `src/systems/screens.ts`** NEW (moved from `src/ui/screens.ts`, MS-2). Screen state machine ([[architecture-systems]] §2).
- `stepScreens(s: State, input: Input): boolean`
- Ticks `ui.toasts` and `ui.copied`. Loads settings and best once through the L0 save helpers. On `KeyC` it emits `copyLink` (PROPOSED FxEventKind); L4 performs the clipboard write. The URL seed comes from PROPOSED `ui.urlSeed`, written once by L4/L5.
- Imports: run, fx. Order: D0/X0. About 110 lines. Owner: systems-flow. Slice A; help pages B.

**S3 `src/systems/run.ts`** NEW (moved from `src/core/run.ts`, MS-3). Run lifecycle, win and lose, result.
- `startRun(s: State, seedText: string): void` ([[architecture-systems]] §3, steps 1–7 of [[architecture-state-2]] §10)
- `endRun(s: State, won: boolean): void` (`computeScore`, `RunResult`, `commitBest`, [[architecture-scoring-and-save]] §5)
- `checkEnd(s: State): void` ([[architecture-systems-4]] §3.1; lose beats win)
- Imports: world generator (L1), core score/save helpers, light (explored seeding), fx, entities/player.
- Order: D16/X16. About 120 lines. Owner: systems-flow. Slice A; the escape win is B.

**S4 `src/systems/intent.ts`** NEW. Converts `Input` into a per-step `Intent` ([[architecture-systems]] §4).
- `type Intent` (fields exactly as in §4)
- `resolveIntent(s: State, input: Input): Intent`
- Imports: core only. Order: D2/X2. About 50 lines. Owner: systems-player. Slice A.

**S5 `src/systems/movement.ts`** NEW. Player movement, shared circle collision, escape roll.
- `stepMovement(s: State, it: Intent, dt: number): void` (§5.1–§5.2)
- `moveCircle(s: State, x: number, y: number, dx: number, dy: number, r: number): { x: number; y: number; hitX: boolean; hitY: boolean }`
- `isSolidTile(s: State, tx: number, ty: number): boolean` (reads the world solid cache)
- `stepRoll(s: State, it: Intent, dt: number): void` ([[architecture-systems-3]] §6; literals fixed by MS-13)
- Imports: intent (type), fx, world solid grid. Order: D3/X3 (roll first in X3). About 140 lines. Owner: systems-player. Slice A; roll B.

**S6 `src/systems/depth.ts`** NEW. Depth and zone mirror: `trackDepth(s)` (form from [[architecture-systems]] §1.1; body in [[architecture-scoring-and-save]] §1). Order: D4/X4. About 25 lines. Owner: systems-flow. Slice A.

**S7 `src/systems/explore.ts`** NEW. Explored bitset under the light, with LOS and an `exploreKey` skip cache.
- `stepExplore(s: State): void` ([[architecture-systems-4]] §1)
- Imports: light (`lightRadius`, `losTiles`), world `markExplored`. Order: D4 only. About 45 lines. Owner: systems-world. Slice B.

**S8 `src/systems/light.ts`** NEW. The one light predicate shared by update and render ([[architecture-systems-2]] §1).
- `LIGHT_ALL = 1e6`
- `baseRadius(e: number): number`
- `lightRadius(s: State): number`
- `insideLight(s: State, x: number, y: number, pad = 0): boolean`
- `lightFrac(s: State): number`
- PROPOSED `losTiles(s: State, a: { x: number; y: number }, b: { x: number; y: number }): boolean` (MS-10)
- Imports: entities/monster (`devourerMul`), world solid grid. Order: none (query). About 60 lines. Owner: systems-world. Slice A.

**S9 `src/systems/flame.ts`** NEW. Passive burn, flame-out, minerals.
- `stepFlame(s: State, dt: number): void` (§2, beacon floor coupling from §5)
- `stepMinerals(s: State, it: Intent): void` (§6)
- Imports: fx. Order: D5/X5 (returns early) and D9. About 80 lines. Owner: systems-economy. Slice A; minerals B.

**S10 `src/systems/pickups.ts`** NEW. Resin and plant pickups.
- `stepPickups(s: State): void` ([[architecture-systems-2]] §3; resin ignored in escape)
- Imports: fx. Order: D6/X6. About 40 lines. Owner: systems-economy. Slice A; `Pickup.size` is B.

**S11 `src/systems/mining.ts`** NEW. Mining hold, cancel, completion, pouch full.
- `stepMining(s: State, it: Intent, dt: number): void` (§4)
- Imports: fx. Order: D7. About 70 lines. Owner: systems-economy. Slice B.

**S12 `src/systems/beacon.ts`** NEW. Beacon hold and phase transition.
- `stepBeacon(s: State, it: Intent, dt: number): void`
- `lightBeacon(s: State): void` (§5 steps 1–7)
- Imports: fx, monsters (`setDying`). Order: D8. About 70 lines. Owner: systems-escape. Slice B.

**S13 `src/systems/combat.ts`** NEW. Swing, parry, bites, damage rules, player timers ([[architecture-systems-3]] §2–§5).
- `stepSwing(s: State, it: Intent, dt: number): void`
- `resolveParries(s: State): void`
- `parryLoss(δ, kind, mineral): { grade: ParryGrade; loss: number }`. Pure and exported for checks. The spec gives no parameter types; use `(d: number, kind: MonsterKind, mineral: FlameKind)`.
- `resolveBites(s: State): void` (capsule latch per MS-6)
- `damagePlayer(s: State, m: Monster): void` (§4.1 rules 1–6)
- `tickPlayerTimers(s: State, dt: number): void`
- PROPOSED `hurtPlayerHp(s: State): void` (rules 5/6 body, shared with rocks; MS-8)
- `wrapPi` moved to core/math (MS-5).
- Imports: fx, monsters. Order: D10, D13, D14/X14, D15/X15. About 210 lines; split `parry.ts` if it passes 300. Owner: systems-combat. Slice A.

**S14 `src/systems/director.ts`** NEW. Spawning, despawning and caps for descent and escape.
- `stepDirector(s: State, dt: number): void` ([[architecture-monsters-ai-2]] §5, §3)
- `findSpawn(s, kind)`. Form from §5; it returns a position or nothing. PROPOSED type: `{ x: number; y: number } | null`.
- Imports: light, entities/monster, world path fields. Order: D11/X12. About 100 lines. Owner: systems-AI. Slice A; the escape table is B.

**S15 `src/systems/monsters.ts`** NEW (moved from `src/entities/monster.ts`, MS-4). Shared AI step.
- `stepMonsters(s: State, dt: number): void` ([[architecture-monsters-ai]] §1)
- `pipeline(s, m, desired, dt)` (§5: windup, lunge, recover, stunned, dying)
- `separate(s: State, dt: number): void` (§3.4)
- `updateStuck(s, m, dt)` ([[architecture-monsters-ai-2]] §4)
- PROPOSED `lungeHazard(s: State, m: Monster): number` (§4 λ; reused by the debug overlay, MS-15)
- PROPOSED `setDying(s: State, m: Monster): void` and `toRecover(s: State, m: Monster): void` (MS-7)
- Holds the brain table `{ lurker, stalker, devourer }`.
- Imports: light, movement, fx, director, ai-*, entities. Order: D12/X13. About 220 lines. Owner: systems-AI. Slice A.

**S16 `src/systems/ai-lurker.ts`** NEW. Lurker brain: orbit and flee ([[architecture-monsters-ai]] §6, §2, §3.3). PROPOSED type `Brain = (s: State, m: Monster) => [number, number]` (MS-11). About 60 lines. Owner: systems-AI. Slice A.

**S17 `src/systems/ai-stalker.ts`** NEW. Stalker brain: behind predicate, `behindT`, circling toward βt (§7). About 70 lines. Owner: systems-AI. Slice B.

**S18 `src/systems/ai-devourer.ts`** NEW. Devourer brain: approach that never flees, two-beat windup handled in the pipeline (§8). About 40 lines. Owner: systems-AI. Slice C, first cut candidate. Cutting it means: set the devourer weights to 0 in `T` and drop the file and its brain-table entry. `devourerMul` stays in E2.

**S19 `src/systems/ai-escape.ts`** NEW. Escape hunt brain, `escapeBrain(s, m)` ([[architecture-monsters-ai-2]] §2). About 50 lines. Owner: systems-escape. Slice B.

**S20 `src/systems/quake.ts`** NEW. Rock-fall cadence only.
- `stepQuake(s: State, dt: number): void` ([[architecture-systems-4]] §2)
- Calls world `planRockFall(...)` and the landing API ([[architecture-rocks]] governs, MS-9).
- Imports: world rocks, fx, combat (`hurtPlayerHp`). Order: X11. About 60 lines. Owner: systems-escape. Slice B.

**S21 `src/systems/fx.ts`** NEW. Event queue, shake, fx timers ([[architecture-systems-4]] §4).
- `emit(s: State, kind: FxEventKind, x: number, y: number, a = 0): void`
- `addShake(s: State, k: keyof typeof T.shake, scale = 1): void`
- `tickFx(s: State, dt: number): void` (never decrements `hitstop`)
- Imports: core only. Order: D17/X17. About 45 lines. Owner: systems-flow. Slice A.

**S22 `src/systems/camera.ts`** NEW. Camera follow and the render-only shake helper (§5).
- `stepCamera(s: State, dt: number): void`
- `shakeOffset(s: State): { x: number; y: number }` (pure, uses the core stateless noise)
- Order: D18/X18. About 30 lines. Owner: systems-flow. Slice A.

Not in L3: the debug overlay is `drawDebug(ctx, s, w, h)` in `src/ui/debug.ts` (L4, [[architecture-monsters-ai-2]] §9). It reads `lungeHazard`, `devourerMul` and `lightRadius`. Score maths (`computeScore`) is in core. Totals: 3 entity files and 22 system files, all NEW. The largest is about 220 lines.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-systems-2]]
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
- [[architecture-rocks]]
- [[architecture-scoring-and-save]]

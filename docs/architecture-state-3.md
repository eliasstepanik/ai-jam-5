---
type: architecture
title: Last Ember – State Architecture (3/3) – migrate, Versions, Non-State Data, Budgets, Checks
description: Last Ember State part 3 – nested idempotent migrate() algorithm with proof sketch, STATE_VERSION bump policy, table of everything kept outside State and where it lives, size budget, field ownership by system, required npm run check assertions and open questions.
tags: [project, ai-jam-5, architecture, last-ember, state]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – State Architecture (3/3)

Part 3 of 3. Previous: [[architecture-state]], [[architecture-state-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. Randomness: [[architecture-determinism]]. Score/save: [[architecture-scoring-and-save]]. Non-State resources: [[architecture-resources]].

## 1. Why Last Ember exports `migrate`

`mergeState` without `migrate` is `{ ...init(), ...old }`, which is SHALLOW. Adding `player.roll.invuln` later would not reach an old `player` object, so `s.player.roll.invuln` would be `undefined` and arithmetic would produce `NaN`. Therefore `src/game.ts` exports `migrate`, implemented in `src/core/migrate.ts` as a generic **deep default fill**. Since `mergeState` calls `migrate` instead of the shallow merge, the shallow path is never used.

## 2. `STATE_VERSION` policy

| Change | Bump `STATE_VERSION`? | What happens on the next swap |
|---|---|---|
| Add a field anywhere (with a default in `init()`/`initPlayer()`/`spawn*()` defaults) | no | deep fill adds it |
| Add a member to a string-literal union | no | old values stay valid |
| Remove a field | no | it lingers harmlessly; `migrate` does not delete (deleting is not needed for correctness) |
| Rename a field, change a field's TYPE or UNIT (e.g. `tiles` from string to array, seconds to steps), change tile alphabet, change `MAP_W/H`, change array element meaning | **yes, +1** | old state is incompatible: reset |

Map-size bump rule ([[architecture-scale-and-economy-4]] §1.1): the 160×120 → 320×240 change bumps `STATE_VERSION` `1 → 2` only if code with 160×120 has already merged; if not, keep `1` (no old state exists).

On `old.version !== STATE_VERSION` (or `version` missing or not a number): `migrate` returns `init()`, keeps only `settings` and `best` if they pass the deep fill, and calls `console.warn('[migrate] state v' + old.version + ' -> v' + STATE_VERSION + ': reset to title')`. The warning comes from `migrate`, which the host only calls on swaps and re-runs, so it is not per-frame noise. Keeping `settings`/`best` avoids re-reading storage. A version reset is idempotent: the result carries the current version, so the second call takes the fill path and returns an equal value.

## 3. `migrate(old)` algorithm

```ts
// src/core/migrate.ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Element defaults for entity arrays, keyed by dotted path from the State root.
const ELEMENT_DEFAULTS: Record<string, unknown> = {
  monsters: DEFAULT_MONSTER, pickups: DEFAULT_PICKUP, veins: DEFAULT_VEIN,
  rocks: DEFAULT_ROCK, 'fx.events': DEFAULT_FX_EVENT, 'ui.toasts': DEFAULT_TOAST,
}

// Returns a NEW value shaped like `def`, preferring `old` wherever old is type-compatible.
export function fill(def: unknown, old: unknown, path = ''): unknown {
  if (old === undefined) return def                                  // missing -> default
  if (def === null) return old                                       // nullable slot (best, result): keep old as is
  if (Array.isArray(def)) {
    if (!Array.isArray(old)) return def
    const tmpl = ELEMENT_DEFAULTS[path]
    return tmpl ? old.map((e) => fill(tmpl, e)) : old.slice()        // fill each element; plain arrays copied
  }
  if (isObj(def)) {
    if (!isObj(old)) return def
    const out: Record<string, unknown> = { ...old }                  // keeps unknown/removed keys (harmless)
    for (const k of Object.keys(def)) out[k] = fill(def[k], old[k], path ? path + '.' + k : k)
    return out
  }
  return typeof old === typeof def ? old : def                       // primitive: keep if same type
}

export function migrate(old: unknown): State {
  const fresh = init()
  if (!isObj(old) || old.version !== STATE_VERSION) return resetKeep(fresh, old)
  const s = fill(fresh, old) as State
  if (s.best !== null) s.best = fill(DEFAULT_BEST, s.best) as Best
  if (s.result !== null) s.result = fill(DEFAULT_RESULT, s.result) as RunResult
  return s
}
```

Details:

- Element fill inside an entity uses `path = ''` again, so nested arrays of entities (`rock.tiles`) are plain arrays and copied as is. `world.explored` is also a plain array.
- `typeof null === 'object'` edge: a primitive default (e.g. `number`) with `old === null` returns the default, because `typeof null !== 'number'`. NaN is a `number` and is kept; NaN never enters State because of the round-trip check (§7).
- `DEFAULT_MONSTER` etc. are frozen module constants with every field (spawn defaults from [[architecture-state-2]]), used ONLY by `migrate`. Rule: when you add a field to an entity type, add it to its `DEFAULT_*` in the same edit. `npm run check` enforces it with a key-set comparison (§7).
- Nullable slots: `best` and `result` default to `null`. `fill(null, old)` keeps `old`; the two post-steps deep-fill a non-null value against its own default object.
- `resetKeep(fresh, old)`: if `old` is an object and `old.settings`/`old.best` are objects, `fresh.settings = fill(fresh.settings, old.settings)` and `fresh.best = fill(DEFAULT_BEST, old.best)`. Then warn (§2) and return `fresh`.
- `migrate` never mutates `old` and never reads `Input`, DOM or storage.

**Idempotency proof sketch.** Let `F(x) = fill(D, x)` for a fixed default tree `D` (`init()` is deterministic, so `D` is the same on both calls).

1. Primitive slot: `F(x)` is `x` if `typeof x === typeof d`, else `d`. Both results have type `typeof d`, so a second `F` returns them unchanged.
2. Object slot: `F(x)` has every key of `d`, each already filled; extra keys are copied verbatim. Applying `F` again copies the extra keys again and, by induction on depth, leaves each `d`-key unchanged.
3. Array slot with template `t`: each element becomes `fill(t, e)`; by induction a second fill is a no-op. Plain arrays are copied as is.
4. Nullable slot: `null` stays `null`; a non-null value was filled against its default and is a fixed point by 2.
5. Version gate: after the first call `version === STATE_VERSION`, so the second call takes the fill path, which is a fixed point by 1–4. `resetKeep` output also has the current version.

So `migrate(migrate(x))` deep-equals `migrate(x)`. `fill` never computes from a valid value (no arithmetic, no clamping), so it only fills defaults, as AGENTS.md requires. Out-of-range values (`hp = 9`) are NOT clamped by `migrate`; gameplay clamps on its next write.

## 4. Hot-swap scenarios

| Edit during a run | Result |
|---|---|
| tune a constant in `src/core/tuning.ts` | instant effect, State unchanged |
| add `player.combo: number` (default `0` in `initPlayer`) | deep fill adds `combo = 0`, run continues |
| add `Monster.rage` + `DEFAULT_MONSTER.rage` | every live monster gets the default |
| edit the cave generator | current run keeps its `world.tiles`; next run uses the new generator |
| change the derived-cache builder (path BFS) | caches are keyed by `tilesHash`/`solidSig` and the module is re-evaluated, so caches are rebuilt on first use |
| change `Vein.tile` meaning | bump `STATE_VERSION`: reset to title with a console warning |

## 5. What is NOT in State

| Thing | Why not in State | Lives in | Rebuilt from |
|---|---|---|---|
| Path-distance field from entrance (`Int32Array` 76 800) | heavy, derived | `src/world/caches.ts` (R-046) memo keyed by `tilesHash` | `world.tiles` (rocks ignored: this is the descent depth field) |
| Escape path field to exit (`Int32Array`) | heavy, changes with rocks | `src/world/caches.ts` (R-046) memo keyed by `tilesHash + ':' + solidSig` | `tiles` + landed `rocks` |
| Solid grid (`Uint8Array`) | heavy, derived | `src/world/caches.ts` (R-046) keyed like the escape field | `tiles` + landed `rocks` |
| Zone per tile | derived | function `zoneAt(s, i)` over the depth field | depth field + `world.beaconDist` |
| Decor list | cosmetic, derived | `src/render/decor.ts` memo keyed by `tilesHash` | `hashSeed(seed, 'decor')` |
| Pre-rendered map chunks (offscreen canvases) | DOM objects | `src/render/mapCache.ts` | `tiles`, `tilesHash`, atlas |
| Explored-memory overlay canvas | DOM object | `src/render/mapCache.ts` | `world.explored` (redrawn when a word changes) |
| Light sprites / radial gradients per `FlameKind` | DOM objects | `src/render/light.ts` | constants |
| Image atlas (`HTMLImageElement`/`ImageBitmap`) | DOM object | `src/assets/atlas.ts` | Vite-imported URLs |
| `AudioContext`, gain nodes | DOM object, needs a user gesture | `src/audio/engine.ts`, created lazily on first input, never disposed (kept across HMR swaps, [[architecture-resources]]) | – |
| Decoded `AudioBuffer`s | DOM object | `src/audio/buffers.ts` | Vite-imported URLs |
| Particle pool (sparks, dust, embers) | cosmetic, high churn | `src/render/particles.ts` | `fx.events` |
| Event consumer cursors (`lastSeq`) | per-module-instance | `src/render/particles.ts`, `src/audio/sfx.ts` | §7 of [[architecture-state-2]] |
| Visibility / LOS cache | derived per frame | computed in render, not stored | `player`, solid grid |
| `localStorage` | browser API | `src/ui/storage.ts` | – (State holds mirrors `settings`, `best`) |
| `Input` | host-owned, has `Set`s | `src/main.ts` | – |
| Viewport `w`, `h`, `devicePixelRatio` | host-owned | `src/main.ts`, passed to `render` | – |

Rule for every module cache: it is a `let` holding DERIVED data plus its key; it must be rebuildable from State at any time. A stale cache is a cache miss, never a bug. This is the only module-level mutable data allowed outside `main.ts` (AGENTS.md: no GAME STATE in module variables; caches are not game state). Full lifecycle: [[architecture-resources]].

## 6. Field ownership (who writes)

Rule (R-126, [[architecture-rulings-3]] §5): every field has ONE **primary owner** plus the **co-writers listed** in this table, nothing else. A co-writer not listed here is a bug. `startRun()`/`initPlayer()` (`src/core/run.ts`) reset every run field and are implicit co-writers of all rows; they are not repeated.

| Group / field | Primary owner (module) | Listed co-writers |
|---|---|---|
| `meta.screen`, menus, `ui.*` | `src/systems/screens.ts` (R-003; DOM effects in `src/ui/platform.ts` `platformStep`) | – |
| `meta.steps`, `meta.time`, `meta.phase` | `src/systems/step.ts` (R-002) | `meta.phase`: `lightBeacon()` in `src/systems/beacon.ts` |
| `meta.zone`, `player.stats.maxPathDist/maxDepth/deepestZone` | `trackDepth()` in `src/systems/depth.ts` | – |
| `player` movement, `roll` | `src/systems/movement.ts` | – |
| `player.energy` | `stepFlame()` in `src/systems/flame.ts` | `stepPickups` (`pickups.ts`, resin), `stepMining` (`mining.ts`, cost), `stepBeacon` (`beacon.ts`, hold cost), `resolveParries`/`damagePlayer` (`combat.ts`, losses) |
| `activeMineral`, `minerals`, toss/shake-off | `stepMinerals()` in `src/systems/flame.ts` | `minerals`: `stepMining` (`mining.ts`, completion) |
| `player.swing`, `player.parry`, kills/parry stats | `src/systems/combat.ts` | `swing.buffer`: `step()` hitstop branch (R-068) |
| `player.hp`, `hurtT`, `hitFlash`, damage stats | `hurtPlayerHp()` / `damagePlayer()` in `src/systems/combat.ts` (rocks call `hurtPlayerHp`, R-148) | `hp`: `stepPickups` (`pickups.ts`, plant heal +1) |
| `player.mining`, `veins` | `src/systems/mining.ts` | `mining`: `lightBeacon()` (`beacon.ts`, reset to `{ -1, 0 }`) |
| `pickups`, resin/plant stats | `src/systems/pickups.ts` | – |
| `monsters` | `src/systems/monsters.ts` (AI; `dying`/`recover` only via `setDying`/`toRecover`, R-073) | spawn: `src/systems/director.ts`; callers of `setDying`/`toRecover`: `combat.ts`, `beacon.ts`, `quake.ts` |
| `director.spawnT`, `director.alive` | `src/systems/director.ts` | `spawnT`: `lightBeacon()` (`beacon.ts`, `T.escape.firstSpawnS`) |
| `rocks`, `director.quakeT`, `world.solidSig` | `src/systems/quake.ts` | `quakeT`: `lightBeacon()` (`beacon.ts`, `T.escape.firstRockS`) |
| `world.explored`, `world.exploreKey` | `src/systems/explore.ts` | – |
| `fx` (events, `shake`, `shakeMag`, `flare`, `beaconFlash`, `hitstop`) | `emit()`, `addShake()`, `tickFx()` in `src/systems/fx.ts` | `flare`, `hitstop`: `resolveParries` (`combat.ts`); `hitstop` decrement: `step()` (R-067); `beaconFlash`, `shake/shakeMag`: `lightBeacon()` (`beacon.ts`, strongest-wins rule) |
| `cam` | `src/systems/camera.ts` | – |
| `rng.*` | only through `rand*()` in `src/core/rng.ts` | – |
| `settings`, `best`, `result`, `ui.storageOk` | `src/ui/storage.ts` | `endRun()` in `src/core/run.ts` (`result`, `best`) |

## 7. Required assertions in `npm run check`

Placed in `src/checks/state.check.ts`, imported by `src/check.ts` (which must stay DOM-free):

1. `init()` round trip: `deepEqual(JSON.parse(JSON.stringify(init())), init())`.
2. Mid-run round trip: `s = init(); startRun(s, '12345'); for 600 steps update(s, scriptedInput(k), 1/60)`, then JSON round trip deep-equals `s`. `scriptedInput` builds `Input` with fresh `Set`s from a fixed script. No `undefined`, `NaN`, `Infinity` anywhere (walk the tree).
3. `migrate` idempotency on: `init()`, the mid-run state, a state with `player.roll` deleted, a state with one monster missing `stunned`, `{ version: 0 }`, `null`, `5`. Assert `deepEqual(migrate(migrate(x)), migrate(x))` and that filled fields equal their defaults.
4. `migrate` does not change valid values: `migrate(midRun)` deep-equals `midRun`.
5. Entity default completeness: `keys(DEFAULT_MONSTER)` equals `keys(spawnMonster(...))`, same for pickups, veins, rocks, fx events, toasts.
6. Budget: `JSON.stringify(midRunState).length < 300_000` ([[architecture-scale-and-economy-4]] §1.1).

## 8. Size budget

Map 320×240 (76 800 tiles); values from [[architecture-scale-and-economy-4]] §1.1 (typical = late escape at D\*, worst = bd 690).

| Part | Typical | Worst |
|---|---|---|
| `world.tiles` (76 800 chars) | 76.8 KB | 76.8 KB |
| `world.explored` (2 400 words) | 14 KB | 28.8 KB |
| `veins` + `pickups` (validator caps #11: ≤ 80, ≤ 60) | 3.6 KB | 7.5 KB (11.9 KB at caps) |
| `monsters` ≤ 24 alive (`MONSTERS_MAX` 24) | 3.2 KB | 9.6 KB |
| `rocks` ≤ `ROCKS_MAX` 200 + `pendingMax` 4 | 14.5 KB | 25.7 KB |
| `fx.events` ≤ 32 + rest | 4.3 KB | 6.7 KB |
| **Total** | **≈ 116 KB** | **≈ 155 KB (≈ 160 KB at #11 caps); soft budget 180 KB, hard check 300 KB** |

`migrate` deep-fill over this is well under 1 ms; it runs only on swaps.

## 9. Open questions

- **Q1 (main.ts):** `Input.mouse` is in CSS px. Aim in world space is `facing = atan2(mouse.y - h/2 + (cam.y - p.y), mouse.x - w/2 + (cam.x - p.x))` (camera centred on screen), which needs the viewport `w`, `h`; `update` does not receive them and `render` must not write State (§1 of [[architecture-state]]). **Proposed:** additive host change in `main.ts`: `Input.view: { w: number; h: number }` updated in `resize()`. Already anticipated in [[last-ember-open-questions]] #9. Needs owner approval because `main.ts` is the stable host. Fallback without approval: `window.innerWidth/innerHeight` read inside the aim helper (DOM read in update; breaks the DOM-free check, so the check must pass a fake view).
- **Q2:** effect persistence across a resin relight is OPEN in the spec; State supports both (`activeMineral` is independent of `energy`). Default: kept.
- **Q3:** escape-phase hit rule (energy no longer used) is inferred from "no torch" in the spec; confirm with saile2204.

## Related

- [[architecture]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-determinism]]
- [[architecture-scoring-and-save]]
- [[architecture-resources]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[last-ember-open-questions]]
- [[index]]
- [[vite-canvas-hmr-state-preservation]]

---
type: architecture
title: Last Ember – Architecture Rulings (binding conflict resolutions)
description: Part 2 of 2 – binding rulings R-066 to R-107 for systems and monster AI, render and audio, UI/assets/host, and the 320x240 scale rulings; the consolidated State additions list; the owner decisions that need a product or approval answer; and the gaps that no spec covers, each with a proposed owner file and slice.
tags: [project, ai-jam-5, architecture, last-ember, rulings]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Architecture Rulings (2/2)

Part 2 of 3. Part 1 (precedence, layer rule, how to apply, severity key, R-001–R-065): [[architecture-rulings]]. Part 3 (R-108–R-125: cave-generator GAP closures, scale follow-ups, Beacon gate timing): [[architecture-rulings-3]]. Hub: [[architecture]], [[index]]. Product spec: [[last-ember-design]]. Precedence and severity key are in part 1 §0 and apply here unchanged.

## 6. Systems and monster AI

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit (file §: old → new) | Applies |
|---|---|---|---|---|---|---|
| R-066 | M | bite latch test | [[architecture-systems-3]] §4 end-point `d <= rp + rm + slack`; [[architecture-monsters-ai]] §5.1 swept capsule (MS-6) | Capsule wins (newer refinement): `segDist(m.lastX, m.lastY, m.x, m.y, p.x, p.y) <= rp + rm + K.biteSlackPx`, `segDist` from `src/core/math.ts`. | systems-3 §4 pseudo-code line | first combat PR |
| R-067 | M | hitstop | [[architecture-tuning]] §6 `parry.hitstopS`; no State timer (core G3); [[architecture-systems-4]] §4 "decremented only by `step()`" | `fx.hitstop: number` (s, default 0). Set to `T.parry.hitstopS` (0.06) on a perfect parry. Only `step()` decrements it. While `> 0` only the clocks advance, then `return`. `tickFx` never touches it. | state-2 §7 `Fx` type; systems §1.3 skeleton | first combat PR |
| R-068 | M | swing buffer in hitstop | [[architecture-systems]] §1.3: a click survives through `swing.buffer`; the hitstop branch returns before `stepSwing` (MS-25) | Hitstop branch: `if (input.clicks.length > 0) s.player.swing.buffer = T.swing.bufferS`. `player.swing.buffer: number` (default 0). It is not decremented during hitstop. | systems §1.3 hitstop branch | first combat PR |
| R-069 | m | `lungeDir` lock time | [[architecture-state-2]] §2 "locked at windup start"; monsters-ai §5 tracks during windup, locks at lunge start (MS-22) | Monsters-ai. | state-2 §2 comment | first AI PR |
| R-070 | m | latch pin one step late | monsters-ai §5 pins at #12; systems-3 §4 latches at #14 (MS-23) | Accepted as is. Do not reorder. | none | – |
| R-071 | m | `randRange` form | monsters-ai §5, ai-2 §5 short form `randRange(K.lungeCdS)` (MS-12) | Full form `randRange(s, 'gameplay', lo, hi)`; tuples spread `...K.lungeCdS`. | monsters-ai §5, ai-2 §5 | first AI PR |
| R-072 | m | `stepRoll` literals | systems-3 §6 `420`, undefined `sprint` (MS-13) | `T.roll.speedPxS`, `T.player.walkPxS * T.escape.sprintMul`. | systems-3 §6 | escape PR |
| R-073 | M | entering `dying` / `recover` | systems-4 §4, systems-3 §4.1: the AI emits `monsterDie` and sets timers; `damagePlayer`, `resolveParries`, `lightBeacon`, `landRock` assign `m.ai` directly (MS-7) | Only `setDying(s, m)` and `toRecover(s, m)` in `src/systems/monsters.ts` change these states. `toRecover` uses escape values in escape. Kills are counted by the caller (parry, lit hit), never by Beacon or rock deaths. | systems-3 §3, §4.1; systems-2 §5 step 4; rocks-2 §3 | first AI PR |
| R-074 | m | literals not in `T` | MS-14 list | Add to `T`: `escape.frictionMul 2`, `escape.attackSlots 3`, `escape.chaseMul 1.3`, `escape.interceptS 0.3`, `escape.recoverS 0.4`, `ai.recoverBackPx 40`, `ai.stalkerRetreatPx 60`; use `T.hurt.flashS` and `T.player.radiusPx + T.pickup.radiusPx`. | [[architecture-tuning]] §1.1, [[architecture-tuning-2]] | first tuning PR |
| R-075 | m | brain type | monsters-ai §1 gives none (MS-11) | `type Brain = (s: State, m: Monster) => [number, number]`. | monsters-ai §1 | first AI PR |
| R-076 | m | debug data | ai-2 §9 shows λ and relocates (MS-15) | `lungeHazard(s, m): number` exported from `systems/monsters.ts`; `director.relocates: number` (default 0). | ai-2 §9 | slice C |
| R-077 | M | URL seed into State | MS-2 proposes `ui.urlSeed` + `copyLink` event; [[architecture-ui]] §7 `?seed=` pre-fills `ui.seedInput` | No `ui.urlSeed`. `platformStep` (R-003) reads `readSeed()` once per page (flag `getResources().ui.urlRead`, registry, survives hot swap) and writes `ui.seedInput`. `KeyC`/Copy button: `stepScreens` emits `copyLink`; `platformStep` performs the clipboard write and writes `ui.copied`/`ui.copyMsg` on the next step from `res.ui.copyResult`. | modules-systems S2 bullet, modules-systems-2 §3 rows `ui.urlSeed` removed | first UI PR |
| R-078 | m | storage load at runtime | MS-16, state-2 §9 | `stepScreens` calls `loadSettings`/`loadBest` (L0) once, guarded by `settings.loaded`. | none | – |
| R-079 | m | escape and order checks | none specified (MS-21) | `escape.check.ts` and `order.check.ts` are adopted; the order spy uses no test hook in `step.ts` – instead (e) is dropped, (a)–(d) stay. | modules-systems-2 §1 `order.check.ts` row (e) | first check PR |
| R-080 | m | two `score.check.ts` | [[architecture-modules-core]] §4 and [[architecture-modules-systems-2]] §1 both define it | One file, owned by core; it also asserts the 5488 worked win. | modules-systems-2 §1 row → "see core" | first save PR |
| R-081 | m | single `systems.check.ts` | systems-4 §8 one file; 300-line rule (MS-20) | Split per modules-systems-2 §1. | systems-4 §8 heading | first check PR |
| R-082 | M | duplicate event kinds | systems-4 §6 adds `windup`, `lunge`, `dodge` and encodes resin as `relight a=1`, empty toss as `toss a=-1`; [[architecture-resources-2]] §8 adds `telegraph`, `lunge`, `resin`, `denied`, `uiMove`, `uiConfirm`, `uiBack`, emitter `src/entities/monster.ts` | Union adds exactly: `dodge`, `windup`, `lunge`, `uiMove`, `uiConfirm`, `uiBack`, `copyLink`. `telegraph` = `windup`; `resin` = `relight a=1`; `denied` = `toss a=-1`. Windup/lunge are emitted by `src/systems/monsters.ts`. `TRIGGERS` maps these. **Refined 2026-10-18:** `denied` is ALSO a member (Beacon START GATE, a separate emitter `stepBeacon`; empty toss stays `toss a=-1`). Authoritative union: [[architecture-state-2]] §7. | resources-2 §8 list and emitters (applied 2026-10-18); [[architecture-ui-2]] §8 last row; [[architecture-modules-render-2]] §3 last row | first audio PR |
| R-083 | M | light query names | render specs call `inLight(s, x, y)` and `lightSources(s)`; [[architecture-modules-systems]] S8 exports `insideLight(s, x, y, pad = 0)`, no `lightSources` | `insideLight` is the name. `src/systems/light.ts` also exports `lightSources(s: State): { x: number; y: number; r: number; kind: FlameKind \| 'beacon' \| 'shaft' \| 'ember' }[]`. Status 2026-10-20: not implemented; render/light.ts builds its own mask sources (A16, #31). Owner decision pending: add lightSources to systems/light.ts or amend this ruling. | [[architecture-render-2]] §5.6, modules-render §2 S5 and §3 rows: `inLight` → `insideLight`; modules-systems S8 add `lightSources` | first render PR |

## 7. Render and audio

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-084 | M | zoom | [[architecture-host-changes]] §1 `zoom = h / 360` fractional; [[architecture-render]] §4.1 integer `max(1, round(ch / 480))` (render C1) | Integer device zoom (R-018 helpers). Aim maths uses `viewZoomCss(h)`. **Superseded by R-131:** `viewZoomCss(h, dpr)` = `deviceZoom(Math.round(h * dpr)) / dpr`. | host-changes §1 zoom formula → pointer to render §4.1 | first render PR |
| R-085 | m | `drawTiles` args | render §2 3 args; §3 sketch 4 (C3) | `drawTiles(ctx, s, v, q)`. **Superseded/renamed by [[ADR-123-2-5d-view]] (R-180):** `drawTiles` becomes `drawFloor(ctx, s, v, q)` + `drawWallRow(ctx, s, v, ty)`; the 4-arg `q` form carries over to `drawFloor`. | render §2 row | render PR |
| R-086 | m | memory map | render §2 `drawMemory`; render-2 §5.3 `memoryCanvas(s)` (C4) | `memoryCanvas(s)`. | render §2 row | render PR |
| R-087 | m | file split | render §2 eyes in entities, glow in light (C5) | `src/render/glow.ts` and `src/render/props.ts` per modules-render §3. | render §2 map | render PR |
| R-088 | m | glow sprite id | render-2 §3.2 `'eye'`; render-3 §1 hex key (C6) | `drawGlowSprite(ctx, hex: string, x, y, r, alpha): void`. | render-2 §3.2 call | render PR |
| R-089 | m | cache key strings | render-2 §5.4, render-3 §4–§5 vs resources §2–§3.1 (C7–C9) | Resources formats: `'m:' + LIGHT_VERSION + ':' + kind + ':' + b`, `'v:' + hex + ':' + W + 'x' + H`, `'id\|anim\|i\|hex'`. | render-2 §5.4; render-3 §4, §5 | render PR |
| R-090 | m | frame timing | render-3 §3.3 `frameEnd` not exported (C10) | `qualityTick(s)` takes the end timestamp itself. | render-3 §3.3 | slice C |
| R-091 | M | AudioContext disposal | [[architecture-assets-audio]] §7, [[architecture-assets-pipeline]] §7: close in `import.meta.hot.dispose`; resources §0: one context per page, never disposed (render C11, ui C4) | One context per page, kept in the registry, never closed; listeners via the `installAudioListeners` trampoline. | assets-audio §7 and pipeline §7 dispose sentence → "superseded by R-091" | first audio PR |
| R-092 | m | audio maths wording | assets-audio §9.2 danger, §6 `random()`, §7 "every 250 ms", §4 pan `viewW/2` (C13–C16) | [[architecture-resources-2]] §5, §7, §3 versions (distance falloff + hp term; `hash2(e.seq, …)`; retry every step; fixed 240). | assets-audio §4, §6, §7, §9.2 | first audio PR |
| R-093 | m | synth ownership | resources-2 §1 both synth files export `SYNTH`; `PlayParams` in two files; helpers unlisted (C17–C19) | Per modules-render-2 §1: `synth-2.ts` exports `SYNTH`; `PlayParams` owned by `trigger.ts`; exports `applyDucks`, `pruneVoices`, `warnOnce`. | resources-2 §1 row; resources-3 §1 import | first audio PR |
| R-094 | m | screen draw module | render §2 `drawScreen` in `src/ui/menus.ts`; resources-2/3 `src/ui/screens.ts` (C20) | `drawScreen(ctx, s, w, h)` in `src/ui/menus.ts` (no `src/ui/screens.ts` exists, R-003). | resources-2 §8, resources-3 §3 path | first UI PR |
| R-095 | m | preload caller | modules-ui-assets §1 `game.ts render` step 1; modules-render-2 G2 `render/index.ts` | `render/index.ts` calls `startPreload(res)` when `!res.images.started`; `game.ts` `render` only delegates and then draws debug. | modules-ui-assets §1 render row | first render PR |
| R-096 | B | facade body | modules-ui-assets §1: `uiStep` first, systems only when playing, audio last; modules-render S4: `step` then `audioStep` | `update(s, input, dt)`: (1) dev-only Backquote toggles `res.debug.on`; (2) `step(s, input, dt)` (it runs `stepScreens` first and world systems only when playing); (3) `platformStep(s)`; (4) `try { audioStep(s, input) } catch (e) { warnOnce(e) }`. `render` = `renderFrame` then dev `drawDebug`. | modules-ui-assets §1 `update`/`render` rows; modules-render §2 S4 | first facade PR |

## 8. UI, assets, host

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-097 | m | `ui_cursor` | [[architecture-assets-sprites-3]] §3 sprite; [[architecture-ui]] §6 CSS crosshair (ui C1) | CSS crosshair; remove `ui_cursor` from catalog and `SPRITES`. | assets-sprites-3 §3 | first art PR |
| R-098 | m | released edges | ui §5 rule 2 "pressed/released"; host-changes §1 no `released` set (ui C2) | No `released` set; buttons act on press. | ui §5 rule 2 | – |
| R-099 | m | favicon | host-changes-2 §8 inline SVG; pipeline §2 `public/favicon.png` (ui C14) | Inline SVG until a PNG is delivered. | none | – |
| R-100 | m | audio files / CI budget | host-changes-2 §9 "no .ogg files", budget 512 KB; pipeline `.ogg`+`.m4a`, `dist/` ≤ 9 MB (ui C12, C13) | Samples allowed with synth fallback; budget 9 MB. | host-changes-2 §9 | first audio/CI PR |
| R-101 | m | debug frame times | host-changes `debug.frameMs: number[]` in State; resources §2 `res.perf.frameMs` (ui C15) | Frame times live in `res.perf` (registry), never in State. | host-changes §2, host-changes-2 §7 | slice C |

### 8.1 Scale rulings (map 320×240, added 2026-10-18)

Source: [[architecture-scale-and-economy]] (SAE1), [[architecture-scale-and-economy-4]] (SAE4). Edits are listed in SAE4 §3 (edit manifest).

| ID | Sev | Topic | Conflicting statements | RULING | Exact edit | Applies |
|---|---|---|---|---|---|---|
| R-102 | B | map size and layout | [[architecture-state]] §3 `160×120`; owner decision 2026-10-18 | `MAP_W = 320`, `MAP_H = 240` (76 800 tiles), macro-cell layout with new streams `'cave:macro'`, `'cave:spine'`, `beaconDist` band 510–690 (fallback `>= 459`) (SAE1 §1–§3, §6; SAE4 §2). | SAE4 §3 rows 1–7, 27–46, 60, 63 | first generator PR |
| R-103 | B | path field type | WQ2 §2, CG1 §7, R-065: `Int16Array` (max 32 767) | All path/distance fields and BFS outputs are `Int32Array` (`w·h = 76 800 > 32 767`); one shared BFS queue; exit field ping-pong buffers (SAE1 §2.4; SAE4 §1.2). | SAE4 §3 rows 9, 13, 17, 21, 33, 34, 36, 62, 64, 70 | first world PR |
| R-104 | M | State size limit | [[architecture-state-3]] §7 #6 `< 200_000`, §8 ≈ 65 KB | Soft budget 180 KB; hard check `JSON.stringify(midRunState).length < 300_000`; worst ≈ 160 KB at `ROCKS_MAX` 200 (SAE4 §1.1). | SAE4 §3 rows 10, 11, 61 | first check PR |
| R-105 | M | host step budget (**needs owner approval**, `main.ts` edit) | [[architecture-host-changes]]: `MAX_FRAME` clamp only, no host change | Add `STEP_BUDGET_MS = 12` wall-time bailout around the fixed-step loop: drop the backlog (`acc = 0`) when exceeded; one generation attempt per frame (SAE4 §1.8). Without approval: generation still chunks, but a frame may run up to 15 attempts. | SAE4 §3 rows 55, 57, 59 | host PR (OD-1 batch) |
| R-106 | M | rocks BFS cost | [[architecture-rocks]] §4.4, [[architecture-rocks-2]] §5: 7 full BFS ≈ 1.8 ms at 19 200 cells | `routeDist` early exit at the first tile with `0 <= E[t] < eF`, visit cap `ROUTE_VISIT_MAX = 19 200` (exceeded → `-1`, conservative); per-step worst 6 capped + 1 full ≈ 3.0 ms (SAE4 §1.5). | SAE4 §3 rows 18, 20–22, 24, 26, 64 | first rocks PR |
| R-107 | m | check budgets | cave 62 gens < 1 500 / < 120 ms; rocks seeds 1..24 < 3 000 ms; world test 13 < 100 ms; total target < 5 s | Cave < 6 000 ms total, < 200 ms max, ≥ 50 of 62 on attempt 0; rocks seeds 1..12 × 150 ops < 8 000 ms (oracle uncapped); world test 13 < 400 ms; `npm run check` target < 15 s, hard < 30 s (SAE4 §1.10). | SAE4 §3 rows 19, 25, 45, 56, 65 | first check PR |

## 9. State additions (consolidated, binding)

All additive: defaults in `init()` / `initPlayer()` / `spawnMonster()` and in the `DEFAULT_*` templates of [[architecture-state-3]] §3, no `STATE_VERSION` bump. Union-typed strings keep all-string unions (`fill` checks `typeof`).

| Field | Type, default | Source |
|---|---|---|
| `fx.hitstop` | number, `0` | R-067 |
| `player.swing.buffer` | number, `0` | R-068 |
| `Monster.contactT` / `stuckT` / `behindT` | number, `-1` / `0` / `0` | [[architecture-systems-4]] §6 |
| `Monster.lastX`, `lastY` | number, spawn x/y | systems-4 §6 |
| `Monster.fleeing` | boolean, `false` | systems-4 §6 |
| `Monster.beat`, `Monster.ringRadius` | `beat`: number, `0` (beat index during windup, [[architecture-state-2]] §2; beats per kind stay in `T.monsters[k].beats`); `ringRadius`: number (monsters-ai §2) | state-2 §2; monsters-ai §2, §5; R-130 |
| `Pickup.size` | `'small' \| 'large'`, `'small'` | systems-4 §6 |
| `world.exploreKey` | number, `-1` | systems-4 §6 |
| `world.pendingSig`, `world.beaconLitAt` | number, `0`, `0` | [[architecture-rocks]] §1; [[architecture-ui-2]] §8 |
| `director.escapeT`, `director.relocates` | number, `0`, `0` | rocks §1; R-076 |
| `Rock.shrunk` | boolean, `false` | rocks §1 |
| `Debug.overlay` | boolean, `false` | systems-4 §6 |
| `ui.hover` `-1`, `ui.screenAt` `0`, `ui.helpFrom` `'title'`, `ui.confirmT` `0`, `ui.denyT` `0`, `ui.copyMsg` `''` | as listed | ui-2 §8 |
| `settings.reducedFlash` `false`, `settings.quality` `'auto'` | as listed | ui-2 §8 |
| `FxEventKind` + `dodge`, `windup`, `lunge`, `denied`, `uiMove`, `uiConfirm`, `uiBack`, `copyLink` | union, see [[architecture-state-2]] §7 | R-082 (refined) |

Rejected: `ui.urlSeed` (R-077), `debug.frameMs` (R-101), kinds `telegraph`/`resin` (R-082). Not State: `Input.view` (host type), registry fields `res.hud`, `res.ui.urlRead`.

## 10. Owner decisions (not ruled)

| ID | Question | Options | Recommendation |
|---|---|---|---|
| OD-1 | Approve the `src/main.ts` host edits ([[architecture-modules-ui-assets-2]] §1: `Input.view`, left-button filter, `contextmenu`, blur/visibility → `'Blur'`)? | a) approve as one medium-tier PR; b) refuse (no view size, right click parries, no pause on blur) | a) – they are required for spec features (pause, aim) |
| OD-2 | dprCap 1-line `main.ts` change (render Q1) | a) add; b) skip, quality levels 1–2 skip that step | b) for the jam; revisit after a perf measurement |
| OD-3 | Replace `index.html` (title, black background, crosshair cursor) | a) approve; b) keep the template | a) |
| OD-4 | Optional CI size-budget step (9 MB) | a) add now; b) skip | b) until the first art PR; then a) |
| OD-5 | `?seed=` on itch.io: the iframe probably does not receive the page query ([[architecture-scoring-and-save]] §5). Spec demands a URL seed | a) keep URL + title seed field + seed shown on end screen; b) also define `SHARE_BASE` once the itch page exists | a) now, b) on first upload |
| OD-6 | P2 safe-route glow (rocks-2 §6) may make the escape too easy | a) ship off; b) ship on; c) setting | a); decide after playtest |

## 11. Gaps with no spec

| Gap | Missing | Proposed owner file / slice |
|---|---|---|
| G-01 | typed signatures: `fixDiagonals`, `carveDisc`, `placeEntrance`, `placeBeacon`, `pickLoopPairs`, `brush`, `dilate`, `reopen`, `wide2`/`main`/`nearMain` builders, teach placement, `populate`, `pickMineral`, `fallbackCave` (world C14) | `src/world/gen/*.ts`, W-gen; implementer types them in slice A/B and writes them back into [[architecture-cave-generation]] §1 / [[architecture-cave-generation-2]] §2–§6 |
| G-02 | tuning group for placement quotas (world C17) | gen-local `const`s in `src/world/gen/populate.ts` (caves never regenerate on hot swap, so live tuning gains nothing); slice B |
| G-03 | UI layout and draw-helper signatures, `STR`/`HELP` shapes (ui G1) | `src/ui/layout.ts`, `draw.ts`, `strings.ts`; slice A, written back to [[architecture-ui]] §2 |
| G-04 | `findSpawn` return type, `parryLoss` param types | `{ x: number; y: number } \| null`; `(d: number, kind: MonsterKind, mineral: FlameKind)`; systems slice A |
| G-05 | `atlas.json` must exist before any art (ui G3) | commit the empty seed file in the first assets PR; `pack-atlas` writes the same for zero frames. **Superseded by [[ADR-123-2-5d-view]] (R-183):** no packer; `atlas.json` is a hand-kept v2 index listing the two external atlases ([[architecture-assets-pipeline]]) |
| G-06 | `FLAME` table (`radiusMul`, `flickerFreq`) imported by render from `src/systems/flame.ts`, never specified as an export | `src/systems/flame.ts` exports `FLAME: Record<FlameKind, { radiusMul: number; flickerFreq: number }>` from `T`; slice A |
| G-07 | registry types `res.hud`, `res.ui.urlRead` (R-060, R-077) | `src/assets/resources.ts` `Resources` type; bump `RES_VERSION`; slice B |
| G-08 | `escape.check.ts` thresholds beyond the listed ones | systems-escape owner; slice B |

Closed gaps (now ruled): escape-marker rendering (R-060), math module (R-016), `saveSettings` name (R-026), audio step name (R-096), run id / tiles hash (R-036), LOS helper (R-013), `exitHeading` type (R-059), `downhill` type (R-065).

## Related

- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[architecture-scale-and-economy]]
- [[architecture-scale-and-economy-4]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-systems-2]]
- [[architecture-modules-render]]
- [[architecture-modules-render-2]]
- [[architecture-modules-ui-assets]]
- [[architecture-modules-ui-assets-2]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-3]]
- [[architecture-systems-4]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-rocks]]
- [[architecture-rocks-2]]
- [[architecture-cave-generation]]
- [[architecture-cave-generation-2]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-sprites-3]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-scoring-and-save]]
- [[ADR-123-2-5d-view]]

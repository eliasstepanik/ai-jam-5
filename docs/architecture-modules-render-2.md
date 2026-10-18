---
type: architecture
title: Last Ember – Module Tree – Render and Audio (2/2) – Audio Files, Checks, State Additions, Conflicts
description: Part 2 of the authoritative src/ file list for Last Ember render and audio – the src/audio files with exported signatures, allowed imports, slice tags and the game.ts call site, the checks that cover render- and audio-adjacent pure logic, the State additions those checks and modules imply, and the full list of conflicts and gaps between the source specs with the winning side and the exact edit.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:30:00Z
---

# Last Ember – Module Tree: Render and Audio (2/2)

Part 2 of 2. Part 1 (layer rule, seams S1–S8, render files, render import graph): [[architecture-modules-render]]. Siblings: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-ui-assets]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]].

## 1. Audio files (`src/audio/`)

All audio files are NEW. `trigger.ts` is DOM-free but is NOT imported by checks (L4; [[architecture-rulings]] R-043). The others touch `AudioContext`/`document` only inside calls, never at import time; checks still never import them ([[architecture-resources]] §7). No audio module adds `import.meta.hot.dispose`, timers or rAF ([[architecture-resources]] §3.1, §5).

| Path | N/E | Responsibility | Exported symbols (signatures from spec) | Allowed imports | Spec | Lines | Owner | Slice |
|---|---|---|---|---|---|---|---|---|
| `src/audio/trigger.ts` | NEW | pure tables: event → sound, danger scalar, music per screen, ducks per screen | `type Trigger = { id: (e, s) => SoundId; params: (e, s) => PlayParams }`; `type PlayParams = { x?: number; y?: number; q?: number; mineral?: FlameKind; rate?: number; gain?: number; delay?: number; seq: number }` (C18); `TRIGGERS: Record<FxEventKind, Trigger \| null>`; `danger(s: State): number`; `musicFor(s: State)` → music id string; `duckFor(s: State)` → `{ music, amb, sfx, ui }` in dB | core types (`State`, `FxEventKind`, `FlameKind`), `src/systems/light.ts` `lightRadius`, `src/assets/sounds.ts` (`SoundId`, `SOUNDS`), `src/core/state.ts` `MINERALS` (R-034); `mineDone a = -1` maps to `sfx_mine-empty` without a mineral (R-134) | [[architecture-resources-2]] §4, §5, §8 | ~120 | audio | B (P0 rows, `danger`), C (`musicFor` escape/stingers, all ducks) |
| `src/audio/engine.ts` | NEW | per-step entry; unlock/resume/suspend; DOM listener trampoline; event cursor; decode queue | `audioStep(s: State, input: Input): void`; `installAudioListeners(res: Resources): void`; `unlock(res: Resources)`; `warnOnce(e: unknown): void` (GAP, C19) | `trigger.ts`, `mixer.ts`, `music.ts`, `sfx.ts`, `synth.ts` (`noiseBuffers`), `src/assets/resources.ts`, `src/assets/sounds.ts`, `import type { Input } from '../main.ts'` | [[architecture-resources-2]] §1, §2, §8; [[architecture-resources]] §5–6; [[architecture-resources-3]] §4–5 | ~170 | audio | B |
| `src/audio/mixer.ts` | NEW | group gains → duck gains → master → `masterLp` → compressor → destination; rebuild on `MIXER_VERSION` change | `MIXER_VERSION: number`; `ensureMixer(res: Resources): void`; `setDuck(res, group, db, tc): void`; `setMaster(res, vol: number, muted: boolean): void`; `applyDucks(res, d)` (GAP, C19) | `src/assets/resources.ts`, core types | [[architecture-resources-2]] §3; [[architecture-assets-audio]] §4 | ~90 | audio | B |
| `src/audio/music.ts` | NEW | seamless loops, crossfade on track change, sample-synchronous danger layer, late-start phase fix | `musicStep(res: Resources, s: State): void` | `trigger.ts` (`musicFor`, `danger`), `src/assets/sounds.ts` (loop points), registry | [[architecture-resources-2]] §5 | ~140 | audio | B (`mus_descent` base, P0), C (danger layer, title, escape, stingers) |
| `src/audio/sfx.ts` | NEW | one-shot play with caps, re-trigger guard, priority stealing, hash variation, pan/distance; State-driven loops | `play(res, id: SoundId, p: PlayParams): void`; `loopStep(res, s: State): void`; `stealFor(res, id: SoundId)`; `pruneVoices(a: AudioRes): void` (GAP, C19) | `synth-2.ts` (`SYNTH`), `synth.ts` (types), `src/assets/sounds.ts`, `src/core/noise.ts` `hash2` (C2), registry, core | [[architecture-resources-2]] §6, §7; [[architecture-assets-audio]] §6 | ~180 | audio | B (flame loop, play, caps), C (heartbeat, beacon charge, rumble, growl picker) |
| `src/audio/synth.ts` | NEW | recipe contract, node helpers, noise buffers, recipe classes WHOOSH, PERFECT PARRY, HISS, THUD | `type Recipe = (a: AudioRes, out: AudioNode, t: number, p: PlayParams) => AudioScheduledSourceNode[]`; `noiseBuffers(ctx)`; helpers `env`, `noise`, `osc`, `biquad`, `hashOffset` exported for synth-2 (C17); class recipes | `import type` from `trigger.ts` (`PlayParams`), registry types, core types | [[architecture-resources-3]] §1, §1.1, §2.1–2.4 | ~250 | audio | B |
| `src/audio/synth-2.ts` | NEW | recipe classes RUMBLE, GROWL, HEARTBEAT, HORN, CHIMES/UI; the complete recipe table | `SYNTH: Record<SoundId, Recipe \| null>` (C17) | `synth.ts`, `src/assets/sounds.ts` (type), core types | [[architecture-resources-3]] §2.5–2.9; [[architecture-assets-audio-2]] §2–8 | ~250 | audio | B (P0 recipes), C (P1/P2 recipes) |

Audio import graph (no cycles): `engine → trigger, mixer, music, sfx, synth`; `music → trigger`; `sfx → synth-2 → synth → (type) trigger`. No audio file imports render or ui. ui reads `res.audio.state` (seam S6).

### 1.1 Facade edit

| Path | N/E | Change | Spec | Owner | Slice |
|---|---|---|---|---|---|
| `src/game.ts` | EDIT | facade per [[architecture-rulings-2]] R-096 (+ R-133): `update` = dev toggles (Backquote, `Shift+Digit1..6`), `step`, `platformStep`, `try { audioStep(s, input) } catch (e) { warnOnce(e) }`; `render` = `renderFrame` then dev `drawDebug` (seam S4) | [[architecture-resources-2]] §1 | core tree | A (render), B (audio) |

### 1.2 Sound ids by slice ([[architecture-assets-audio-2]] §9)

- **B (P0, all synth, zero files):** `mus_descent`, `amb_cave`, `sfx_flame-loop`, `sfx_flame-toss-sodium`, `-copper`, `-strontium`, `sfx_flame-shakeoff`, `sfx_flame-out`, `sfx_relight`, `sfx_swing`, `sfx_parry`, `sfx_parry-perfect` (synth layers), `sfx_parry-bad`, `sfx_mine-hit`, `sfx_mineral-collect`, `sfx_resin`, `sfx_plant-heal`, `sfx_eye-open`, `sfx_mon-lunge`, `sfx_mon-hit`, `sfx_mon-death`, `sfx_hurt`, `sfx_beacon-ignite`. Note `mus_descent` and `amb_cave` are files; without them B has the §2.5 ambience fallback and silent music.
- **C:** music layers and stingers, P1 SFX (`sfx_roll`, heartbeat, beacon charge/horn, rumble, rocks, growl, devourer beat, player death, UI) and P2.

## 2. Checks covering render/audio-adjacent pure logic

Checks run under Node via `npm run check` and import only L0–L3 ([[architecture-rulings]] R-043 supersedes the original table below: `render.check.ts` covers only `src/core/noise.ts` and `src/core/view.ts`; `audio.check.ts` is NOT created). The runner wiring (`run()` exports, `src/checks/all.ts`) is R-040, owned by [[architecture-modules-core]].

| Check file | Imports | Assertions |
|---|---|---|
| `src/checks/render.check.ts` | `src/core/noise.ts`, `src/core/view.ts` | `hash2` in `[0, 1)` and deterministic; `vnoise` within `[-1, 1]`; `quantAngle(0.2) === Math.PI / 8`; **quantisation:** `deviceZoom(720) === 2`, `deviceZoom(1080) === 2`, `deviceZoom(1440) === 3`, `deviceZoom(2160) === 5`, always an integer ≥ 1; `viewZoomCss(720, 2) === 1.5`, `viewZoomCss(h, dpr) * dpr === deviceZoom(Math.round(h * dpr))` (R-131) |
| ~~`src/checks/audio.check.ts`~~ | not created (R-043) | `TRIGGERS`/`SYNTH` completeness is tsc-enforced (`Record<FxEventKind, …>`, `Record<SoundId, …>`); the `SOUNDS` id format (43 ids after R-138) is checked by `scripts/check-assets.ts`; `danger()`, `musicFor`, `duckFor`, `keys.ts` formulas stay browser-verified |

Not checked (DOM-bound, verified in the browser): `drawSprite`, darkness compositing, mixer graph, recipes. `SYNTH` completeness is tsc-enforced by `Record<SoundId, Recipe | null>`.

## 3. State additions required

From [[architecture-render-3]] §9 and [[architecture-resources-2]] §8. All additive, defaults in `init()`, `migrate` fills missing keys only.

| Field | Type, default | Needed by |
|---|---|---|
| `world.beaconLitAt` | `number`, `0` | `beaconBlend` (render), `musicFor` escape start (audio) |
| `settings.quality` | `'auto' \| 'q0' \| 'q1' \| 'q2' \| 'q3'`, `'auto'` | `currentQuality` |
| `settings.reducedFlash` | `boolean`, `false` | `shakeOffset`, overlays |
| `FxEventKind` members per [[architecture-rulings-2]] R-082 (refined): `dodge`, `windup`, `lunge`, `denied`, `uiMove`, `uiConfirm`, `uiBack`, `copyLink` (`telegraph`/`resin` are NOT members) | additive union change | `TRIGGERS` |

Fields read but assumed to exist in [[architecture-state]] (verify in [[architecture-modules-core]]): `fx.events[]` with `seq`, `kind`, `a`, `x`, `y`; `fx.shake`, `fx.shakeMag`, `fx.flare`, `fx.beaconFlash`; `player.hitFlash`, `energy`, `energyMax`, `hp`, `swing`, `roll`, `mining`; `meta.time`, `meta.steps`, `meta.seed`, `meta.screen`, `meta.phase`, `meta.zone`; `world.tiles`, `world.explored`, `world.beaconLit`, `beaconHold`; `settings.volume` (0.7), `settings.muted`; `debug.reveal`, `debug.showPaths`; a run id for `res.particles.runId` (G9) and `tilesHash` (G10).

## 4. Open questions

- **Q1** dprCap host change (seam S8): owner approval for the 1-line `main.ts` edit; without it quality levels 1–2 skip the dprCap step ([[architecture-render-3]] §3.2).
- **Q2** max light radius must stay below 180 world px or the light edge leaves the screen at 720p ([[architecture-render]] §4.1).

## 5. Conflicts and gaps found

| Id | Side A (file §) | Side B (file §) | Wins | Exact edit |
|---|---|---|---|---|
| C1 | [[architecture-host-changes]] §1 `zoom = h / VIEW_H`, `VIEW_H = 360`, fractional | [[architecture-render]] §4.1 integer device zoom `round(ch / 480)` | B (brief rule) | applied 2026-10-18: host-changes §1 uses `viewZoomCss(h, dpr)` (R-084 refined by R-131; `Input.view.dpr` added) |
| C2 | [[architecture-render]] §2 and [[architecture-render-2]] §1: `src/render/noise.ts` | layer rule: `src/assets/images.ts` (L1) uses `quantAngle`, `src/audio/sfx.ts` uses `hash2` | layer rule | move to `src/core/noise.ts`; render §2 row path; render-2 §1 heading; [[architecture-resources]] §7 check list `src/render/noise.ts` → `src/core/noise.ts` |
| C3 | [[architecture-render]] §2 `drawTiles(ctx, s, v)` | [[architecture-render]] §3 sketch `drawTiles(ctx, s, v, q)` | B (`q.decor`) | render §2 row: `drawTiles(ctx, s, v, q)` |
| C4 | [[architecture-render]] §2 `drawMemory(dctx, s, v, q)` | [[architecture-render-2]] §5.3 `memoryCanvas(s)` blitted by `drawDarkness` | B | render §2 memory row: export `memoryCanvas(s)` |
| C5 | [[architecture-render]] §2: `drawEyes` in entities.ts (~250), `drawGlow` in light.ts (~220) | 300-line limit; eyes need glow sprites, glow needs `torchTip` | split | add `src/render/glow.ts` (`drawEyes`, `drawGlow`, `drawGlowSprite`) and `src/render/props.ts` (veins, pickups, landmarks, rocks); entities.ts keeps monsters + player |
| C6 | [[architecture-render-2]] §3.2 `drawGlowSprite(ctx, 'eye', x, y, r, a)` | [[architecture-render-3]] §1 glow cache keyed by colour hex | B | define `drawGlowSprite(ctx, hex: string, x, y, r, alpha): void`; render-2 §3.2 call passes `'#6b4fb8'` or `'#b48cff'` |
| C7 | [[architecture-render-2]] §5.4 key `'m:' + kind + ':' + bucket` | [[architecture-resources]] §3.1 `'m:' + LIGHT_VERSION + ':' + kind + ':' + b` | B | render-2 §5.4 key string |
| C8 | [[architecture-render-3]] §4 `'v:' + bucketW + 'x' + bucketH` and `'v:' + hex + ':' + size` | [[architecture-resources]] §2 `'v:hex:WxH'` | B | render-3 §4: one key `'v:' + hex + ':' + W + 'x' + H` |
| C9 | [[architecture-render-3]] §5 tint key `id:anim:frame:hex` | [[architecture-resources]] §2 `'id\|anim\|i\|hex'` | B | render-3 §5 key separator |
| C10 | [[architecture-render-3]] §3.3 uses `frameEnd - frameBegin` | no `frameEnd` export anywhere | gap | `qualityTick(s)` takes the end timestamp; render-3 §3.3 text: "work time = `qualityTick` − `frameBegin`" |
| C11 | [[architecture-assets-audio]] §7 close AudioContext in `import.meta.hot.dispose` | [[architecture-resources]] §0, §3.1 no dispose, context reused | B (already decided) | assets-audio §7: "superseded by [[architecture-resources]] §0" |
| C12 | [[architecture-assets-audio]] §4 master default 0.8, §8 key `last-ember:audio` with group levels | [[architecture-resources-3]] §3 `last-ember:settings`, `volume` 0.7, no group sliders | B | assets-audio §4 default 0.7; §8 superseded note |
| C13 | [[architecture-assets-audio]] §9.2 danger `max(tele?1:0, low, ring/6)` | [[architecture-resources-2]] §5 adds distance falloff and `hp` term | B (refinement) | assets-audio §9.2: point to resources-2 §5 |
| C14 | [[architecture-assets-audio]] §6 variation `random(…)` | [[architecture-resources-2]] §7 `hash2(e.seq, …)` | B (no `Math.random`) | assets-audio §6 wording |
| C15 | [[architecture-assets-audio]] §7 music start "every 250 ms" | [[architecture-resources-2]] §5 retry every step | B (no timers) | assets-audio §7 wording |
| C16 | [[architecture-assets-audio]] §4 pan reference `viewW/2` | [[architecture-resources-2]] §3 fixed 240 | B (window-size independent) | assets-audio §4 formula |
| C17 | [[architecture-resources-2]] §1 `synth.ts`, `synth-2.ts` both "export `SYNTH`" | one `Record` cannot live in two files; splitting helpers both ways is a cycle | this tree | synth.ts: helpers, `Recipe`, `noiseBuffers`, classes §2.1–2.4; synth-2.ts imports synth.ts and exports the whole `SYNTH`; resources-2 §1 row |
| C18 | [[architecture-resources-2]] §8 `PlayParams` | [[architecture-resources-3]] §1 `PlayParams` in synth.ts | same shape; owner trigger.ts (pure, checked) | resources-3 §1: `import type { PlayParams } from './trigger.ts'` |
| C19 | [[architecture-resources-2]] §1 sketch calls `applyDucks`, `pruneVoices`, `warnOnce`, `resumeSoon`, `consumeSilently` | §1 export table lists none of them | gap | mixer exports `applyDucks(res, d)`; sfx exports `pruneVoices(a)`; engine exports `warnOnce(e)`; `resumeSoon`, `consumeSilently`, `consumeEvents` stay private to engine.ts |
| C20 | [[architecture-render]] §2 `drawScreen` in `src/ui/menus.ts` | [[architecture-resources-2]] §8 and [[architecture-resources-3]] §3 `src/ui/screens.ts` | A (R-094) | closed: `src/ui/menus.ts`; no `src/ui/screens.ts` exists (R-003) |
| G2 | [[architecture-resources]] §6 `startPreload(res)` on first render | not in render-1 §3 pass list | render-1 | `render/index.ts` calls `startPreload` when `!res.images.started`; registry mutation only, State untouched |
| G3 | `inView`, `beaconBlend` used in render-2 §3.2 and §5.3 | no module named | this tree | both in `src/render/view.ts` |
| G4 | quantisation and key formulas inline in DOM modules | checks may only import DOM-free modules | this tree | new `src/render/keys.ts` |
| G5 | `src/render/flame.ts` in render-3 §1 | missing in render-1 §2 map | render-3 | add row to render-1 §2 |
| G6 | `drawLandmarks` in render-1 §3 sketch | missing in render-1 §2 map | sketch | export from `props.ts` |
| G7 | brief slice B "escape marker" | no draw spec in the 8 files read | open | owner of escape marker (systems or ui tree) specifies it; render gets a `props.ts`/`overlay.ts` call only after that; no file invented here |
| G8 | `qualityTick(s)` in render-1 §3 sketch | missing in render-1 §2 map | sketch | export from `quality.ts` |
| G9 | `res.particles.runId` clears the pool | State run id field not named in the files read | core tree | verify field in [[architecture-state]] |
| G10 | `tilesHash` key | source (State field or derived) not named in the files read | core tree | verify in [[architecture-state]] |

No spec found that requires render ↔ audio imports. Render → ui (S1) is the only L4 → L4 edge; ui → registry (S6) is L4 → L1 and legal.

## Related

- [[architecture-modules-render]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-ui-assets]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-host-changes]]
- [[architecture-state]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]

---
type: architecture
title: Last Ember – Runtime Resources (1/3) – Registry, Lifecycle under Hot Reload, Memory, Preload
description: Last Ember runtime resources part 1 – the src/assets/resources.ts registry design (Resources type, getResources creation on first use, survival in import.meta.hot.data, data-in-registry code-in-modules rule), what happens on game swap, main.ts re-run and registry edits, the full lifecycle table of every non-serialised resource, listener rules, memory budget, preload sequence and loading screen, and DOM independence of checks.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Runtime Resources (1/3)

Part 1 of 3. Next: [[architecture-resources-2]] (audio engine: unlock, mixer, music, danger, voices, event triggers), [[architecture-resources-3]] (synthesis recipes, persistence, pause, failures). Render users: [[architecture-render]], [[architecture-render-2]], [[architecture-render-3]]. UI: [[architecture-ui]], [[architecture-ui-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]] (§5 "What is NOT in State"). Host: [[architecture-host-changes]] §2–4, [[architecture-host-changes-2]]. Loader: [[architecture-assets-pipeline]], [[architecture-assets-pipeline-2]]. Audio catalog: [[architecture-assets-audio]], [[architecture-assets-audio-2]].

## 0. KB conflicts resolved here (surface, do not hide)

| Topic | Source A | Source B | Decision (DEFAULT, architect) |
|---|---|---|---|
| AudioContext on module edit | [[architecture-assets-pipeline]] §7: `audio.ts` closes the context in `import.meta.hot.dispose` | [[architecture-host-changes]] §2: no dispose in `resources.ts`, context outlives edits | **B + this brief:** the context is created once per page and reused; no module disposes it. Pipeline §7 is superseded for audio. |
| Audio module names | pipeline: `src/assets/audio.ts`, `synth.ts`, `synth-2.ts` | brief/host: `src/audio/engine.ts` | `src/audio/{engine,mixer,synth,synth-2,music,sfx}.ts`; `src/assets/` keeps only the DOM-free manifests and `images.ts`. |
| Engine code edit needs a tab reload | host-changes §2 limitation | – | Refined: registry holds DATA only, functions live in modules, so code edits apply on the next call; only a mixer topology change rebuilds nodes (§3.1). |
| Volume key | [[architecture-assets-audio]] §8: old per-group key (superseded) | [[architecture-scoring-and-save]] §6: `last-ember:settings` `{ volume, muted }` | **`last-ember:settings` only** ([[architecture-resources-3]] §3; R-025, `SettingsRecord` also carries `quality`, R-142). Group sliders skipped. |
| Mute when not playing | host-changes §3: master muted whenever `screen !== 'playing'` | audio §9.1: title music plays on `title`/`help` | Per-screen duck table ([[architecture-resources-2]] §4) replaces the blanket mute. |

## 1. Rules

1. **Resources are never in State** and never pass through `migrate`/`mergeState`.
2. **Data in the registry, code in modules.** `Resources` holds plain data and DOM objects (canvases, contexts, images, audio nodes, typed arrays, counters). It holds NO functions and NO closures that capture module code, except DOM listener handles (§5). So when a module is edited and re-evaluated, its new functions operate on the same data: no stale code, no duplicates.
3. **Created on first use**, never at module evaluation. No module touches `document`, `window`, `AudioContext` or `Image` at import time.
4. **Every cache is derived** and carries its key; a key mismatch is a rebuild, never a bug ([[architecture-state-3]] §5).
5. **Never cache the host's main `ctx` or canvas.** `main.ts` re-runs create a new canvas; render receives the current `ctx` every frame.

## 2. `Resources` type (`src/assets/resources.ts`)

```ts
import type { SpriteId } from './sprites.ts'
import type { SoundId } from './sounds.ts'

export type Canvas2D = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }
export type ImageStore = {
  sheets: (HTMLImageElement | null)[]      // atlas sheets; null = failed
  sheetState: ('idle' | 'loading' | 'ok' | 'failed')[]
  screens: Record<string, HTMLImageElement | null> // keyart, logo, helpParry, helpGoal
  rects: Map<string, readonly number[] | null> // resolved 'id|anim|i' -> [sheet,x,y,w,h] | null ([[architecture-assets-pipeline]] §6)
  tints: Map<string, HTMLCanvasElement>  // 'id|anim|i|hex', LRU cap 64
  gen: number                            // +1 whenever a sheet or screen settles (ok or failed)
  loaded: number; total: number          // preload progress
  started: boolean
}
export type TileCache = {
  key: string                            // tilesHash + ':' + images.gen
  zone: Uint8Array; mask: Uint8Array; inner: Uint8Array; variant: Uint8Array // w*h (76 800) each
  chunks: Map<number, HTMLCanvasElement> // cx + cy * CHUNKS_W (CHUNKS_W = ceil(w / 8)), 256x256, LRU cap 40
  lru: number[]
}
export type MemoryCache = { key: number; canvas: Canvas2D | null; img: ImageData | null; words: Int32Array }
export type LightCache = Map<string, HTMLCanvasElement> // 'm:kind:b' masks, 'g:hex:b' glows, 'v:hex:WxH' vignettes
export type Particles = {
  x0: Float32Array; y0: Float32Array; vx: Float32Array; vy: Float32Array
  born: Float32Array; life: Float32Array; size: Float32Array; drag: Float32Array; grav: Float32Array
  col: Uint8Array; add: Uint8Array; shape: Uint8Array
  head: number; lastSeq: number; runId: number // runId change -> clear pool
}
export type Perf = { frameMs: Float32Array; i: number; last: number; level: 0 | 1 | 2 | 3; down: number; up: number; cool: number; pass: Record<string, number> }
export type AudioRes = {
  ctx: AudioContext | null
  state: 'locked' | 'running' | 'suspended' | 'failed'
  graphVersion: number                   // mixer topology version the nodes were built with
  master: GainNode | null; comp: DynamicsCompressorNode | null
  groups: Record<'music' | 'amb' | 'sfx' | 'ui', GainNode> | null
  buffers: Map<string, AudioBuffer | null> // file base name -> decoded, null = failed
  pending: Set<string>
  noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer } | null // 2 s generated buffers
  voices: Voice[]                        // live one-shots and loops
  lastStart: Map<SoundId, number>        // ctx.currentTime of last start (30 ms re-trigger guard)
  music: MusicRes
  loops: Partial<Record<SoundId, Voice>> // flame, heartbeat, beacon charge, rumble
  lastSeq: number                        // fx event cursor, -1 = fresh
  lastScreen: string
  unlock: { el: EventTarget; type: string; fn: EventListener }[] // installed once (§5)
  duck: Record<'music' | 'amb' | 'sfx' | 'ui', GainNode> | null // per-group duck gains in series ([[architecture-resources-2]] §3)
  masterLp: BiquadFilterNode | null      // hurt dip ([[architecture-resources-3]] §2.4)
  lastMaster: number                     // last master target, change detection
  pauseAt: number                        // ctx time when paused was entered, -1 = not paused
  nextCrackle: number; nextBeat: number; crackleN: number; growlAt: number // look-ahead schedulers
  broken: Set<SoundId>                   // recipes that threw; skipped until synth.ts re-evaluates
  synthGen: number                       // evaluation counter of synth.ts that set `broken`
}
export type Voice = { id: SoundId; pri: number; t0: number; stopAt: number; out: GainNode; nodes: AudioScheduledSourceNode[] }
export type MusicRes = { cur: string; t0: number; srcs: AudioBufferSourceNode[]; gains: GainNode[]; danger: number }
export type Resources = {
  version: number                        // RES_VERSION the instance was built with
  images: ImageStore
  tiles: TileCache | null
  memory: MemoryCache
  light: LightCache
  dark: Canvas2D | null
  scratch: Canvas2D | null               // tint / occlusion scratch, grown never shrunk
  particles: Particles
  perf: Perf
  audio: AudioRes
  debug: { on: boolean }                 // toggled only by the game.ts facade, update step 1 (R-096, R-133)
  ui: { copyResult: 'none' | 'ok' | 'failed'; urlRead: boolean } // clipboard result read and reset by platformStep (R-003); urlRead = ?seed read once per page (R-077)
  hud: { exitA: number; lastT: number; runId: number; dist: number; distT: number } | null // exit-marker smoothing (R-060), null until the first escape frame
}
```

## 3. `getResources()` and survival

```ts
export const RES_VERSION = 1 // bump only when a field's MEANING changes (not when one is added)
const holder: { res?: Resources } = import.meta.hot?.data ?? {}

export function getResources(): Resources {
  const r = holder.res
  if (r && r.version === RES_VERSION) return fillRes(r)
  if (r) releaseRes(r)                   // incompatible old instance: free canvases, stop voices, KEEP r.audio.ctx
  holder.res = makeRes(r?.audio.ctx ?? null)
  return holder.res
}
function fillRes(r: Resources): Resources { // additive fields after an edit of this module
  r.debug ??= { on: false }
  r.scratch ??= null
  r.ui ??= { copyResult: 'none', urlRead: false }
  r.ui.urlRead ??= false
  r.hud ??= null
  return r
}
```

`makeRes(ctx)` builds every field with empty values: typed arrays of `P_MAX = 512` (particles) and 120 (perf), empty maps, `audio.state = ctx ? 'suspended' : 'locked'`, `lastSeq = -1`. It creates NO canvas and NO image; those come lazily from their owning modules (`ensureDark`, `ensureTiles`, `startPreload`).

### 3.1 What survives what

| Event | Modules re-evaluated | Registry | Effect |
|---|---|---|---|
| edit `src/systems/flame.ts` | flame.ts … `game.ts` | same instance | nothing to do |
| edit `src/render/light.ts` | light.ts, render/index.ts, game.ts | same instance | new code draws with the cached sprites; if the mask stop table changed, bump `LIGHT_VERSION` in light.ts, which is part of the cache key (`'m:' + LIGHT_VERSION + ':' + kind + ':' + b`) so old sprites are ignored (stale entries cleared when the key prefix differs) |
| edit `src/audio/synth.ts` | synth.ts and importers | same instance | the next sound uses the new recipe; running voices end naturally |
| edit `src/audio/mixer.ts` with a topology change | mixer.ts … | same instance | `MIXER_VERSION !== audio.graphVersion` → disconnect old group/master/compressor nodes, build new ones on the SAME `AudioContext`, restart music at its current loop offset |
| edit `src/assets/resources.ts` (add a field) | resources.ts and every importer up to `game.ts` | same object via `hot.data` | `fillRes` adds the field |
| edit `resources.ts` with `RES_VERSION` bump | same | rebuilt | `releaseRes` old: canvases `width = height = 0`, maps cleared, voices stopped, music sources stopped, group nodes disconnected; the AudioContext and decoded buffers are moved into the new instance |
| edit `src/main.ts` / `src/merge.ts` | main.ts only | untouched (resources.ts not re-evaluated) | new main canvas; render gets the new `ctx`; dark/tile canvases are independent offscreen canvases and stay valid |
| dev `R` reset | none | untouched | particle pool clears on `runId` change; tile cache key changes on the next run |
| full page reload | all | gone | browser frees everything |

**Dispose hooks: none outside `main.ts`.** Nothing in the registry runs timers or rAF; per-step work is driven by `update` (audio) and `render` (visuals). Rule from [[architecture-host-changes]] §2 stands: do NOT add `import.meta.hot.dispose` to `resources.ts` or audio modules.

## 4. Lifecycle table

| Resource | Owner module | Created when | Kept across game swap | Disposed when | Size |
|---|---|---|---|---|---|
| registry object | `assets/resources.ts` | first `getResources()` (first render frame) | yes | page unload; `RES_VERSION` bump (rebuilt) | < 1 KB |
| atlas sheet `HTMLImageElement` ×1–2 | `assets/images.ts` | `startPreload()` on the first title frame | yes | never (page) | 1024² × 4 B = 4 MB decoded each |
| screen images ×4 | `assets/images.ts` | preload, after sheets | yes | never | keyart 960×540 = 2 MB, others ≤ 0.5 MB |
| resolved rect map | `assets/images.ts` | each time a sheet settles (`gen` +1) | yes | rebuilt on `gen` change | ~300 entries |
| tinted frame canvases | `assets/images.ts` | first tinted draw | yes | LRU beyond 64 | ≤ 64 × 4 KB |
| tile maps (4 `Uint8Array`) | `render/tiles.ts` | first world frame of a run | yes | key change (new run) | 307 KB |
| tile chunk canvases | `render/tiles.ts` | visible, ≤ 4 per frame | yes | LRU beyond 40; key change | 256 KB each, ≤ 10 MB |
| memory map canvas + `ImageData` | `render/memory.ts` | first world frame | yes | never (repainted on new `tilesHash`) | 2 × 307 KB |
| darkness canvas | `render/light.ts` | first world frame | yes | never; resized in place on size/quality change | ≤ 8.3 MB (1080p), 14.7 MB (1440p) |
| light mask / glow / vignette sprites | `render/light.ts`, `overlay.ts` | first use of a key | yes | key prefix version change; vignette on size bucket change | ≈ 2–6 MB |
| scratch canvas | `render/*` | first tint/occlusion use | yes | never | ≤ 1 MB |
| particle pool | `render/particles.ts` | `makeRes` | yes | cleared on `runId` change | 512 × 40 B ≈ 20 KB |
| perf ring | `render/quality.ts` | `makeRes` | yes | never | 0.5 KB |
| `AudioContext` | `audio/engine.ts` | first user gesture (unlock) | yes | never (page) | – |
| master/compressor/group nodes | `audio/mixer.ts` | unlock | yes | `MIXER_VERSION` change (rebuilt on same context) | – |
| noise buffers (white, pink, brown, 2 s mono) | `audio/synth.ts` | unlock | yes | never | 3 × 88 200 × 4 B ≈ 1 MB |
| decoded `AudioBuffer`s (14 files) | `audio/engine.ts` | after unlock, priority order | yes | never | 240 s music stereo 44.1 kHz float ≈ 85 MB; + ≈ 12.5 MB rest (amb_cave 40 s mono 7.1 MB, stingers 11 s stereo 3.9 MB, SFX ≈ 1.6 MB; +9 % at a 48 kHz context) |
| one-shot voices | `audio/sfx.ts` | per triggered event | yes (play out) | `onended` removes from `voices` | ≤ 24 |
| loop voices (flame, heartbeat, charge, rumble) | `audio/sfx.ts` | condition true in `audioStep` | yes | condition false (0.2 s fade) | ≤ 4 |
| unlock + visibility listeners | `audio/engine.ts` | `getResources()` → `installAudioListeners()` once | yes | unlock listeners removed after unlock; visibility kept | 3 |

**Memory budget (DEFAULT, architect):** images ≈ 8 MB, canvases ≤ 30 MB at 1440p, audio ≈ 98 MB decoded (85 MB music + 12.5 MB rest + 1 MB noise; music is stereo float32 PCM: 44 100 × 2 × 4 B = 353 KB/s). Total ≈ 140 MB, including ≈ 2.4 MB fixed world caches in `src/world/caches.ts`, `route.ts` (outside this registry) and 0.92 MB render maps at 320×240 (R-122) ([[architecture-scale-and-economy-4]] §1.2–§1.3). **Mitigation if it matters:** decode `mus_title` lazily and drop its buffer when a run starts (−17 MB); `ponytail:` not done by default.

## 5. Listeners and timers

- **UI and render modules add no DOM listeners.** All input comes from the host `Input` ([[architecture-host-changes]] §1).
- **Audio is the single exception** (gesture unlock must happen inside a real event handler on Safari, [[architecture-resources-2]] §1): `installAudioListeners(res)` runs once when `res.audio.unlock.length === 0`, adds `pointerdown` and `keydown` (`{ capture: true }`) on `window` and `visibilitychange` on `document`, and stores the handles in `res.audio.unlock`. The handlers call `globalThis.__lastEmberAudio?.(type)` – a tiny trampoline that `engine.ts` reassigns on every evaluation – so a re-evaluated engine is called with its NEW code and nothing is ever added twice. `ponytail:` one global hook name; upgrade path: none needed. Strict tsc needs the global typed (else TS7017, R-143), in `src/audio/engine.ts`:

```ts
declare global {
  var __lastEmberAudio: ((type: string) => void) | undefined
}
globalThis.__lastEmberAudio = onAudioEvent // reassigned on every evaluation of engine.ts
```

`engine.ts` is a module (it has imports/exports), so `declare global` is legal there; `var` is required for a `globalThis` property.
- **No `setInterval`/`setTimeout`/rAF** anywhere outside `main.ts`. Music "250 ms checks" from the audio catalog run inside `audioStep` (every update step) instead.

## 6. Preload sequence and loading screen

| Step | When | What | Failure |
|---|---|---|---|
| 1 | first `render` call (title) | `startPreload(res)`: set `images.started`, `total = sheets + 4 screens` | – |
| 2 | immediately | atlas sheets: `img.src = url; img.decode()` in parallel (1–2) | reject or 10 s timeout → `sheets[i] = null`, `sheetState 'failed'`, `console.warn('[assets] atlas-0 failed, using placeholders')` once |
| 3 | sheets settled | screens in order keyart, logo, helpParry, helpGoal, one at a time | → `null`, title draws the procedural backdrop ([[architecture-ui]] §4.1) |
| 4 | each settle | `loaded += 1`, `gen += 1`, rebuild rect map | – |
| 5 | unlock (first gesture) | audio decode queue: `mus_title`, `amb_cave`, `mus_descent`, `mus_descent-danger`, then SFX samples, then `mus_escape`, stingers; max 4 in flight | fetch/decode error → `buffers.set(name, null)`, warn once; SFX use synth, music silent |

Loading screen = the title screen itself ([[architecture-ui]] §4.1): until `loaded === total` or 5 s after the first frame, the "Play" button label shows `Loading 60 %` (`floor(100 · loaded / total)`), 2 px progress bar under it (`#3a2e24` track, `#ff8a1e` fill), and Play is disabled. After 5 s Play is enabled regardless (placeholders cover missing art). The 5 s clock is `meta.time` (State, written by update) so render stays pure.

## 7. Check independence (`npm run check`)

- Check files import only L0–L3 (`src/core`, `src/world`, `src/entities`, `src/systems`) plus the DOM-free data manifests `src/assets/sprites.ts`/`sounds.ts` (R-043; noise lives in `src/core/noise.ts`, R-008). They never import `src/render`, `src/ui`, `src/audio`, `images.ts`. `resources.ts` itself is import-safe under Node (type-only imports, no DOM at evaluation, `import.meta.hot?.` optional chain); its only L4 user for `res.ui` is `src/ui/platform.ts` `platformStep` (R-003; no `src/ui/screens.ts`).
- Forbidden at import time in those modules: `document`, `window`, `navigator`, `localStorage`, `AudioContext`, `Image`, `import.meta.glob` (Vite-only). `import.meta.env` is forbidden in L0–L3 **everywhere, also inside function bodies** (it throws under Node when the function runs in a check; R-133). All dev toggles live in `src/game.ts` `update` step 1 (R-096 step 1, extended by R-133). `import.meta.hot?.` is safe under Node but not needed there.
- `src/game.ts` is the glue that imports both worlds; checks never import it ([[architecture-host-changes-2]] §5).
- Required assertions (R-043: no `audio.check.ts`): `audio/trigger.ts` maps every `FxEventKind` to a sound or explicit `null` (`Record<FxEventKind, …>`, tsc-enforced, so every referenced `SoundId` exists); the `SOUNDS` id format is checked by `scripts/check-assets.ts`. `danger()` range stays browser-verified ([[architecture-resources-2]] §3).

## Related

- [[architecture]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-audio]]
- [[architecture-scoring-and-save]]
- [[last-ember-design]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[index]]

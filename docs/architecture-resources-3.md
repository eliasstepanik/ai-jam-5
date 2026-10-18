---
type: architecture
title: Last Ember – Runtime Resources (3/3) – Synthesis Recipes, Persistence, Pause, Failures
description: Last Ember audio part 3 – the Recipe contract and shared node helpers, exact WebAudio node graphs with parameter values for every synthesised SFX class (whoosh, perfect parry layers, hiss, thud, rumble, growl, heartbeat, horn, chime), noise buffer generation, volume and mute persistence in last-ember:settings, pause and blur behaviour, autoplay and decode failure handling and the mobile out-of-scope note.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Runtime Resources (3/3): Synthesis, Persistence, Pause, Failures

Part 3 of 3. Previous: [[architecture-resources]] (registry), [[architecture-resources-2]] (engine, mixer, triggers). Per-sound recipes in catalog notation: [[architecture-assets-audio-2]]; this file fixes the shared building blocks and the exact graphs of each recipe CLASS so every catalog entry is a parameterisation of one of them. Hub: [[architecture]]. Spec: [[last-ember-design]]. Storage: [[architecture-scoring-and-save]] §6. Render: [[architecture-render]], [[architecture-render-2]], [[architecture-render-3]]. UI: [[architecture-ui]], [[architecture-ui-2]].

## 1. Recipe contract and helpers (`src/audio/synth.ts`)

`PlayParams` is owned by `src/audio/trigger.ts` and `synth-2.ts` exports `SYNTH` (R-093); the block below shows the shapes.

```ts
export type PlayParams = { x?: number; y?: number; q?: number; mineral?: FlameKind; rate?: number; gain?: number; delay?: number; seq: number }
export type Recipe = (a: AudioRes, out: AudioNode, t: number, p: PlayParams) => AudioScheduledSourceNode[]
// t = absolute start time (ctx.currentTime + delay); returns sources so the caller can stop/steal them

const env = (c: BaseAudioContext, t: number, a: number, d: number, peak: number, out: AudioNode): GainNode => {
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + Math.max(a, 0.001))
  g.gain.setTargetAtTime(0, t + a, Math.max(d, 0.005) / 4) // ~98 % decayed after d
  g.connect(out)
  return g
}
const noise = (a: AudioRes, kind: 'white' | 'pink' | 'brown', t: number, dur: number, out: AudioNode): AudioBufferSourceNode => {
  const s = a.ctx!.createBufferSource()
  s.buffer = a.noise![kind]
  s.loop = true
  s.loopEnd = 2
  s.connect(out)
  s.start(t, hashOffset(t))  // offset 0..1.9 s from the start time, so bursts differ
  s.stop(t + dur + 0.05)
  return s
}
const osc = (a: AudioRes, type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode): OscillatorNode => {
  const o = a.ctx!.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
  o.connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
  return o
}
const biquad = (a: AudioRes, type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode => {
  const b = a.ctx!.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  b.connect(out)
  return b
}
```

Rules: every node is created per play (WebAudio sources are one-shot); nothing is cached except the noise buffers; no recipe allocates more than ~12 nodes; envelopes always start from 0 (no clicks). `hashOffset(t) = ((t * 997) % 1.9)`, deterministic.

### 1.1 Noise buffers (built at unlock, kept forever)

2 s mono at `ctx.sampleRate`, values from a module-local mulberry32 seeded with `0x1e3b` (resource generation, not gameplay):

- white: `x = r * 2 - 1`.
- pink (Paul Kellet economy): `b0 = 0.99765 b0 + w·0.0990460; b1 = 0.96300 b1 + w·0.2965164; b2 = 0.57000 b2 + w·1.0526913; x = (b0 + b1 + b2 + w·0.1848) · 0.25`.
- brown: `l = (l + 0.02 w) / 1.02; x = l · 3.5`.

## 2. Recipe classes (exact graphs)

Values in `[]` are the parameters a catalog entry supplies. Gains are inside the voice (before the group gain).

### 2.1 WHOOSH – filtered noise with swept band-pass (`sfx_swing`, `sfx_roll`, tosses, shake-off)

```
noise(pink) → bp(f0 → fMid → f1, Q) → env(a, d, peak) → out
```

`sfx_swing`: f 600 → 1800 at t + 0.08 (`exponentialRampToValueAtTime`) → 700 at t + 0.2, Q 2, env a 0.02 d 0.18 peak 0.6, playbackRate of the noise `p.rate`. Tosses: f 400 → 2400 over 0.25, Q 1.2, a 0.01 d 0.3 peak 0.7, plus the mineral layer (sodium sine 1200 → 2400 over 0.3 g 0.15; copper triangles 1568 + 2349 env d 0.4 g 0.12; strontium saw 110 → 70 over 0.4 → lp 600 g 0.25).

### 2.2 PERFECT PARRY – three layers at t (`sfx_parry-perfect`)

```
L1 ring:  sample 'sfx_parry-perfect-ring' (if decoded) ──► env(0.001, 1.3, 0.9) ─┐
          else: sine 880 g0.5 + sine 883 g0.35 (beating 3 Hz) + sine 2112 g0.3 + sine 3608 g0.15
                each → env(0.001, d) with d 1.2 / 1.2 / 0.7 / 0.4 ──────────────┤
L2 burst: noise(pink) → lp f 400 →(0.08 s) 3000 →(0.3 s) 600, Q 0.7 → env(0.005, 0.4, 0.9) ─┤──► voice out (gain 1.0)
          mineral shift: sodium ×1.25, strontium ×0.7 on all lp targets; copper + bp(1800, 8) g0.1
L3 thud:  sine 90 → 40 over 0.15 → env(0, 0.25, 1.0) + noise(white) env(0, 0.004, 0.3) (click) ─┘
```

Total ≈ 11 nodes, priority 3, never stolen by lower priorities. The 60 ms hit-stop is gameplay; the flare duck is in [[architecture-resources-2]] §4.

### 2.3 HISS – high-passed noise with closing low-pass (`sfx_parry-bad`, `sfx_flame-out` tail, `sfx_rock-warn`)

```
noise(white) → hp(1500, 0.7) → lp(6000 → 1200 over d) → env(0.01, 0.45, 0.5) → out
               + sine 80 → env(0, 0.1, 0.4)   (choked thump, parry-bad only)
```

`sfx_flame-out`: three brown bursts (lp 700 → 200, env d 0.12, peaks 0.8 / 0.5 / 0.3 at t, t + 0.18, t + 0.34) then this hiss at t + 0.4 with hp 2000, env a 0.05 d 0.5 peak 0.15. `sfx_rock-warn`: white → bp 5000 → 1500 over 1.0 Q 4 → env a 0.9 d 0.1 peak 0.4 (rising, then cut).

### 2.4 THUD – pitched sine drop + noise body (`sfx_mon-hit`, `sfx_hurt`, `sfx_parry`, `sfx_rock-impact` fallback, `sfx_devourer-beat`)

```
sine f0 → f1 over tf → env(0, d, g) ─┐
noise(pink|brown) → lp(fc) → env(0, dn, gn) ─┴─► out
```

| id | f0 → f1, tf | d, g | noise, lp, dn, gn |
|---|---|---|---|
| `sfx_mon-hit` | 120 → 50, 0.1 | 0.15, 0.8 | pink, 1500, 0.25, 0.5 |
| `sfx_hurt` | 200 → 80, 0.12 | 0.15, 0.9 | white hp 3000 (instead of lp), 0.04, 0.4 |
| `sfx_parry` | 140 → 60, 0.12 | 0.15, `0.8 · (0.6 + 0.4 q)` | pink bp 900 Q 1, 0.2, 0.5; + bp 2500 g `0.2 q` |
| `sfx_rock-impact` | 80 → 35, 0.3 | 0.4, 1.0 | pink, 2000, 0.5, 0.6 |
| `sfx_devourer-beat` | 70 → 45, 0.25 | 0.4, 1.0 | brown, 300, 0.4, 0.4 (a 0.05) |

`sfx_hurt` also dips the master: an always-present `masterLp` (lowpass 18 000 Hz, in series after master) gets `setTargetAtTime(1200, t, 0.03)` then `setTargetAtTime(18000, t + 0.15, 0.15)`.

### 2.5 RUMBLE – low brown noise bed (`sfx_cave-rumble`, ambience fallback)

```
noise(brown) → lp(120, 0.7) → gain 0.4 (loop) ; swells: gain.setTargetAtTime(0.9, t, 0.08), back to 0.4 at t + 0.5 (tc 0.2)
noise(white) → bp(4000, 2) → grain env(0, 0.03, 0.15) every 0.08–0.3 s (hash-spaced) = gravel trickle
```

Ambience fallback (`amb_cave` buffer missing): brown → lp 200 gain 0.3 loop + `sfx_drip` every 2–6 s (sine 1800 → 900 over 0.04, env d 0.05 g 0.3, three delayed copies at 0.18 / 0.36 / 0.54 s gains 0.3 / 0.15 / 0.07 using `DelayNode` + gain, no convolver).

### 2.6 GROWL – detuned saws through a low-pass with tremolo (`sfx_mon-growl` fallback; also lunge body)

```
saw 92 Hz ─┐
saw 92·2^(14/1200) ─┼─► lp(420, Q 6) → tremolo gain (LFO sine 12 Hz depth 0.5 around 0.5) → env(0.2, 1.0, 0.55) → out
saw 46 Hz (g 0.5) ─┘
noise(brown) → bp(180, 3) → same tremolo (g 0.4)
```

Pitch by kind via `p.rate` (lurker 1.4, stalker 1.0, devourer 0.6) applied to all oscillator frequencies; lp cutoff × rate. `sfx_mon-lunge` fallback: white → bp 1200 → 4000 over 0.25 Q 3 → env a 0.01 d 0.3 g 0.7, plus one growl saw pair at 0.3 s length.

### 2.7 HEARTBEAT (`sfx_heartbeat`, loop scheduled ahead)

```
per beat at T: sine 55 → env(0, 0.12, 0.8) at T ; sine 55 → env(0, 0.12, 0.55) at T + 0.28
             + sine 110 g 0.1 same envelopes (audibility on laptop speakers)
```

`loopStep` keeps `nextBeat`; when `ctx.currentTime + 0.2 > nextBeat` schedule the beat at `nextBeat`, `nextBeat += 0.857`. Stops scheduling when `hp > 1`; already scheduled beats play out (≤ 0.2 s).

### 2.8 HORN (`sfx_beacon-horn` fallback)

```
note 1 (D2 73.4 Hz, t .. t+1.8): saw f + saw f·1.005 + square f/2 (g 0.3) → lp(600 → 900 over 0.3, Q 2) → env(0.3, 1.5, 0.8)
note 2 (A1 55 Hz, t+1.9 .. t+4.0): same graph
echo: voice out → DelayNode 0.35 s → gain 0.5 → back into delay input (feedback 0.5 ≈ copies 0.5/0.25/0.12) → out
```

Feedback delay node is created per play and disconnected at `t + 5.5` via the voice `stopAt` sweep in `pruneVoices`.

### 2.9 CHIMES and UI (`sfx_mineral-collect`, `sfx_plant-heal`, `sfx_mine-empty`, `ui_*`)

Triangle/sine notes with `env(0, 0.2)` at fixed offsets, frequencies per catalog (collect: root, ×2^(4/12), ×2^(7/12) at 0 / 0.06 / 0.12 s; heal 659 then 831 Hz). `sfx_mine-empty` (R-134, "pouch full", no mineral param): THUD class, square 220 → 196 over 0.08, env(0, 0.12, 0.45) + pink bp 1400 Q 2 env(0, 0.05, 0.3): a dull double clack, clearly not a chime. UI sounds route to `uiGain`, never panned, cap 1–2, priority 0–1.

## 3. Volume and mute persistence

- Single source: `State.settings.volume` (0..1, default 0.7) and `settings.muted` ([[architecture-state-2]] §9), mirrored to `localStorage['last-ember:settings']` as `SettingsRecord` ([[architecture-scoring-and-save]] §6). Extended additively: `{ v: 1, volume, muted, lastSeed, quality, reducedFlash }` (R-025 + R-142: `quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3'`, default `'auto'`; new fields optional on read, filled with defaults; no `v` bump because old readers ignore extra keys and new readers fill missing ones).
- Writers: `src/systems/screens.ts` `stepScreens` (R-003; no `src/ui/screens.ts`) changes the State fields (`M` toggles mute on every screen; `-`/`=` and the title/pause sliders change volume in 0.1 steps) and calls `saveSettings(s)`; audio only READS State each step (`setMaster`). Catalog §8 per-group key and sliders are dropped (R-025) (YAGNI; add a `music` factor field if testers ask).

## 4. Pause and blur

| Situation | Audio behaviour |
|---|---|
| `Escape`/`P` or host `'Blur'` → `paused` | ducks (music −10, amb −10, sfx 0) with tc 0.1; `pauseAt = ctx.currentTime`; after 0.3 s `ctx.suspend()` (all scheduled audio freezes, loops hold position) |
| resume (`paused` → `playing`) | `ctx.resume()` then ducks back with tc 0.2; music continues from where it froze |
| tab hidden | `visibilitychange` → `ctx.suspend()` immediately (also covers screens that keep running) |
| tab visible again | `resume()` unless `paused` |
| dev `R` reset / `RES_VERSION` bump | screen becomes `title`; `musicStep` crossfades to `mus_title`; loops stop because their conditions are false |

Particles and render effects freeze in `paused` by construction (simulated time, [[architecture-render-2]] §4.1).

## 5. Failure handling

| Failure | Detection | Behaviour |
|---|---|---|
| no `AudioContext` constructor / throws | try/catch in `onDomEvent` | `state = 'failed'`, warn once, silent game, events still consumed |
| autoplay blocked (resume rejects / stays suspended) | promise reject or state check after 1 s | listeners stay, retry next gesture, title hint `Click for sound` |
| fetch 404 / network | `fetch` reject or `!ok` | `buffers.set(name, null)`, warn once per file; SFX → synth; music/ambience → silence (ambience → §2.5 fallback) |
| `decodeAudioData` reject (codec) | reject | same as above; `canPlayType` already chose `.ogg` vs `.m4a` ([[architecture-assets-audio]] §2) |
| exception in a recipe | try/catch around `play` | warn once per id, mark `SYNTH[id]` broken in `res.audio.broken: Set<SoundId>` (registry data; cleared when `synth.ts` re-evaluates via a module-evaluation counter), never propagate into `update` |
| node leak | `pruneVoices` each step | drops voices with `stopAt < now`, disconnects their `out` |

## 6. Out of scope

- **Mobile / touch:** out of scope (spec: desktop only). iOS needs the unlock inside a `touchend`, and the silent-switch mutes WebAudio; not handled. The host already has `touch-action: none`; nothing else is done.
- Safari: Ogg support not verified; the `.m4a` fallback covers it ([[architecture-assets-audio]] §2). The `'interrupted'` context state is treated as suspended.
- Spatial audio beyond stereo pan + distance gain, reverb convolvers, and per-zone music are out of scope (`ponytail:` add a convolver only if the cave feels dry in playtest).

## Related

- [[architecture]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-scoring-and-save]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[index]]

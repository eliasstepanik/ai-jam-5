---
type: architecture
title: Last Ember – Runtime Resources (2/3) – Audio Engine, Mixer, Music, Danger, Voices, Event Triggers
description: Last Ember audio engine part – module split under src/audio, where audio runs in the frame, AudioContext unlock and resume, mixer graph with group gains and compressor, per-screen ducking, seamless music loops with the sample-synchronous danger layer and its danger formula, flame loop modulation, voice caps and stealing, and the fx event queue consumer with the full event to sound trigger table.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Runtime Resources (2/3): Audio Engine

Part 2 of 3. Previous: [[architecture-resources]] (registry, lifecycle). Next: [[architecture-resources-3]] (synthesis recipes, persistence, pause, failures). Audio catalog (ids, gains, caps, recipes): [[architecture-assets-audio]], [[architecture-assets-audio-2]]. Event queue: [[architecture-state-2]] §7. Hub: [[architecture]]. Spec: [[last-ember-design]]. Render siblings: [[architecture-render]], [[architecture-render-2]], [[architecture-render-3]]. UI: [[architecture-ui]], [[architecture-ui-2]].

## 1. Modules and where audio runs

| File | Exports | DOM | Lines (est.) |
|---|---|---|---|
| `src/audio/trigger.ts` | `TRIGGERS: Record<FxEventKind, Trigger \| null>`, `danger(s)`, `musicFor(s)`, `duckFor(s)` | **no** (checked) | ~120 |
| `src/audio/engine.ts` | `audioStep(s, input)`, `installAudioListeners(res)`, `unlock(res)` | yes | ~170 |
| `src/audio/mixer.ts` | `MIXER_VERSION`, `ensureMixer(res)`, `setDuck(res, group, db, tc)`, `setMaster(res, vol, muted)` | yes | ~90 |
| `src/audio/music.ts` | `musicStep(res, s)` | yes | ~140 |
| `src/audio/sfx.ts` | `play(res, id, p)`, `loopStep(res, s)`, `stealFor(res, id)` | yes | ~180 |
| `src/audio/synth.ts`, `synth-2.ts` | `SYNTH: Record<SoundId, Recipe \| null>` (recipes split by group), `noiseBuffers(ctx)` | yes (nodes only on call) | ~250 each |

**Call site (binding: [[architecture-rulings-2]] R-096, extended by R-133):** `src/game.ts` `update(s, input, dt)`: (1) dev-only toggles (Backquote, `Shift+Digit1..6`); (2) `step(s, input, dt)`; (3) `platformStep(s)`; (4) `try { audioStep(s, input) } catch (e) { warnOnce(e) }`. So audio runs once per fixed step, after the simulation, and READS State only. Checks import `src/systems/step.ts` (R-002), never `game.ts`, so they stay DOM-free. Audio never runs from `render` (render is per frame and may run 0 or many times per step).

```ts
// src/audio/engine.ts
export function audioStep(s: State, input: Input): void {
  const res = getResources()
  const a = res.audio
  if (a.unlock.length === 0) installAudioListeners(res)
  if (!a.ctx || a.state === 'failed') return consumeSilently(a, s) // keep the cursor current while locked
  if (a.state === 'suspended' && !document.hidden && s.meta.screen !== 'paused') resumeSoon(a)
  ensureMixer(res)
  setMaster(res, s.settings.volume, s.settings.muted)
  applyDucks(res, duckFor(s))
  musicStep(res, s)
  loopStep(res, s)
  consumeEvents(res, s)
  pruneVoices(a)
  a.lastScreen = s.meta.screen
  void input // edges are not needed: unlock is listener-driven (§2)
}
```

`consumeSilently` sets `lastSeq = max seq` so a later unlock never replays the backlog.

## 2. AudioContext unlock and resume

1. `installAudioListeners` (once per page, [[architecture-resources]] §5) adds `pointerdown` and `keydown` (capture) on `window`, `visibilitychange` on `document`. Each calls `globalThis.__lastEmberAudio?.(type)`; `engine.ts` assigns that hook at evaluation (`globalThis.__lastEmberAudio = onDomEvent`), so the latest code runs.
2. `onDomEvent('pointerdown' | 'keydown')` inside the gesture: if `ctx === null`, `new AudioContext({ latencyHint: 'interactive' })`; then `ctx.resume()`; build noise buffers and the mixer; start the decode queue ([[architecture-resources]] §6). On success remove the two gesture listeners (keep visibility). If the constructor throws → `state = 'failed'`, warn once, game runs silent.
3. `ctx.onstatechange` mirrors `ctx.state` into `a.state` (`'running'`/`'suspended'`; `'interrupted'` (Safari) is treated as suspended).
4. `visibilitychange`: hidden → `ctx.suspend()`; visible → `resume()` only if `lastScreen === 'playing' | 'title' | 'help' | 'dead' | 'won'` (never in `paused`).
5. **Autoplay failure:** if `resume()` rejects or the state stays `'suspended'` 1 s after a gesture, keep the listeners installed and retry on the next gesture. The title shows a small `Click for sound` hint while `a.state !== 'running'` ([[architecture-ui]] §4.1). Never throw into `update`.

## 3. Mixer graph (`src/audio/mixer.ts`)

```
source → voiceGain (base × variation × envelope) → StereoPanner (world sounds only) ─┐
                                                                                   ▼
musicGain 0.55 ─┐                                                       (one per group)
ambGain   0.45 ─┼─► masterGain (volume, 0 when muted) ─► DynamicsCompressor ─► ctx.destination
sfxGain   0.90 ─┤      threshold -18 dB, knee 12, ratio 4, attack 0.005, release 0.2
uiGain    0.70 ─┘
```

- Group base gains and compressor values: [[architecture-assets-audio]] §4. Each group has a second **duck gain** in series (`groupDuck[g]`, default 1), so ducks never fight the base gain: `src → … → groupGain → groupDuck → master`.
- `setMaster(res, volume, muted)`: target `muted ? 0 : volume²` (perceptual curve), `setTargetAtTime(v, now, 0.05)`; only when the value changed (store last value in `res.audio`).
- Panning (world sounds): `pan = clamp((x - cam.x) / 240, -1, 1) * 0.6`; distance gain `clamp(1 - d / 480, 0, 1)` (catalog values; 240 = half the 480-world-px design view height, so the reference does not depend on window size).
- `MIXER_VERSION` constant: when it differs from `res.audio.graphVersion`, `ensureMixer` disconnects old nodes and rebuilds on the same context ([[architecture-resources]] §3.1).

## 4. Per-screen music and ducking (`trigger.ts`, pure)

| Screen / condition | Music (`musicFor`) | Ducks (`duckFor`, dB, time constant) | Context |
|---|---|---|---|
| `title`, `help` | `mus_title` | none | running |
| `playing`, `descent` | `mus_descent` + `mus_descent-danger` layer | low HP (hp 1): music −3, 0.5 s | running |
| `playing`, `escape` | `mus_escape` (starts 1.5 s after `beaconLitAt`; silent before) | ambience −9 until escape music starts | running |
| `paused` | keep current, held | music −10, amb −10, sfx −∞ (gain 0), 0.1 s | `ctx.suspend()` 0.3 s after entering (`res.audio.pauseAt`); resume on leave |
| `dead` | `mus_sting-death` once, then silence | amb −12, sfx −6 | running |
| `won` | `mus_sting-win` once, then silence | amb −12, sfx −6 | running |
| any, `fx.flare > 0` | – | music −6, amb −6, attack 0.01, release 0.6 (perfect parry) | – |

`duckFor(s)` returns `{ music, amb, sfx, ui }` in dB (pure; checked). Engine converts with `10 ** (db / 20)` and `setTargetAtTime`.

## 5. Music (`src/audio/music.ts`)

- **Seamless loops:** `AudioBufferSourceNode` with `loop = true`, `loopStart`, `loopEnd` from `SOUNDS[id].loop` ([[architecture-assets-pipeline]] §3.2). No scheduling timers; the source loops sample-accurately.
- **Change of track** (`musicFor(s) !== music.cur`): fade old gains to 0 with `setTargetAtTime(0, now, 0.3)` and `stop(now + 1.5)`; start the new track at `t0 = now + 0.05` with gain ramp 0 → target over 1 s. Missing buffer → `cur` is set anyway and the step retries the start each step until the buffer arrives (replaces the catalog's 250 ms check); a failed buffer means silence.
- **Danger layer:** `mus_descent` and `mus_descent-danger` start with the SAME `t0` and the same loop points (both 72.0 s), so they stay sample-synchronous forever. The layer's own gain follows the danger scalar: `layerGain.gain.setTargetAtTime(0.7 * danger, now, 0.4)`; base stays 0.7. If only the base buffer is ready, the layer starts later at `offset = (now - t0) % 72` so it is still in phase.
- **Danger formula (pure, `trigger.ts`; refines [[architecture-assets-audio]] §9.2):**

```ts
export function danger(s: State): number {
  if (s.meta.screen !== 'playing' || s.meta.phase !== 'descent') return 0
  const p = s.player
  const R = lightRadius(s)
  let tele = 0
  let ring = 0
  for (const m of s.monsters) {
    if (m.ai === 'dying') continue
    const d = Math.hypot(m.x - p.x, m.y - p.y)
    if (m.ai === 'windup' || m.ai === 'lunge') tele = Math.max(tele, 1 - Math.min(1, Math.max(0, d - R) / 160))
    if (d < R + 96) ring += 1
  }
  const low = Math.min(1, Math.max(0, 1 - (p.energy / p.energyMax) * 1.5))
  const hp = p.hp <= 1 ? 0.6 : 0
  return Math.min(1, Math.max(tele, low, ring / 6, hp))
}
```

Telegraph term = 1 within the light edge, falls to 0 at 160 px beyond it; flame below 67 % starts raising danger; 6 shades in the ring = 1. Smoothing is the audio time constant (0.4 s), not State.

## 6. Loops driven by State (`loopStep`)

| Loop id | Runs while | Parameters each step (`setTargetAtTime`, tc 0.05) |
|---|---|---|
| `sfx_flame-loop` | `playing`, `descent`, `energy > 0` | `e = energy / energyMax`; lowpass `f = (300 + 900 e) · {none 1, sodium 1.25, copper 1, strontium 0.7}`; gain `0.15 + 0.35 e`; copper adds `bp(1800, 8)` branch gain 0.05; crackle grains scheduled ahead: when `ctx.currentTime + 0.1 > nextCrackle`, schedule one 6 ms white burst (hp 3000, gain `0.1 e`) at `nextCrackle`, then `nextCrackle += 0.04 + 0.12 · hash2(k, 0, 9)` (k = crackle counter) |
| `sfx_heartbeat` | `playing`, `hp === 1` | lub-dub scheduled ahead every 0.857 s (70 BPM) |
| `sfx_beacon-charge` | `beaconHold > 0` and not lit | `p = beaconHold / BEACON_HOLD`; noise lp `300 + 2500 p`, gain `0.2 + 0.5 p`; saw `55 · 2^(2p)` |
| `sfx_cave-rumble` | `playing`, `escape` | gain 0.4; swell to 0.9 for 0.5 s on each `rockLand` |
| `amb_cave` | `playing` | playbackRate by `meta.zone` (1, 0.96, 0.92, 0.88), lowpass `8000 → 3000` by zone, tc 2 s |

Stop = gain to 0 with tc 0.05 and `stop(now + 0.25)`; entry removed from `loops`. Loops are restarted from their condition after any rebuild, so nothing needs to survive a swap except the registry entry.

## 7. Voices, caps and stealing (`sfx.ts`)

- Per-id cap and priority from `SOUNDS` (catalog). Global cap 24 one-shots (loops and music excluded).
- `play(res, id, p)`: (1) re-trigger guard: skip if `now - lastStart.get(id) < 0.03`; (2) if live voices of `id` ≥ cap → steal the oldest of that id; (3) else if global ≥ 24 → steal the oldest voice with the lowest `pri` that is `< 3`; if all are priority 3 → drop the NEW sound unless it is priority 3, then steal the oldest priority-3 voice; (4) build nodes from the sample (buffer ready) or `SYNTH[id]` fallback; (5) push `Voice`, `onended` on the longest source removes it.
- Steal = `out.gain.setTargetAtTime(0, now, 0.01)` and `stop(now + 0.05)` on its sources (no click).
- Variation per play (catalog §6): `rate × (0.94 + 0.12 · h1)`, `gain × (0.9 + 0.1 · h2)` with `h1 = hash2(e.seq, 1, 77)`, `h2 = hash2(e.seq, 2, 77)` (deterministic per event, no `Math.random`).

## 8. Event consumer and trigger table

```ts
// src/audio/engine.ts
function consumeEvents(res: Resources, s: State): void {
  const a = res.audio
  const ev = s.fx.events
  if (a.lastSeq < 0) { a.lastSeq = ev.length ? ev[ev.length - 1].seq : 0; return } // fresh: never replay
  for (const e of ev) {
    if (e.seq <= a.lastSeq) continue
    a.lastSeq = e.seq
    const t = TRIGGERS[e.kind]
    if (t) play(res, t.id(e, s), t.params(e, s))
  }
}
```

`Trigger = { id: (e, s) => SoundId; params: (e, s) => PlayParams }`, `PlayParams = { x?: number; y?: number; q?: number; mineral?: FlameKind; rate?: number; gain?: number; delay?: number; seq: number }`. World position present → panned/attenuated.

| `FxEventKind` | Sound id | Params |
|---|---|---|
| `swing` | `sfx_swing` | not positional; `rate ± 8 %` |
| `parryPerfect` | `sfx_parry-perfect` (+ ring layer sample) | `mineral = activeMineral` (burst filter); duck via `fx.flare` |
| `parryGood` | `sfx_parry` | `q = 1 - abs(e.a) / goodWindow` (e.a = signed delta s) |
| `parryPoor` | `sfx_parry-bad` | – |
| `flameHit` | `sfx_mon-hit` then `sfx_parry-bad` at `delay 0.04` | `x, y` |
| `hpHit` | `sfx_hurt` | master lowpass dip 18 k → 1.2 k → 18 k over 0.6 s |
| `monsterDie` | `sfx_mon-death` | `x, y`; `rate` by kind `e.a` (0 lurker 1.4, 1 stalker 1.0, 2 devourer 0.6) |
| `flameOut` | `sfx_flame-out` | – |
| `relight` | `sfx_relight` | – |
| `heal` | `sfx_plant-heal` | – |
| `mineTick` | `sfx_mine-hit` | `gain × 1.3` when `e.a === 4` (4th hit) |
| `mineDone` `a >= 0` | `sfx_mineral-collect` | `mineral = MINERALS[e.a]` (root 1046 / 784 / 523 Hz) |
| `mineDone` `a = -1` (pouch full) | `sfx_mine-empty` (R-134) | no `mineral` param: `MINERALS[-1]` is undefined and would give a NaN frequency, which makes `setValueAtTime` throw |
| `toss` | `sfx_flame-toss-sodium` / `-copper` / `-strontium` | by `MINERALS[e.a]` |
| `shakeOff` | `sfx_flame-shakeoff` | – |
| `roll` | `sfx_roll` | – |
| `beaconLit` | `sfx_beacon-ignite`, then `sfx_beacon-horn` at `delay 0.3` | – |
| `rockWarn` | `sfx_rock-warn` | `x, y` |
| `rockLand` | `sfx_rock-impact` | `x, y`; also rumble swell |
| `win` | `null` (music `mus_sting-win` via `musicFor`) | – |
| `death` | `sfx_player-death` | – |
| **added** `windup` | `sfx_eye-open`; devourer → `sfx_devourer-beat` | `x, y`; `rate` by kind |
| **added** `lunge` | `sfx_mon-lunge` | `x, y`; `rate` by kind |
| `relight a=1` (resin on a lit flame) | `sfx_resin` (`a=0`: `sfx_relight`) | – |
| `toss a=-1` (empty toss) | `ui_denied` | – |
| **added** `denied` (Beacon START GATE) | `ui_denied` | – |
| **added** `dodge` | `null` (visual only) | – |
| **added** `uiMove`, `uiConfirm`, `uiBack` | `ui_click`, `ui_confirm`, `ui_click` | ui group, not positional |
| **added** `copyLink` | `null` (consumed by `platformStep`, R-003) | – |

The authoritative `FxEventKind` union is [[architecture-state-2]] §7 (R-082 + `denied`); this table maps every member. `telegraph` and `resin` are not members (aliases of `windup` and `relight a=1`). Emitters: windup/lunge start (`src/systems/monsters.ts`, R-082), resin pickup (`pickups.ts`), toss with 0 pieces (`flame.ts`), Beacon gate (`stepBeacon`), menu cursor/confirm/back and copy (`src/systems/screens.ts`, R-003). `e.a` conventions: monster kind index 0/1/2, mineral index 0/1/2 (`mineDone` also `-1` = pouch full, R-134), parry delta s, mine hit count 1–4. The `sfx_mon-growl` ambience is NOT event-driven: `loopStep` picks one ring shade every 4–9 s (`hash2(meta.steps >> 8, m.id, 3)`), global gap ≥ 1.5 s.

## Related

- [[architecture]]
- [[architecture-resources]]
- [[architecture-resources-3]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-pipeline]]
- [[architecture-host-changes]]
- [[last-ember-design]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-systems-2]]
- [[index]]

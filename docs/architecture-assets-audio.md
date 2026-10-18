---
type: architecture
title: Last Ember – Audio Catalog 1 (Rules, Mix, Music, Ambience)
description: Audio part 1 for Last Ember – sample-vs-synth policy, file format decision (Ogg Vorbis plus AAC fallback), budget, master mix graph, groups, ducking, voice limits, autoplay unlock, volume persistence, then full entries for title music, adaptive descent loop with danger layer, escape music, stingers and cave ambience.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T20:40:00Z
---

# Last Ember – Audio Catalog 1: Rules, Mix, Music, Ambience

Hub: [[architecture]]. SFX catalog: [[architecture-assets-audio-2]]. Style/mood reference: [[architecture-assets-style]]. Animation frames that trigger sounds: [[architecture-assets-sprites]] Section 6. Loading, folders and budget enforcement: [[architecture-assets-pipeline]]. Gameplay source: [[last-ember-design]]. Schedule: [[last-ember-production-plan]].

## 1. Policy: what is a sample, what is synthesised

- **Samples (files):** music, ambience bed, monster voices, the Beacon horn, and the metallic ring layer of the perfect parry. These need organic timbre that a few lines of WebAudio cannot fake.
- **WebAudio-synthesised (code, 0 bytes):** everything short and mechanical: whooshes, hits, clicks, pickups, heartbeat, rumble, flame loop, sputter. Each catalog entry gives a 1–3 line recipe. One small `sfx` module owns the recipes (lives in `State`-free code, creates nodes on demand; see [[architecture-assets-pipeline]] for the HMR-safe audio host rule).
- Rationale: keeps the audio budget dominated by music only, and lets flame sounds follow energy/colour continuously (pitch, filter) which samples cannot do cheaply.
- **Every sampled SFX has a synth fallback recipe**, so a missing or failed sample never makes a gameplay event silent during development. Music has no fallback (silence).

Sound ids use the prefix of their group: `mus_`, `amb_`, `sfx_`, `ui_`. The `SoundId` union lists them all ([[architecture-assets-pipeline]]).

## 2. Format decision

| Item | Decision |
|---|---|
| Primary format | **Ogg Vorbis** `.ogg`, 44.1 kHz. Chrome, Edge and Firefox decode it via `decodeAudioData`. |
| Safari | Older Safari (macOS before Sonoma / Safari 17) cannot decode Ogg Vorbis; newer Safari versions added Ogg support, but the exact first version is **not verified here** — treat Safari Ogg as unreliable. |
| Fallback | Ship **AAC in `.m4a`** next to every `.ogg` (same base name). The loader picks once at startup: `new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '' ? 'ogg' : 'm4a'`. Only ONE format is fetched per browser. |
| Why not MP3 only | MP3 adds encoder padding that breaks seamless loops unless `loopStart/loopEnd` are hand-tuned per file; Ogg loops sample-accurately. |
| Why not Opus | Opus-in-Ogg has the same Safari gap and saves little at music bitrates. |
| Channels | Music stereo; ambience and all SFX samples **mono** (SFX panned in code). |
| Bitrates | Music: Vorbis q1 (~80 kbps stereo) / AAC 80 kbps. Ambience: q1 mono (~64 kbps) / AAC 64 mono. SFX: q4 mono (~64 kbps) / AAC 64 mono. Encode: `ffmpeg -i in.wav -c:a libvorbis -q:a 1 out.ogg` and `ffmpeg -i in.wav -c:a aac -b:a 80k out.m4a`. |
| Loudness | Master every file to about −16 LUFS integrated (music), −20 LUFS (ambience), SFX peak −3 dBFS. Gain staging in code is relative to these. |
| Loops | Export loops at exact bar length, no fades at the ends. Loop by `AudioBufferSourceNode.loop = true` with `loopStart`/`loopEnd` from the manifest (seconds). |

## 3. Budget

| Group | Files | Est. size (one format) |
|---|---|---|
| Music (title 48 s, descent base 72 s, danger layer 72 s, escape 48 s = 240 s at ~80 kbps ≈ 10 KB/s) | 4 | 0.48 + 0.72 + 0.72 + 0.48 = **≈ 2.4 MB** |
| Stingers (win 6 s, death 5 s) | 2 | ≈ 0.11 MB |
| Ambience bed (40 s loop, mono 64 kbps) | 1 | ≈ 0.32 MB |
| SFX samples (≈ 10 short mono) | ~10 | ≈ 0.12 MB |
| **Total downloaded** | | **≈ 2.95 MB** — CI audio limit **3.3 MB** (R-140; was 3 MB, which left 1.7 % headroom for VBR q1). |

**Rule:** if over budget, shorten the title loop to 32 s first, then make the danger layer mono, then cut the descent pair to 48 s (16 bars at 80 BPM = 48.0 s). `dist/` holds both formats (≈ 6 MB on disk), but each player downloads one. Enforced by the size check in [[architecture-assets-pipeline]].

## 4. Mix graph

```
AudioContext
 ├─ musicGain   (0.55) ─┐
 ├─ ambGain     (0.45) ─┤
 ├─ sfxGain     (0.90) ─┼─► masterGain (user volume, default 0.7) ─► DynamicsCompressor ─► destination
 └─ uiGain      (0.70) ─┘
```

Master default **0.7** (superseded 0.8, [[architecture-rulings]] R-025). Pan reference: fixed 240 world px, not `viewW/2` ([[architecture-rulings-2]] R-092, [[architecture-resources-2]] §3).

- Compressor: threshold −18 dB, knee 12, ratio 4, attack 0.005 s, release 0.2 s (protects against parry + growl + rumble pile-ups).
- Per-sound nodes: `source → gain (base gain × variation) → StereoPanner (pan = clamp((x − camX)/(viewW/2), −1, 1) × 0.6) → group gain`. Distance attenuation for world sounds: `gain × clamp(1 − d/480, 0, 1)` (480 world units ≈ 15 tiles). UI and player sounds are not panned or attenuated.
- All gain changes use `setTargetAtTime(v, now, 0.05)` — never jump values (clicks).

## 5. Ducking rules

| Trigger | Ducks | Amount | Attack / release |
|---|---|---|---|
| `sfx_parry-perfect` | music, ambience | −6 dB | 0.01 s / 0.6 s |
| `sfx_beacon-ignite` + `sfx_beacon-horn` | music to 0 (descent stops), ambience −9 dB | full | 0.05 s / until `mus_escape` starts |
| `mus_sting-death` / `mus_sting-win` | all other music stopped, ambience −12 dB, sfx −6 dB | | 0.1 s / screen leaves |
| `paused` screen | music −10 dB, ambience −10 dB, sfx group muted (and `ctx.suspend()` after 0.3 s fade) | | 0.1 s / 0.2 s |
| Low HP (1 pip) | music −3 dB so the heartbeat reads | | 0.5 s / 0.5 s |

## 6. Voices, priority and stealing

- Global SFX voice cap: **24** concurrent sources. Each sound has its own cap (catalog). When a cap is hit: **steal the oldest voice of the same id**; if the global cap is hit, steal the lowest-priority oldest voice; priority 3 (critical) never gets stolen.
- Priority scale: **3** critical feedback (parry, player hurt, Beacon, flame-out), **2** threats (monster telegraph/lunge, rock warning), **1** world (mining, pickups, deaths), **0** cosmetic (UI clicks; footsteps and hover were dropped as orphans, R-138).
- Re-trigger guard: the same id cannot start twice within 30 ms (prevents doubled events in one frame).
- Variation: unless a recipe says otherwise, every SFX play gets playbackRate × random(0.94, 1.06) and gain × random(0.9, 1.0).

## 7. Autoplay unlock and lifecycle

- Browsers block audio until a user gesture. Create the `AudioContext` lazily on the **first `pointerdown` or `keydown`** (the `title` screen asks "click to start", which doubles as the unlock). Then `ctx.resume()`.
- Decode all files after unlock in priority order (P0 first). Music starts when its buffer is ready; if not ready, it starts at the next loop point check (every 250 ms).
- The context must live outside `game.ts` module scope re-evaluation (HMR rule in AGENTS.md). **Superseded by [[architecture-rulings-2]] R-091:** one context per page in the `getResources()` registry, **never closed** (no `import.meta.hot.dispose`); listeners via the `installAudioListeners` trampoline ([[architecture-resources]] §3–§5). Music start retries every update step, not every 250 ms (R-092).
- `visibilitychange` hidden → `ctx.suspend()`; visible and screen is `playing` → `resume()`.

## 8. Volume persistence

**Superseded by [[architecture-rulings]] R-025:** key `last-ember:settings`, `SettingsRecord = { v: 1; volume; muted; lastSeed; reducedFlash; quality }` (volume default 0.7; `quality` per R-142), no group sliders. Detail: [[architecture-resources-3]] §3. `M` toggles mute in every screen. The old per-group JSON key of this section is history.

## 9. Music

Music tool: **Suno or Udio**, instrumental mode. Generate 2–4 candidates per track, pick one, trim to exact bars in Audacity/Reaper, export loop points. Log tool, prompt, seed/song id in README `AI process` ([[architecture-assets-style]] Section 11). No artist names in prompts.

### 9.1 `mus_title` — music, P1

- **Trigger:** `title` and `help` screens; fades out 1 s on start of run.
- **Sounds like:** slow, lonely, warm-but-uneasy. 66 BPM, D minor. A single fingerpicked nylon guitar or dulcimer motif over a low bowed cello drone; soft crackling-fire texture underneath; a distant airy choir pad that swells once per phrase. No drums. Sparse — space between notes is the point.
- **Length/loop:** ≈ 48 s, trimmed to whole bars: at 66 BPM 13 bars of 4/4 = 47.27 s; loopStart 0, loopEnd 47.27.
- **Gain:** 0.8 within music group. Voices: 1.
- **Prompt (Suno/Udio):** `instrumental, dark ambient folk, 66 bpm, D minor, lonely fingerpicked acoustic guitar motif, low bowed cello drone, soft crackling campfire texture, distant airy choir pad, no drums, sparse, cave, melancholic, seamless loop`.

### 9.2 `mus_descent` + `mus_descent-danger` — adaptive loop, P0 (base) / P1 (danger layer)

**Decision (cheap default kept):** ONE descent loop for all zones + ONE danger layer, both the same length and tempo, started sample-synchronously (`start(t0)` same `t0`). The layer gain follows danger. Zone identity comes from the ambience pitch and tint, not from separate music.

- **Danger value** (0–1, computed by gameplay): `max(nearest-telegraphing-shade ? 1 : 0, 1 − energy/energyMax × 1.5 clamped, shadesInRing/6)`. Layer gain = `danger` smoothed with time constant 0.4 s; base gain stays 0.7.
- **Base sounds like:** 80 BPM, D minor, tense and hollow. A soft low synth pulse on quarter notes (like a slow heartbeat on a felted kick), a sustained sub drone, a sparse glassy music-box/kalimba figure every 2 bars echoing in a cave reverb, occasional metallic drips. Mood: careful walking in the dark.
- **Danger layer sounds like:** same tempo/key; scraping col legno strings in 8ths, a rising dissonant string cluster (minor 2nds), a low taiko hit on beats 1 and 3, breathy whispers-like noise swells. On its own it sounds incomplete; layered it turns the base into a threat.
- **Length/loop:** both exactly 72 s (24 bars at 80 BPM = 72.0 s); loopStart 0, loopEnd 72.0.
- **Prompts:** base: `instrumental, dark ambient, 80 bpm, D minor, slow felt kick pulse like a heartbeat, deep sub drone, sparse glassy kalimba motif with cave reverb, water drips, tense, minimal, no melody lead, seamless loop`. Danger: `instrumental, horror tension layer, 80 bpm, D minor, scraping col legno strings in eighth notes, dissonant rising string cluster, low taiko hits on beats 1 and 3, breathy noise swells, no melody, seamless loop`. Generate the danger layer as a **stem**: if the tool cannot match tempo exactly, time-stretch in Audacity to 72.0 s.

### 9.3 `mus_escape` — music, P1

- **Trigger:** starts 1.5 s after `sfx_beacon-horn`, phase `escape`, loops until `won`/`dead`.
- **Sounds like:** frantic, heroic-desperate. 150 BPM, D minor → modulating to F major in the last 8 bars (hope). Driving low tom/taiko ostinato in 16ths, distorted cello ostinato, brass stabs, rising choir "ah", rumbling sub. Mood: the cave is collapsing behind you, run.
- **Length/loop:** 48 s (30 bars at 150 BPM = 48.0 s); loopStart 0, loopEnd 48.0.
- **Prompt:** `instrumental, epic action chase, 150 bpm, D minor, driving taiko and low tom ostinato in sixteenths, aggressive cello ostinato, brass stabs, rising choir ahs, rumbling sub bass, desperate escape, collapsing cave, seamless loop`.

### 9.4 Stingers — music, P1

| Id | Trigger | Sounds like | Length | Prompt |
|---|---|---|---|---|
| `mus_sting-win` | screen `won` | warm major resolution: choir and brass swell into a D major chord, a bright chime, birdsong/wind of the outside world fading in at the end | 6 s, no loop | `short orchestral victory sting, warm brass and choir swell resolving to D major, bright chime, gentle outdoor wind and birdsong at the end, 6 seconds` |
| `mus_sting-death` | screen `dead` | a low cello note bends down, a single bell tolls, a breath of wind snuffs everything; ends in silence | 5 s, no loop | `short dark sting, low cello note bending downward, a single deep bell toll, a breath of wind, ends in silence, 5 seconds` |

## 10. Ambience

### 10.1 `amb_cave` — ambience, P0

- **Trigger:** `playing`, both phases; fades in 2 s on run start.
- **Sounds like:** a large cave: very low airflow rumble (40–80 Hz), random distant water drips with long reverb tails, a faint stone creak every ~10 s, rare far-away tiny pebble falls. No melodic content, no animal sounds.
- **Zone behaviour:** playbackRate per zone: z1 1.00, z2 0.96, z3 0.92, z4 0.88 (lower and darker as you descend), lowpass 8 kHz → 3 kHz by zone, crossfaded over 2 s when the zone changes. In `escape`: playbackRate 1.0, add `sfx_cave-rumble` bed.
- **Length/loop:** 40 s, loopStart 0, loopEnd 40.0 (crossfade-baked: tail mixed into the head before export).
- **Source:** AI SFX tool (ElevenLabs Sound Effects or Stable Audio) with prompt `deep cave ambience, low airflow rumble, distant water drips with long reverb, faint stone creaks, no animals, no music, seamless loop, 40 seconds`; or synth fallback: brown noise → lowpass 200 Hz gain 0.3 + random drip voices (Section recipe `sfx_drip` in [[architecture-assets-audio-2]]).
- **Gain:** 0.8 within ambience. Voices: 1.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-audio-2]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-resources]]
- [[architecture-resources-3]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]

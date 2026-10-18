---
type: architecture
title: Last Ember – Audio Catalog 2 (Sound Effects)
description: Audio part 2 for Last Ember – every sound effect with id, trigger, sound description, length, source (WebAudio synth recipe or AI sample prompt), group, base gain, priority, voice cap and slice priority; includes the layered perfect-parry design, flame loop modulation, monster voices, Beacon sequence, rocks, UI sounds and the P0 slice list.
tags: [project, ai-jam-5, architecture, last-ember, assets]
timestamp: 2026-10-17T20:50:00Z
---

# Last Ember – Audio Catalog 2: Sound Effects

Rules, formats, mix graph, ducking, voice stealing, unlock: [[architecture-assets-audio]] (read first). Animation frames that fire these sounds: [[architecture-assets-sprites]] Section 6. Loader: [[architecture-assets-pipeline]]. Gameplay: [[last-ember-design]].

## 1. How to read an entry

`id` | group | source | length | base gain | priority (0–3) | cap (voices) | P-level

- **Source `synth`:** WebAudio recipe, 0 bytes. Notation: `osc(type,f)`, `noise(white|pink|brown)`, `bp/lp/hp(f,Q)` biquad, `env(a,d,s,r)` gain envelope in seconds, `→` connection, `f: x→y over t` exponential ramp.
- **Source `sample`:** a file `<id>.ogg` + `.m4a`, mono, made with an AI SFX generator (ElevenLabs Sound Effects, Stable Audio Open, or similar; log in README). The synth recipe listed beside it is the fallback until the file arrives.
- **Base gain** is inside its group (group gains in [[architecture-assets-audio]] Section 4).
- P0 = needed for the Day 4/5 slice; P1 = full game; P2 = polish.

## 2. Flame

### `sfx_flame-loop` | sfx | synth | continuous | 0.35 | 3 | 1 | **P0**
- **Trigger:** runs while the flame is lit in `descent`; stops (0.2 s fade) at flame-out and in `escape`.
- **Sounds like:** a soft breathing torch: low roar with tiny crackles. Louder and brighter with more energy.
- **Recipe:** `noise(brown) → lp(f) → gain(g)`; `f = 300 + 900·e` Hz, `g = 0.15 + 0.35·e` where `e = energy/energyMax`. Crackle: every random 40–160 ms a 6 ms `noise(white) → hp(3000) → env(0,0.006,0,0)` at gain 0.1·e. Flame type colours the filter: `sodium` f×1.25 (brighter), `copper` adds `bp(1800,8)` shimmer at 0.05, `strontium` f×0.7 (muffled).

### `sfx_flame-toss-<mineral>` (`-sodium`, `-copper`, `-strontium`) and `sfx_flame-shakeoff` | sfx | synth | 0.5 s | 0.8 | 2 | 1 each | **P0**
- **Trigger:** mineral tossed into the flame; shake-off back to `plain`.
- **Sounds like:** a "whoomph" as the flame catches the powder, then a short coloured sizzle. Sodium: bright, hissy, upward. Copper: glassy, with a chiming tail. Strontium: deep, dark, downward. Shake-off: a dry flick and a little fizzle.
- **Recipe (shared base):** `noise(pink) → bp(f: 400→2400 over 0.25, Q 1.2) → env(0.01,0.3,0,0.15)` gain 0.7. Plus per mineral: sodium `osc(sine, 1200→2400 over 0.3)` gain 0.15; copper `osc(triangle,1568)+osc(triangle,2349)` env(0,0.4) gain 0.12 (a fifth chime); strontium `osc(sawtooth,110→70 over 0.4) → lp(600)` gain 0.25. Shake-off: base with f 1500→300 over 0.15, gain 0.4.

### `sfx_flame-out` | sfx | synth | 0.9 s | 0.9 | 3 | 1 | **P0**
- **Trigger:** energy reaches 0.
- **Sounds like:** the torch sputters 3 times and dies with a smoky hiss — unmistakable "you are exposed".
- **Recipe:** 3 bursts at 0, 0.18, 0.34 s: `noise(brown) → lp(700→200)` env(0,0.12) decreasing gain 0.8/0.5/0.3; then `noise(white) → hp(2000)` env(0.05,0.5) gain 0.15 (smoke hiss).

### `sfx_relight` | sfx | synth | 0.6 s | 0.9 | 3 | 1 | **P0**
- **Trigger:** resin relights a dead flame (resin on a lit flame plays `sfx_resin` only).
- **Sounds like:** a match-strike scratch, then a warm whoosh blooming up.
- **Recipe:** `noise(white) → bp(3500,2)` env(0,0.06) gain 0.5; at 0.05 s `noise(pink) → lp(f: 300→2000 over 0.4)` env(0.05,0.35,0,0.2) gain 0.8.

## 3. Torch, parry, roll

### `sfx_swing` | sfx | synth | 0.2 s | 0.5 | 1 | 2 | **P0**
- **Trigger:** every click swing (start of `player_body swing`).
- **Sounds like:** a quick airy whoosh of a burning stick, slightly fiery.
- **Recipe:** `noise(pink) → bp(f: 600→1800→700 over 0.2, Q 2) → env(0.02,0.18)` gain 0.6; pitch ±8 % random.

### `sfx_parry` (normal, imperfect) | sfx | synth | 0.35 s | 0.8 | 3 | 2 | **P0**
- **Trigger:** lunging shade hit inside the window but not perfect.
- **Sounds like:** a solid dull impact plus a short fire puff. Good, not glorious. Quality scales: the further from perfect, the duller.
- **Recipe:** `osc(sine,f: 140→60 over 0.12)` env(0,0.15) gain 0.8 (thud) + `noise(pink) → bp(900,1)` env(0,0.2) gain 0.5. `q` = timing quality 0–1: thud gain × (0.6+0.4q), add `bp(2500)` brightness gain 0.2·q.

### `sfx_parry-perfect` — THE satisfying sound | sfx | **sample + synth layers** | 1.4 s | 1.0 | 3 | 1 | **P0** (synth layers), P1 (ring sample)
- **Trigger:** perfect parry. Fires with the flare visual, ducks music/ambience −6 dB (audio Section 5), and the engine applies a 60 ms hit-stop.
- **Sounds like (three layers, all start at t=0, mixed to feel like one hit):**
  1. **Metallic ring** — a struck bell-anvil: very fast attack, bright inharmonic partials (fundamental ~880 Hz with partials around 2.4× and 4.1×), a shimmering 1.2 s decay that wobbles slightly (beating). Clean and high — the "ting" the player remembers.
  2. **Flame burst** — a big, short fire "FWOOMPH": low-mid noise swelling and opening in 80 ms, decaying by 0.4 s, in the current flame colour (filter shift per mineral as in `sfx_flame-loop`).
  3. **Low thud** — a chest-felt impact: sine drop 90→40 Hz in 0.15 s with a tiny click at the onset.
- Mood: power, precision, "the dark flinched". It must cut through any mix (priority 3, never stolen).
- **Sample prompt (layer 1):** `single metallic bell anvil strike, bright shimmering ring, inharmonic, clean, fast attack, 1.2 second decay, no reverb tail cut, mono` → trim to 1.3 s, normalise −3 dBFS → `sfx_parry-perfect-ring`.
- **Synth for layers 2–3 (always synth) and ring fallback:** ring fallback = 3 `osc(sine)` at 880, 2112, 3608 Hz, gains 0.5/0.3/0.15, env(0.001,1.2), slight detune +3 Hz on a second 880 Hz osc (beating). Burst = `noise(pink) → lp(f: 400→3000 over 0.08 then →600 over 0.3)` env(0.005,0.4) gain 0.9. Thud = `osc(sine,f: 90→40 over 0.15)` env(0,0.25) gain 1.0 + `noise(white)` env(0,0.004) gain 0.3.

### `sfx_parry-bad` | sfx | synth | 0.5 s | 0.7 | 3 | 1 | **P0**
- **Trigger:** swing too early/late for a block (hit lands; flame energy lost) or the hit drains flame without a parry.
- **Sounds like:** a wet hiss of a flame being smothered, plus a soft choked thump — "that cost you".
- **Recipe:** `noise(white) → hp(1500) → env(0.01,0.45)` gain 0.5 with lp sweeping 6000→1200; + `osc(sine,80)` env(0,0.1) gain 0.4.

### `sfx_roll` | sfx | synth | 0.3 s | 0.6 | 1 | 1 | **P1**
- **Trigger:** roll in `escape`.
- **Sounds like:** cloth-and-gravel whoosh with a scuff at the end.
- **Recipe:** `noise(pink) → bp(f: 400→1200, Q 1.5)` env(0.02,0.22) gain 0.5; at 0.24 s `noise(white) → bp(2500,3)` env(0,0.05) gain 0.3.

`sfx_roll-ready` was dropped (no event triggers it, R-138).

## 4. Mining and pickups

| id | Trigger | Sounds like | Source / recipe | Len | Gain | Pri | Cap | P |
|---|---|---|---|---|---|---|---|---|
| `sfx_mine-hit` | every 0.5 s while mining (4 hits in 2 s) | pick on crystal: a dry clack with a glassy chip; last hit louder | synth: `noise(white) → bp(2800,6)` env(0,0.05) g0.6 + `osc(triangle, 1800–2600 random)` env(0,0.12) g0.25; 4th hit ×1.3 | 0.15 s | 0.7 | 1 | 2 | P0 |
| `sfx_mineral-collect` | vein mined, chunk into inventory | crystalline 3-note rising arpeggio, in the mineral's character (sodium high, copper mid, strontium low) | synth: `osc(triangle)` notes root, +4, +7 semitones at 0/0.06/0.12 s, env(0,0.2); root sodium 1046 Hz, copper 784, strontium 523 | 0.35 s | 0.6 | 1 | 2 | P0 |
| `sfx_resin` | resin picked up (lit flame) | sticky squelch + the flame flaring up a notch | synth: `noise(brown) → lp(500)` env(0,0.08) g0.4 + `noise(pink) → lp(f: 600→1800)` env(0.02,0.25) g0.5 | 0.35 s | 0.7 | 1 | 2 | P0 |
| `sfx_plant-heal` | plant picked (+1 HP) | soft rustle then a warm, gentle two-note chime (major third) with a breathy pad swell | synth: `noise(pink) → bp(3000,1)` env(0,0.1) g0.2; `osc(sine)` 659 then 831 Hz at 0/0.12, env(0.01,0.5) g0.3 | 0.7 s | 0.7 | 2 | 1 | P0 |
| `sfx_mine-empty` | `mineDone a = -1`: pouch full, the chunk cannot be taken (R-134) | a distinct "pouch full" sound: dull double stone clack, clearly not a chime, so the player hears that nothing was collected | synth: `osc(square, f: 220→196 over 0.08) → lp(900)` env(0,0.12) g0.45 + `noise(pink) → bp(1400,2)` env(0,0.05) g0.3 (THUD class, [[architecture-resources-3]] §2.9) | 0.15 s | 0.5 | 1 | 1 | P1, **slice B** |

## 5. Monsters

Monster voices are **samples** (organic), with a synth fallback. One sample per verb is shared across sizes and **pitched by size**: lurker playbackRate 1.4, stalker 1.0, devourer 0.6 (plus gain lurker 0.6, stalker 0.8, devourer 1.0). This gives 4 voice files instead of 12. Positional (panned, distance-attenuated).

| id | Trigger | Sounds like | Sample prompt | Synth fallback | Len | Pri | Cap | P |
|---|---|---|---|---|---|---|---|---|
| `sfx_eye-open` | telegraph start (eyes go bright) | a wet eyelid click and a thin rising breath-whine — the cue to parry | `creepy wet click followed by a short thin rising inhaled whine, horror creature, mono, 0.4 seconds` | `noise(white) → bp(f: 800→3000 over 0.35, Q 8)` env(0.02,0.35) g0.5 + click `noise` env(0,0.005) | 0.4 s | 2 | 3 | P0 |
| `sfx_mon-growl` | random every 4–9 s per shade in the ring (max 1 audible per 1.5 s globally) | breathy, layered low growl with rattling throat, like air through a cave crack | `low breathy shadow creature growl, rattling throat, airy, unsettling, no words, mono, 1.2 seconds` | `noise(brown) → bp(180,3)` with 12 Hz tremolo (LFO on gain depth 0.5) env(0.2,1.0) | 1.2 s | 1 | 3 | P1 |
| `sfx_mon-lunge` | lunge frame 0 | a sharp shriek-hiss lunging at you, Doppler-ish rising | `short aggressive creature hiss shriek lunging, rising pitch, mono, 0.4 seconds` | `noise(white) → bp(f: 1200→4000 over 0.25, Q 3)` env(0.01,0.3) g0.7 | 0.4 s | 2 | 3 | P0 |
| `sfx_mon-hit` | shade hits the player (flame drained or HP lost) | heavy smack with a smoke-puff hiss | (synth only) | `osc(sine,f: 120→50 over 0.1)` env(0,0.15) g0.8 + `noise(pink) → lp(1500)` env(0,0.25) g0.5 | 0.3 s | 3 | 2 | P0 |
| `sfx_mon-death` | death frame 0 | the shade tears apart: a reversed whisper sucking in, then ink splatter and a puff | `shadow creature dissolving, reversed whisper sucking inward, then wet splatter and soft puff, mono, 0.8 seconds` | `noise(pink) → bp(f: 3000→300 over 0.5, Q 2)` env(0.3,0.2) g0.6 + splat `noise(brown)` env(0,0.1) | 0.8 s | 1 | 4 | P0 |
| `sfx_devourer-beat` | each devourer telegraph beat (A and B) | a deep, slow heartbeat-like "DUM" with a groan — two beats warn | (synth only) | `osc(sine,f: 70→45 over 0.25)` env(0,0.4) g1.0 + `noise(brown) → lp(300)` env(0.05,0.4) g0.4 | 0.5 s | 2 | 1 | P1 |

## 6. Player state

| id | Trigger | Sounds like | Source / recipe | Len | Gain | Pri | Cap | P |
|---|---|---|---|---|---|---|---|---|
| `sfx_hurt` | HP pip lost | a pained grunt-less impact: muffled thump + sharp crack of the ember-heart + 150 ms low-pass "ears ringing" on the master | synth: `osc(sine,f: 200→80)` env(0,0.15) g0.9 + `noise(white) → hp(3000)` env(0,0.04) g0.4; master lp 18000→1200→18000 over 0.6 s | 0.4 s | 0.9 | 3 | 1 | P0 |
| `sfx_heartbeat` | loops while HP = 1 | lub-dub at 70 BPM, felt more than heard | synth: two `osc(sine,55)` env(0,0.12) g0.8 and g0.55 at 0 and 0.28 s, repeating every 0.857 s | loop | 0.7 | 3 | 1 | P1 |
| `sfx_player-death` | player dies | the last breath: a long exhale and the cave going quiet | synth: `noise(pink) → lp(f: 1500→200 over 1.2)` env(0.1,1.2) g0.6; then `mus_sting-death` | 1.3 s | 0.8 | 3 | 1 | P1 |

## 7. Beacon and cave collapse

| id | Trigger | Sounds like | Source / recipe | Len | Gain | Pri | Cap | P |
|---|---|---|---|---|---|---|---|---|
| `sfx_beacon-charge` | hold on the Beacon (~5 s, ASSUMPTION), loops; pitch follows progress | a rising roar like bellows on coals, plus a slowly rising tonal hum | synth: `noise(brown) → lp(300+2500·p)` g(0.2+0.5·p) + `osc(sawtooth,55·2^(2p)) → lp(800)` g0.15; p = progress 0–1. Release → stop 0.2 s fade | ≤ 5 s | 0.8 | 3 | 1 | P1 |
| `sfx_beacon-ignite` | hold complete | a huge FWOOM and roaring blaze, low boom underneath | synth: burst as perfect-parry layer 2 ×2 length, gain 1.0 + `osc(sine,f: 60→30 over 0.8)` env(0,1.0) g1.0 | 1.5 s | 1.0 | 3 | 1 | P0 |
| `sfx_beacon-horn` | 0.3 s after ignite (ASSUMPTION in spec) | an ancient deep horn blast echoing through the whole cave, two notes (D2 then A1), ominous — it wakes everything | sample: `ancient deep war horn blast echoing in a huge cave, two long low notes, ominous, mono, 4 seconds`. Fallback: `osc(sawtooth,73.4)` then `osc(sawtooth,55)` → lp(600) env(0.3,1.5) each + convolver-free echo: 3 delayed copies at 0.35 s, gains 0.5/0.25/0.12 | 4 s | 1.0 | 3 | 1 | P1 |
| `sfx_cave-rumble` | continuous in `escape` + swell on each shake | deep earth groan, gravel trickle | synth: `noise(brown) → lp(120)` g0.4 + random 0.5 s swells to g0.9; trickle `noise(white) → bp(4000,2)` random grains | loop | 0.6 | 1 | 1 | P1 |
| `sfx_rock-warn` | telegraph shadow appears (~1 s before impact) | a crack overhead and a falling-gravel whistle getting louder | synth: `noise(white) → bp(f: 5000→1500 over 1.0, Q 4)` env(0.9,0.1) g0.4 | 1.0 s | 0.7 | 2 | 4 | P1 |
| `sfx_rock-impact` | boulder lands | heavy rock slam, debris scatter, a short rumble | sample: `heavy boulder slamming onto stone floor, debris scatter, short rumble, mono, 1 second`. Fallback: `osc(sine,f: 80→35)` env(0,0.4) g1.0 + `noise(pink) → lp(2000)` env(0,0.5) g0.6 | 1.0 s | 0.9 | 2 | 4 | P1 |
| `sfx_drip` | ambience fallback only; random 2–6 s | single water drip in a big cave | synth: `osc(sine,f: 1800→900 over 0.04)` env(0,0.05) g0.3 + 3 delayed copies 0.18/0.36/0.54 s at 0.3/0.15/0.07 | 0.6 s | 0.4 | 0 | 2 | P2 |

## 8. UI

| id | Trigger | Sounds like | Recipe (synth, uiGain) | Len | Gain | Cap | P |
|---|---|---|---|---|---|---|---|
| `ui_click` | button press, hotbar select (1–3 / Q / E) | dry wooden click | `noise(white) → bp(2200,4)` env(0,0.03) g0.5 + `osc(sine,660)` env(0,0.04) g0.2 | 0.05 s | 0.6 | 2 | P1 |
| `ui_confirm` | start run, restart, back to menu | ember pop and a short warm rise | `osc(triangle,f: 440→880 over 0.12)` env(0,0.18) g0.4 + `noise(pink) → lp(1200)` env(0,0.1) g0.3 | 0.2 s | 0.7 | 1 | P1 |
| `ui_denied` | toss with 0 of that mineral | short low buzz | `osc(square,110) → lp(800)` env(0,0.12) g0.3 | 0.12 s | 0.5 | 1 | P1 |

## 9. Counts and P0 slice

- **Entries:** music 4 (`mus_title`, `mus_descent`, `mus_descent-danger`, `mus_escape`) + stingers 2 + ambience 1 + SFX 33 (flame 7 incl. 3 tosses and shake-off, torch/parry/roll 5, mining/pickups 5, monsters 6, player 3, Beacon/cave 7) + UI 3 = **43 `SoundId`s** (R-138 dropped the orphans `sfx_roll-ready`, `sfx_step`, `ui_hover`; `sfx_mine-empty` is now wired by R-134), plus the internal layer file `sfx_parry-perfect-ring` (not a `SoundId`; played by `sfx_parry-perfect`).
- **Files (samples):** 7 music/ambience + 7 SFX samples (`sfx_parry-perfect-ring`, `sfx_eye-open`, `sfx_mon-growl`, `sfx_mon-lunge`, `sfx_mon-death`, `sfx_beacon-horn`, `sfx_rock-impact`) → **14 files per format** (28 in `dist/`). Everything else (30 ids) is synthesised.
- **P0 slice (Day 4/5):** `mus_descent`, `amb_cave`, `sfx_flame-loop`, 4 tosses/shake-off, `sfx_flame-out`, `sfx_relight`, `sfx_swing`, `sfx_parry`, `sfx_parry-perfect` (synth layers), `sfx_parry-bad`, `sfx_mine-hit`, `sfx_mineral-collect`, `sfx_resin`, `sfx_plant-heal`, `sfx_eye-open`, `sfx_mon-lunge`, `sfx_mon-hit`, `sfx_mon-death`, `sfx_hurt`, `sfx_beacon-ignite`. All P0 SFX work as synth on Day 4 with zero files.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[last-ember-production-plan]]
- [[architecture-assets-audio]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-rulings-3]]

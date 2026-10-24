// Second half of the procedural SFX recipes (R3 §2.1-2.9; catalog audio-2 §3-8). Imported by synth-2.ts into SYNTH (R-093).
// Rules: every node is created per play, no module-level mutable state, no timers/listeners, no Math.random
// (hashOffset / hash2 only). Loops use looping noise + long-lived oscillators; sfx.ts stops them via gain ramp + stop().
import type { AudioRes } from '../assets/resources.ts'
import type { SoundId } from '../assets/sounds.ts'
import { hash2 } from '../core/noise.ts'
import { T } from '../core/tuning.ts'
import type { NoiseKind, Recipe } from './synth.ts'
import { biquad, env, layers, noise, osc, thud, whoosh } from './synth.ts'

const LOOP_S = 900 // ponytail: loops outlive any run (~10 min); sfx.ts re-creates a loop if it ever runs out
const CENT14 = 2 ** (14 / 1200)

const gainNode = (a: AudioRes, v: number, out: AudioNode): GainNode => {
  const g = a.ctx!.createGain()
  g.gain.value = v
  g.connect(out)
  return g
}

/** Gain node feeding an AudioParam (LFO depth). */
const mod = (a: AudioRes, depth: number, param: AudioParam): GainNode => {
  const g = a.ctx!.createGain()
  g.gain.value = depth
  g.connect(param)
  return g
}

/** Noise -> biquad -> env(att, d, g) -> out; `rate` scales the noise playbackRate. */
const burst = (
  a: AudioRes, kind: NoiseKind, type: BiquadFilterType, f: number, q: number,
  t: number, att: number, d: number, g: number, out: AudioNode, rate = 1,
): AudioBufferSourceNode => {
  const n = noise(a, kind, t, att + d * 1.25, biquad(a, type, f, q, env(a.ctx!, t, att, d, g, out)))
  if (rate !== 1) n.playbackRate.value = rate
  return n
}

// ---------- WHOOSH / HISS / THUD class entries ----------
const roll: Recipe = layers(
  whoosh({ f0: 400, f1: 1200, t1: 0.3, q: 1.5, a: 0.02, d: 0.22, peak: 0.5 }),
  (a, out, t) => [burst(a, 'white', 'bandpass', 1500, 3, t + 0.24, 0.008, 0.05, 0.15, out)], // scuff at the end, soft attack
)
const mineEmpty: Recipe = thud({
  type: 'square', f0: 220, f1: 196, tf: 0.08, d: 0.12, g: 0.45, lp: 900,
  n: [{ kind: 'pink', filter: 'bandpass', f: 1400, q: 2, d: 0.05, g: 0.3 }],
})
const devourerBeat: Recipe = thud({
  f0: 70, f1: 45, tf: 0.25, d: 0.4, g: 1,
  n: [{ kind: 'brown', filter: 'lowpass', f: 300, a: 0.05, d: 0.4, g: 0.4 }],
})
const rockWarn: Recipe = whoosh({ kind: 'white', f0: 5000, f1: 1500, t1: 1.0, q: 4, a: 0.9, d: 0.1, peak: 0.4 })
const rockImpact: Recipe = thud({
  f0: 80, f1: 35, tf: 0.3, d: 0.4, g: 1,
  n: [{ kind: 'pink', filter: 'lowpass', f: 2000, d: 0.5, g: 0.6 }],
})
// soft "tock": sine only, 3 ms attack (the former white-noise layer was the click)
const uiClick: Recipe = (a, out, t) => [osc(a, 'sine', 660, 660, t, 0.05, env(a.ctx!, t, 0.003, 0.04, 0.2, out))]
const uiConfirm: Recipe = thud({
  type: 'triangle', f0: 440, f1: 880, tf: 0.12, d: 0.18, g: 0.4,
  n: [{ kind: 'pink', filter: 'lowpass', f: 1200, d: 0.1, g: 0.3 }],
})
const uiDenied: Recipe = thud({ type: 'square', f0: 110, f1: 110, tf: 0.1, d: 0.12, g: 0.3, lp: 800, n: [] })

// ---------- monsters ----------
const eyeOpen: Recipe = layers(
  whoosh({ kind: 'white', f0: 800, f1: 3000, t1: 0.35, q: 8, a: 0.02, d: 0.35, peak: 0.5 }),
  (a, out, t) => [burst(a, 'white', 'lowpass', 2500, 0.7, t, 0.006, 0.02, 0.2, out)], // wet click, darkened and softened
)
// R3 §2.6: detuned saw pair, rate (lurker 1.4 / stalker 1.0 / devourer 0.6) scales every oscillator frequency.
const sawPair = (a: AudioRes, t: number, r: number, dur: number, dst: AudioNode): AudioScheduledSourceNode[] => [
  osc(a, 'sawtooth', 92 * r, 92 * r, t, dur, dst),
  osc(a, 'sawtooth', 92 * r * CENT14, 92 * r * CENT14, t, dur, dst),
]
const monGrowl: Recipe = (a, out, t, p) => {
  const c = a.ctx!
  const r = p.rate ?? 1
  const trem = gainNode(a, 0.5, env(c, t, 0.2, 1.0, 0.55, out)) // tremolo: 0.5 + 0.5 * sine(12 Hz)
  const depth = mod(a, 0.5, trem.gain)
  const lp = biquad(a, 'lowpass', 420 * r, 6, trem)
  return [
    ...sawPair(a, t, r, 1.3, lp),
    osc(a, 'sawtooth', 46 * r, 46 * r, t, 1.3, gainNode(a, 0.5, lp)),
    osc(a, 'sine', 12, 12, t, 1.3, depth),
    noise(a, 'brown', t, 1.2, biquad(a, 'bandpass', 180, 3, gainNode(a, 0.4, trem))),
  ]
}
const monLunge: Recipe = layers(
  whoosh({ kind: 'white', f0: 1200, f1: 4000, t1: 0.25, q: 3, a: 0.01, d: 0.3, peak: 0.7 }),
  (a, out, t, p) => { // R3 §2.6: "one growl saw pair at 0.3 s length"; gain 0.35 is a DEFAULT (spec gives none)
    const r = p.rate ?? 1
    return sawPair(a, t, r, 0.3, biquad(a, 'lowpass', 420 * r, 6, env(a.ctx!, t, 0.03, 0.3, 0.35, out)))
  },
)
const monDeath: Recipe = layers(
  whoosh({ kind: 'pink', f0: 3000, f1: 300, t1: 0.5, q: 2, a: 0.3, d: 0.2, peak: 0.6, rate: true }), // honours p.rate
  (a, out, t, p) => [burst(a, 'brown', 'lowpass', 600, 0.7, t + 0.5, 0.004, 0.1, 0.6, out, p.rate ?? 1)], // ink splat
)

// ---------- player state ----------
// Called once per beat by loopStep at t = nextBeat (R3 §2.7): lub at t, dub at t + 0.28.
const heartbeat: Recipe = (a, out, t) => {
  const c = a.ctx!
  const s: AudioScheduledSourceNode[] = []
  for (const [dt, g] of [[0, 0.8], [0.28, 0.55]] as const) {
    s.push(osc(a, 'sine', 55, 55, t + dt, 0.15, env(c, t + dt, 0.004, 0.12, g, out)))
    s.push(osc(a, 'sine', 110, 110, t + dt, 0.15, env(c, t + dt, 0.004, 0.12, 0.1, out))) // laptop-speaker audibility
  }
  return s
}
const playerDeath: Recipe = (a, out, t) => {
  const lp = biquad(a, 'lowpass', 1500, 0.7, env(a.ctx!, t, 0.1, 1.2, 0.6, out))
  lp.frequency.setValueAtTime(1500, t)
  lp.frequency.exponentialRampToValueAtTime(200, t + 1.2)
  return [noise(a, 'pink', t, 1.3, lp)]
}

// ---------- beacon ----------
// LOOP CONTRACT (beacon-charge): loopStep calls this ONCE when the hold starts with p.q = progress 0..1 (normally 0).
// The recipe automates its own cutoff / gain / pitch up to progress 1 over (1 - q) * 5 s (linear / exponential ramps in
// audio time, which tracks the fixed-step hold 1:1), so loopStep needs no per-step param writes. Release = stop.
const beaconCharge: Recipe = (a, out, t, p) => {
  const p0 = Math.min(1, Math.max(0, p.q ?? 0))
  const rem = Math.max(0.1, (1 - p0) * T.beacon.holdS)
  const hum = gainNode(a, 0, out)
  hum.gain.setValueAtTime(0, t)
  hum.gain.linearRampToValueAtTime(0.15, t + 0.05)
  const saw = osc(a, 'sawtooth', 55 * 2 ** (2 * p0), 55 * 4, t, rem + 0.5, biquad(a, 'lowpass', 800, 0.7, hum), rem)
  const roar = gainNode(a, 0, out)
  roar.gain.setValueAtTime(0, t)
  roar.gain.linearRampToValueAtTime(0.2 + 0.5 * p0, t + 0.05)
  roar.gain.linearRampToValueAtTime(0.7, t + rem)
  const lp = biquad(a, 'lowpass', 300 + 2500 * p0, 0.7, roar)
  lp.frequency.setValueAtTime(300 + 2500 * p0, t)
  lp.frequency.linearRampToValueAtTime(2800, t + rem)
  return [noise(a, 'brown', t, rem + 0.5, lp), saw]
}
// R3 §2.8: two notes on one oscillator set (D2 then A1), feedback delay 0.35 s (copies 0.5 / 0.25 / 0.12).
// The echo outlives the sources (~t + 5.5), so the voice stopAt must be >= t + 5.5.
const beaconHorn: Recipe = (a, out, t) => {
  const c = a.ctx!
  const bus = gainNode(a, 1, out) // dry
  const delay = c.createDelay(1)
  delay.delayTime.value = 0.35
  delay.connect(out) // wet
  bus.connect(gainNode(a, 0.5, delay)) // send 0.5
  const fb = gainNode(a, 0.5, delay) // feedback 0.5 -> copies 0.5 / 0.25 / 0.125
  delay.connect(fb)
  const g = gainNode(a, 0, bus)
  const lp = biquad(a, 'lowpass', 600, 2, g)
  const sq = gainNode(a, 0.3, lp)
  const voices: [OscillatorNode, number][] = [
    [osc(a, 'sawtooth', 73.4, 73.4, t, 4, lp), 1],
    [osc(a, 'sawtooth', 73.4 * 1.005, 73.4 * 1.005, t, 4, lp), 1.005],
    [osc(a, 'square', 36.7, 36.7, t, 4, sq), 0.5],
  ]
  for (const [n0, f] of [[t, 73.4], [t + 1.9, 55]] as const) { // note 1 D2, note 2 A1: same graph, env(0.3, 1.5, 0.8)
    g.gain.setValueAtTime(0, n0)
    g.gain.linearRampToValueAtTime(0.8, n0 + 0.3)
    g.gain.setTargetAtTime(0, n0 + 0.3, 1.5 / 4)
    lp.frequency.setValueAtTime(600, n0)
    lp.frequency.exponentialRampToValueAtTime(900, n0 + 0.3)
    if (n0 > t) for (const [o, k] of voices) o.frequency.setValueAtTime(f * k, n0)
  }
  return voices.map(([o]) => o)
}

// ---------- cave ambience (loops) ----------
// brown bed + slow swell LFOs on its gain + white gravel trickle gated by the bed noise itself (no timers).
const caveRumble: Recipe = (a, out, t) => {
  const bed = gainNode(a, 0.4, out)
  const swell = mod(a, 0.15, bed.gain) // two incommensurate LFOs: bed swings 0.1 .. 0.7
  const gate = gainNode(a, 0, out)
  const rumble = noise(a, 'brown', t, LOOP_S, biquad(a, 'lowpass', 120, 0.7, bed))
  rumble.connect(mod(a, 0.5, gate.gain)) // slow random gate: irregular gravel grains
  return [
    rumble,
    osc(a, 'sine', 0.31, 0.31, t, LOOP_S, swell),
    osc(a, 'sine', 0.113, 0.113, t, LOOP_S, swell),
    noise(a, 'white', t, LOOP_S, biquad(a, 'bandpass', 4000, 2, gate)),
  ]
}
// R3 §2.5 drip: sine 1800 -> 900 over 0.04, env d 0.05 g 0.3, three delayed copies 0.18 / 0.36 / 0.54 s at 0.3 / 0.15 / 0.07
// (read as multipliers of the dry drip). One oscillator + one gain, `ping` schedules each drip as AudioParam events.
const ECHOES: readonly (readonly [number, number])[] = [[0.18, 0.3], [0.36, 0.15], [0.54, 0.07]]
const dripVoice = (a: AudioRes, out: AudioNode, t: number, dur: number): [OscillatorNode, GainNode] => {
  const g = gainNode(a, 0, out)
  for (const [dt, v] of ECHOES) {
    const d = a.ctx!.createDelay(1)
    d.delayTime.value = dt
    g.connect(d)
    d.connect(gainNode(a, v, out))
  }
  return [osc(a, 'sine', 1800, 1800, t, dur, g), g]
}
const ping = (o: OscillatorNode, g: GainNode, t: number): void => {
  o.frequency.setValueAtTime(1800, t)
  o.frequency.exponentialRampToValueAtTime(900, t + 0.04)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.2, t + 0.004)
  g.gain.setTargetAtTime(0, t + 0.004, 0.0125)
}
const drip: Recipe = (a, out, t) => {
  const [o, g] = dripVoice(a, out, t, 0.6)
  ping(o, g, t)
  return [o]
}
// ambience fallback (buffer missing): brown lp 200 g0.3 + a drip voice pinged every 2-6 s (hash-spaced, pre-scheduled
// as AudioParam events for the whole loop; events are not nodes). nodes[0] is the bed so loopStep can set playbackRate.
const ambCave: Recipe = (a, out, t) => {
  const bed = noise(a, 'brown', t, LOOP_S, biquad(a, 'lowpass', 200, 0.7, gainNode(a, 0.3, out)))
  const [o, g] = dripVoice(a, out, t, LOOP_S)
  const salt = Math.floor(t * 100)
  let k = 0
  for (let at = t + 2 + 4 * hash2(0, salt, 41); at < t + LOOP_S; at += 2 + 4 * hash2(++k, salt, 41)) ping(o, g, at)
  return [bed, o]
}

export const RECIPES_B: Partial<Record<SoundId, Recipe>> = {
  sfx_roll: roll,
  'sfx_mine-empty': mineEmpty,
  'sfx_devourer-beat': devourerBeat,
  'sfx_mon-growl': monGrowl,
  sfx_heartbeat: heartbeat,
  'sfx_player-death': playerDeath,
  'sfx_beacon-charge': beaconCharge,
  'sfx_beacon-horn': beaconHorn,
  'sfx_cave-rumble': caveRumble,
  'sfx_rock-warn': rockWarn,
  'sfx_rock-impact': rockImpact,
  sfx_drip: drip,
  ui_click: uiClick,
  ui_confirm: uiConfirm,
  ui_denied: uiDenied,
  amb_cave: ambCave,
  'sfx_eye-open': eyeOpen,
  'sfx_mon-lunge': monLunge,
  'sfx_mon-death': monDeath,
}

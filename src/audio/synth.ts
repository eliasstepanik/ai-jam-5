// WebAudio synth primitives, noise buffers and recipe classes WHOOSH / PERFECT PARRY / HISS / THUD.
// Spec: architecture-resources-3 §1, §1.1, §2.1-2.4; the whole SYNTH table lives in synth-2.ts (R-093, C17).
// Rules: every node is created per play, nothing is cached here (the caller stores noiseBuffers() in
// res.audio.noise), no module-level mutable state, no timers/listeners, no Math.random (seeded PRNG).
// Recipe exceptions are caught by sfx.ts (broken set), not here.
import type { AudioRes } from '../assets/resources.ts'
import type { PlayParams } from './trigger.ts'

export type Recipe = (a: AudioRes, out: AudioNode, t: number, p: PlayParams) => AudioScheduledSourceNode[]
export type NoiseKind = 'white' | 'pink' | 'brown'
export type NoiseSet = { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }
/** Constant or derived from the play params (e.g. `p => 0.8 * (0.6 + 0.4 * (p.q ?? 1))`). */
export type Amt = number | ((p: PlayParams) => number)

const amt = (v: Amt, p: PlayParams): number => (typeof v === 'number' ? v : v(p))

// Resource generation, not gameplay: local PRNG so the buffers are identical on every unlock.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 2 s mono white/pink/brown at ctx.sampleRate (R3 §1.1). One PRNG stream: white, then pink, then brown. */
export function noiseBuffers(ctx: BaseAudioContext): NoiseSet {
  const rate = ctx.sampleRate
  const n = Math.max(1, Math.floor(rate * 2))
  const r = mulberry32(0x1e3b)
  const white = ctx.createBuffer(1, n, rate)
  const pink = ctx.createBuffer(1, n, rate)
  const brown = ctx.createBuffer(1, n, rate)
  const wd = white.getChannelData(0)
  for (let i = 0; i < n; i++) wd[i] = r() * 2 - 1
  const pd = pink.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0 // Paul Kellet economy filter state
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
  }
  const bd = brown.getChannelData(0)
  let l = 0
  for (let i = 0; i < n; i++) {
    l = (l + 0.02 * (r() * 2 - 1)) / 1.02
    bd[i] = l * 3.5
  }
  return { white, pink, brown }
}

/** Deterministic start offset 0..1.9 s into a noise buffer so bursts differ. */
export const hashOffset = (t: number): number => (t * 997) % 1.9

/** Gain node: 0 -> peak over `a` (min 1 ms, no click), then exponential-ish decay, ~98 % gone after `d`. */
export const env = (c: BaseAudioContext, t: number, a: number, d: number, peak: number, out: AudioNode): GainNode => {
  const g = c.createGain()
  const ta = Math.max(a, 0.001)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + ta)
  g.gain.setTargetAtTime(0, t + ta, Math.max(d, 0.005) / 4) // decay starts at the end of the attack, also when a = 0
  g.connect(out)
  return g
}

export const noise = (a: AudioRes, kind: NoiseKind, t: number, dur: number, out: AudioNode): AudioBufferSourceNode => {
  const s = a.ctx!.createBufferSource()
  s.buffer = a.noise![kind]
  s.loop = true
  s.loopEnd = 2
  s.connect(out)
  s.start(t, hashOffset(t))
  s.stop(t + dur + 0.05)
  return s
}

/** Exponential f0 -> f1 sweep over `ramp` (default `dur`); stops at t + dur + 0.05. */
export const osc = (
  a: AudioRes, type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode, ramp = dur,
): OscillatorNode => {
  const o = a.ctx!.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + ramp)
  o.connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
  return o
}

export const biquad = (a: AudioRes, type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode => {
  const b = a.ctx!.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  b.connect(out)
  return b
}

/** Several recipes into the same voice out; sources concatenated. */
export const layers = (...rs: Recipe[]): Recipe => (a, out, t, p) => rs.flatMap((r) => r(a, out, t, p))

// ---------- 2.1 WHOOSH: noise -> bandpass swept f0 -> f1 (at t+t1) [-> f2 (at t+t2)] -> env ----------
export type WhooshOpts = {
  kind?: NoiseKind // default pink
  f0: number; f1: number; t1: number; f2?: number; t2?: number
  q: number; a: number; d: number; peak: Amt
  rate?: boolean // apply p.rate to the noise playbackRate (sfx_swing)
}
export const whoosh = (o: WhooshOpts): Recipe => (a, out, t, p) => {
  const b = biquad(a, 'bandpass', o.f0, o.q, env(a.ctx!, t, o.a, o.d, amt(o.peak, p), out))
  b.frequency.setValueAtTime(o.f0, t)
  b.frequency.exponentialRampToValueAtTime(o.f1, t + o.t1)
  if (o.f2 !== undefined && o.t2 !== undefined) b.frequency.exponentialRampToValueAtTime(o.f2, t + o.t2)
  const n = noise(a, o.kind ?? 'pink', t, o.a + o.d * 1.25, b)
  if (o.rate && p.rate) n.playbackRate.value = p.rate
  return [n]
}

// ---------- 2.3 HISS: white -> hp -> lp(lp0 -> lp1 over d) -> env [+ sine thump] ----------
export type HissOpts = {
  hp: number; lp0: number; lp1: number; a: number; d: number; peak: Amt
  thump?: { f: number; d: number; g: number } // choked sine (sfx_parry-bad)
}
export const hiss = (o: HissOpts): Recipe => (a, out, t, p) => {
  const lp = biquad(a, 'lowpass', o.lp0, 0.7, env(a.ctx!, t, o.a, o.d, amt(o.peak, p), out))
  lp.frequency.setValueAtTime(o.lp0, t)
  lp.frequency.exponentialRampToValueAtTime(o.lp1, t + o.d)
  const n = noise(a, 'white', t, o.a + o.d * 1.25, biquad(a, 'highpass', o.hp, 0.7, lp))
  const s: AudioScheduledSourceNode[] = [n]
  if (o.thump) s.push(osc(a, 'sine', o.thump.f, o.thump.f, t, o.thump.d * 1.25, env(a.ctx!, t, 0, o.thump.d, o.thump.g, out)))
  return s
}

// ---------- 2.4 THUD: pitched drop f0 -> f1 over tf + filtered noise body layers ----------
export type ThudNoise = { kind: NoiseKind; filter: BiquadFilterType; f: number; q?: number; a?: number; d: number; g: Amt }
export type ThudOpts = {
  type?: OscillatorType // default sine
  f0: number; f1: number; tf: number; d: number; g: Amt
  lp?: number // optional low-pass on the oscillator (sfx_mine-empty)
  n: ThudNoise[]
}
export const thud = (o: ThudOpts): Recipe => (a, out, t, p) => {
  const c = a.ctx!
  let dst: AudioNode = env(c, t, 0, o.d, amt(o.g, p), out)
  if (o.lp !== undefined) dst = biquad(a, 'lowpass', o.lp, 0.7, dst)
  const s: AudioScheduledSourceNode[] = [osc(a, o.type ?? 'sine', o.f0, o.f1, t, o.d * 1.25, dst, o.tf)]
  for (const z of o.n) {
    const f = biquad(a, z.filter, z.f, z.q ?? 0.7, env(c, t, z.a ?? 0, z.d, amt(z.g, p), out))
    s.push(noise(a, z.kind, t, (z.a ?? 0) + z.d * 1.25, f))
  }
  return s
}

// ---------- 2.2 PERFECT PARRY: L1 ring (sample or 4 sines), L2 flame burst, L3 thud + click ----------
const RING: readonly (readonly [number, number, number])[] = [[880, 0.5, 1.2], [883, 0.35, 1.2], [2112, 0.3, 0.7], [3608, 0.15, 0.4]] // f, gain, decay
export const perfectParry = (): Recipe => (a, out, t, p) => {
  const c = a.ctx!
  const s: AudioScheduledSourceNode[] = []
  const ring = a.buffers.get('sfx_parry-perfect-ring')
  if (ring) {
    const r = c.createBufferSource()
    r.buffer = ring
    r.connect(env(c, t, 0.001, 1.3, 0.9, out))
    r.start(t) // one-shot, ends with the sample
    s.push(r)
  } else {
    for (const [f, g, d] of RING) s.push(osc(a, 'sine', f, f, t, d * 1.25, env(c, t, 0.001, d, g, out)))
  }
  const k = p.mineral === 'sodium' ? 1.25 : p.mineral === 'strontium' ? 0.7 : 1
  const lp = biquad(a, 'lowpass', 400 * k, 0.7, env(c, t, 0.005, 0.4, 0.9, out))
  lp.frequency.setValueAtTime(400 * k, t)
  lp.frequency.exponentialRampToValueAtTime(3000 * k, t + 0.08)
  lp.frequency.exponentialRampToValueAtTime(600 * k, t + 0.38)
  const burst = noise(a, 'pink', t, 0.5, lp)
  if (p.mineral === 'copper') burst.connect(biquad(a, 'bandpass', 1800, 8, env(c, t, 0.005, 0.4, 0.1, out))) // shimmer shares the burst source
  s.push(burst)
  s.push(osc(a, 'sine', 90, 40, t, 0.31, env(c, t, 0, 0.25, 1, out), 0.15))
  s.push(noise(a, 'white', t, 0.01, env(c, t, 0, 0.004, 0.3, out))) // click
  return s
}
// ponytail: perfectParry fallback (no ring sample) allocates ~15 nodes (> the ~12 guideline); sample path ~9. Share envs if profiling shows pressure.

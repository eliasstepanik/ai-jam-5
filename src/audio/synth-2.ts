// P0 procedural recipes (flame, torch, parry, mining, pickups, hurt, beacon ignite) + the single SYNTH table (R-093, C17).
// Spec: architecture-resources-3 §2.1-2.4, §2.9; catalog architecture-assets-audio-2 §2-§7. Every node is created per play,
// no module-level mutable state, no timers/listeners, no Math.random (hashOffset / hash2 only). The synth-3.ts recipes are
// folded in below; music ids are null (no synth fallback for music, R-092).
import type { AudioRes } from '../assets/resources.ts'
import type { SoundId } from '../assets/sounds.ts'
import { hash2 } from '../core/noise.ts'
import type { NoiseKind, Recipe } from './synth.ts'
import { biquad, env, hiss, layers, noise, osc, perfectParry, thud, whoosh } from './synth.ts'
import { RECIPES_B } from './synth-3.ts'

const LOOP_S = 900 // ponytail: same ceiling as synth-3.ts; sfx.ts re-creates a loop if it ever runs out
const SEMI = (n: number): number => 2 ** (n / 12)

/** Noise -> biquad (optionally swept f0 -> f1 over `over`) -> env(att, d, g) -> out. */
const sweep = (
  a: AudioRes, kind: NoiseKind, type: BiquadFilterType, f0: number, f1: number, over: number, q: number,
  t: number, att: number, d: number, g: number, out: AudioNode,
): AudioBufferSourceNode => {
  const f = biquad(a, type, f0, q, env(a.ctx!, t, att, d, g, out))
  if (f1 !== f0) {
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + over)
  }
  return noise(a, kind, t, att + d * 1.25, f)
}

/** Gain node resting at 0 so only what is connected to its `gain` param (ConstantSource, below) is heard. */
const closed = (a: AudioRes, out: AudioNode): GainNode => {
  const g = a.ctx!.createGain()
  g.gain.value = 0
  g.connect(out)
  return g
}
/** ConstantSource driving `param` (whose own value is 0): the loop's remote control, `.offset` is writable by loopStep. */
const drive = (a: AudioRes, v: number, param: AudioParam, t: number): ConstantSourceNode => {
  const s = a.ctx!.createConstantSource()
  s.offset.value = v
  s.connect(param)
  s.start(t)
  s.stop(t + LOOP_S + 0.05)
  return s
}

// ---------- flame ----------
// LOOP CONTRACT (sfx_flame-loop, R2 §6). A Recipe may only return sources, so the modulated params are exposed as
// ConstantSourceNodes (cast `nodes[i] as ConstantSourceNode`); loopStep writes `.offset.setTargetAtTime(v, now, 0.05)`.
//   nodes[0] brown noise (AudioBufferSourceNode)      body: brown -> lp -> gain -> out
//   nodes[1] ConstantSource -> lp.frequency (Hz)      loopStep: (300 + 900e) * {none 1, sodium 1.25, copper 1, strontium 0.7}
//   nodes[2] ConstantSource -> body gain              loopStep: 0.15 + 0.35e
//   nodes[3] ConstantSource -> copper bp(1800,8) gain loopStep: 0.05 for copper, else 0
//   nodes[4] ConstantSource -> crackle gate gain      rest 0; loopStep per grain: setValueAtTime(0, T), linearRamp(0.1e, T + 0.0005),
//                                                     setValueAtTime(0, T + 0.006), then T += 0.04 + 0.12 * hash2(k, 0, 9)
//   nodes[5] white noise (AudioBufferSourceNode)      crackle source: white -> hp(3000) -> gate (always running, gated by [4])
// Initial values come from p.q (= e, default 1) and p.mineral, so an unmodulated loop is already plausible.
const flameLoop: Recipe = (a, out, t, p) => {
  const e = p.q ?? 1
  const k = p.mineral === 'sodium' ? 1.25 : p.mineral === 'strontium' ? 0.7 : 1
  const body = closed(a, out)
  const lp = biquad(a, 'lowpass', 0, 0.7, body)
  const brown = noise(a, 'brown', t, LOOP_S, lp)
  const shimmer = closed(a, out)
  brown.connect(biquad(a, 'bandpass', 1800, 8, shimmer))
  const gate = closed(a, out)
  return [
    brown,
    drive(a, (300 + 900 * e) * k, lp.frequency, t),
    drive(a, 0.15 + 0.35 * e, body.gain, t),
    drive(a, p.mineral === 'copper' ? 0.05 : 0, shimmer.gain, t),
    drive(a, 0, gate.gain, t),
    noise(a, 'white', t, LOOP_S, biquad(a, 'highpass', 3000, 0.7, gate)),
  ]
}

// R3 §2.1 toss base (shared): pink bp 400 -> 2400 over .25 Q1.2 env(.01,.3) g.7, + per-mineral layer. Total .5 s.
const tossBase = whoosh({ f0: 400, f1: 2400, t1: 0.25, q: 1.2, a: 0.01, d: 0.3, peak: 0.7 })
const tossSodium: Recipe = layers(tossBase, (a, out, t) => [osc(a, 'sine', 1200, 2400, t, 0.3, env(a.ctx!, t, 0.005, 0.3, 0.15, out))])
const tossCopper: Recipe = layers(tossBase, (a, out, t) => {
  const g = env(a.ctx!, t, 0, 0.4, 0.12, out) // a fifth chime: 1568 + 2349, shared envelope
  return [osc(a, 'triangle', 1568, 1568, t, 0.45, g), osc(a, 'triangle', 2349, 2349, t, 0.45, g)]
})
const tossStrontium: Recipe = layers(tossBase, (a, out, t) => [
  osc(a, 'sawtooth', 110, 70, t, 0.45, biquad(a, 'lowpass', 600, 0.7, env(a.ctx!, t, 0, 0.4, 0.25, out)), 0.4),
])
const shakeoff: Recipe = whoosh({ f0: 1500, f1: 300, t1: 0.15, q: 1.2, a: 0.01, d: 0.3, peak: 0.4 })

// R3 §2.3: three brown sputters then the smoke hiss at +0.4 s (hp 2000, env a.05 d.5 g.15).
const SPUTTER: readonly (readonly [number, number])[] = [[0, 0.8], [0.18, 0.5], [0.34, 0.3]]
const smoke = hiss({ hp: 2000, lp0: 6000, lp1: 1200, a: 0.05, d: 0.5, peak: 0.15 })
const flameOut: Recipe = (a, out, t, p) => [
  ...SPUTTER.map(([dt, g]) => sweep(a, 'brown', 'lowpass', 700, 200, 0.12, 0.7, t + dt, 0, 0.12, g, out)),
  ...smoke(a, out, t + 0.4, p),
]
const relight: Recipe = (a, out, t) => [
  sweep(a, 'white', 'bandpass', 3500, 3500, 0, 2, t, 0, 0.06, 0.5, out), // match scratch
  sweep(a, 'pink', 'lowpass', 300, 2000, 0.4, 0.7, t + 0.05, 0.05, 0.35, 0.8, out), // warm bloom
]

// ---------- torch / parry ----------
const swing = whoosh({ f0: 600, f1: 1800, t1: 0.08, f2: 700, t2: 0.2, q: 2, a: 0.02, d: 0.18, peak: 0.6, rate: true })
const parry = thud({
  f0: 140, f1: 60, tf: 0.12, d: 0.15, g: (p) => 0.8 * (0.6 + 0.4 * (p.q ?? 1)),
  n: [
    { kind: 'pink', filter: 'bandpass', f: 900, q: 1, d: 0.2, g: 0.5 },
    { kind: 'pink', filter: 'bandpass', f: 2500, d: 0.2, g: (p) => 0.2 * (p.q ?? 1) }, // brightness grows with timing quality
  ],
})
const parryBad = hiss({ hp: 1500, lp0: 6000, lp1: 1200, a: 0.01, d: 0.45, peak: 0.5, thump: { f: 80, d: 0.1, g: 0.4 } })

// ---------- mining / pickups ----------
const mineHit: Recipe = layers(
  (a, out, t) => [sweep(a, 'white', 'bandpass', 2800, 2800, 0, 6, t, 0, 0.05, 0.6, out)],
  (a, out, t, p) => { // chip pitch 1800..2600, hash-picked per play
    const f = 1800 + 800 * hash2(p.seq, 5, 61)
    return [osc(a, 'triangle', f, f, t, 0.15, env(a.ctx!, t, 0, 0.12, 0.25, out))]
  },
)
const ROOT: Record<string, number> = { sodium: 1046, copper: 784, strontium: 523 } // R3/catalog §4; default (no mineral) = copper
const mineralCollect: Recipe = (a, out, t, p) => {
  const root = ROOT[p.mineral ?? 'copper'] ?? 784
  return [0, 4, 7].map((st, i) => osc(a, 'triangle', root * SEMI(st), root * SEMI(st), t + i * 0.06, 0.25, env(a.ctx!, t + i * 0.06, 0, 0.2, 0.4, out))) // g 0.4: DEFAULT, spec gives none
}
const resin: Recipe = (a, out, t) => [
  sweep(a, 'brown', 'lowpass', 500, 500, 0, 0.7, t, 0, 0.08, 0.4, out),
  sweep(a, 'pink', 'lowpass', 600, 1800, 0.25, 0.7, t, 0.02, 0.25, 0.5, out),
]
const plantHeal: Recipe = (a, out, t) => [
  sweep(a, 'pink', 'bandpass', 3000, 3000, 0, 1, t, 0, 0.1, 0.2, out), // rustle
  osc(a, 'sine', 659, 659, t, 0.65, env(a.ctx!, t, 0.01, 0.5, 0.3, out)),
  osc(a, 'sine', 831, 831, t + 0.12, 0.65, env(a.ctx!, t + 0.12, 0.01, 0.5, 0.3, out)),
]

// ---------- player / monster hits ----------
// The 150 ms master low-pass dip of sfx_hurt (R3 §2.4) is the mixer's masterLp, driven by sfx.ts, not a voice node.
const monHit = thud({ f0: 120, f1: 50, tf: 0.1, d: 0.15, g: 0.8, n: [{ kind: 'pink', filter: 'lowpass', f: 1500, d: 0.25, g: 0.5 }] })
const hurt = thud({ f0: 200, f1: 80, tf: 0.12, d: 0.15, g: 0.9, n: [{ kind: 'white', filter: 'highpass', f: 3000, d: 0.04, g: 0.4 }] })

// ---------- beacon ----------
// perfect-parry layer 2 at x2 length, gain 1.0 (catalog §7), mineral-shifted like perfectParry, + sine 60 -> 30 over .8.
const beaconIgnite: Recipe = (a, out, t, p) => {
  const k = p.mineral === 'sodium' ? 1.25 : p.mineral === 'strontium' ? 0.7 : 1
  const lp = biquad(a, 'lowpass', 400 * k, 0.7, env(a.ctx!, t, 0.01, 0.8, 1, out))
  lp.frequency.setValueAtTime(400 * k, t)
  lp.frequency.exponentialRampToValueAtTime(3000 * k, t + 0.16)
  lp.frequency.exponentialRampToValueAtTime(600 * k, t + 0.76)
  return [noise(a, 'pink', t, 1.5, lp), osc(a, 'sine', 60, 30, t, 1.25, env(a.ctx!, t, 0, 1, 1, out), 0.8)]
}

// Explicit keys (not a spread of the Partial) so tsc proves all 43 SoundIds are covered. The 19 ids owned by synth-3.ts
// are read as `B.x ?? null`: type-safe, and a missing recipe degrades to silence instead of throwing.
const B = RECIPES_B
export const SYNTH: Record<SoundId, Recipe | null> = {
  mus_title: null,
  mus_descent: null,
  'mus_descent-danger': null,
  mus_escape: null,
  'mus_sting-win': null,
  'mus_sting-death': null,
  amb_cave: B.amb_cave ?? null,
  'sfx_flame-loop': flameLoop,
  'sfx_flame-toss-sodium': tossSodium,
  'sfx_flame-toss-copper': tossCopper,
  'sfx_flame-toss-strontium': tossStrontium,
  'sfx_flame-shakeoff': shakeoff,
  'sfx_flame-out': flameOut,
  sfx_relight: relight,
  sfx_swing: swing,
  sfx_parry: parry,
  'sfx_parry-perfect': perfectParry(),
  'sfx_parry-bad': parryBad,
  sfx_roll: B.sfx_roll ?? null,
  'sfx_mine-hit': mineHit,
  'sfx_mineral-collect': mineralCollect,
  sfx_resin: resin,
  'sfx_plant-heal': plantHeal,
  'sfx_mine-empty': B['sfx_mine-empty'] ?? null,
  'sfx_eye-open': B['sfx_eye-open'] ?? null,
  'sfx_mon-growl': B['sfx_mon-growl'] ?? null,
  'sfx_mon-lunge': B['sfx_mon-lunge'] ?? null,
  'sfx_mon-hit': monHit,
  'sfx_mon-death': B['sfx_mon-death'] ?? null,
  'sfx_devourer-beat': B['sfx_devourer-beat'] ?? null,
  sfx_hurt: hurt,
  sfx_heartbeat: B.sfx_heartbeat ?? null,
  'sfx_player-death': B['sfx_player-death'] ?? null,
  'sfx_beacon-charge': B['sfx_beacon-charge'] ?? null,
  'sfx_beacon-ignite': beaconIgnite,
  'sfx_beacon-horn': B['sfx_beacon-horn'] ?? null,
  'sfx_cave-rumble': B['sfx_cave-rumble'] ?? null,
  'sfx_rock-warn': B['sfx_rock-warn'] ?? null,
  'sfx_rock-impact': B['sfx_rock-impact'] ?? null,
  sfx_drip: B.sfx_drip ?? null,
  ui_click: B.ui_click ?? null,
  ui_confirm: B.ui_confirm ?? null,
  ui_denied: B.ui_denied ?? null,
}

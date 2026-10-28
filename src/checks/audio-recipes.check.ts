// Issue #103 acceptance: instantiate and render EVERY SYNTH recipe against the recording fake
// (src/checks/audio-fake.ts) and prove it does not throw, records no fake violations, stays within
// its node budget, creates at least one source, and one-shots actually stop (loops stay live).
// The SYNTH null entries must be exactly the 6 music ids (X0 audit: no synth fallback for music, R-092),
// and every SoundId in SOUNDS must have a SYNTH entry (recipe or music null) - no missing recipe.
// Layer note (D-CHECK): importing DOM-free src/audio/* from src/checks is the recorded deviation from
// architecture.md section 4 / R-043 (precedent: audio-fake.ts header, depth-screens.check.ts); the
// owner records ruling R-043a. No DOM, no timers, no node: imports, no module-level mutable state.
import type { AudioRes } from '../assets/resources.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundId } from '../assets/sounds.ts'
import { noiseBuffers } from '../audio/synth.ts'
import type { Recipe } from '../audio/synth.ts'
import { SYNTH } from '../audio/synth-2.ts'
import type { PlayParams } from '../audio/trigger.ts'
import { makeFakeCtx } from './audio-fake.ts'
import type { FakeNode } from './audio-fake.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('audio-recipes check: ' + msg) }

// The X0 audit: exactly these 6 ids are null (music has no synth fallback, R-092).
const NULL_IDS: readonly SoundId[] = ['mus_title', 'mus_descent', 'mus_descent-danger', 'mus_escape', 'mus_sting-win', 'mus_sting-death']

// Node budget per render. Default 12 (the synth.ts/synth-2.ts ponytail guideline). Allowlist measured
// 2026-10-28 against the fake (max over the render variants below):
//   sfx_flame-out 13 (3 sputter sweeps + hiss), sfx_flame-loop 16 (ponytail note synth-2.ts:57),
//   sfx_parry-perfect 17 (fallback ring 4 osc + envs, + copper shimmer path; the issue's smoke-test
//   figure of 40 did not reproduce - measured 15 default / 17 with mineral copper).
const NODE_CAP = 12
const NODE_CAPS: Partial<Record<SoundId, number>> = { 'sfx_flame-out': 13, 'sfx_flame-loop': 16, 'sfx_parry-perfect': 17 }

// Loop recipes stop their sources at LOOP_S = 900 s (synth-2.ts/synth-3.ts); measured max one-shot
// stop is 5.55 s (sfx_beacon-charge), so 60 s separates the two classes with a wide margin.
const LOOP_MAX_STOP = 60
const SOURCE_KINDS = new Set(['bufferSource', 'oscillator', 'constantSource'])

// Default + non-default args (rate = pitch-like, q, mineral switch paths; `gain`/`delay` are applied
// by the engine to the voice, recipes never read them). `ring` renders with the perfect-parry ring
// sample present so the sample path (not only the oscillator fallback) is exercised too.
const VARIANTS: readonly (readonly [string, number, PlayParams, boolean])[] = [
  ['default', 0, { seq: 0 }, false],
  ['alt', 1.5, { seq: 7, q: 0.3, mineral: 'copper', rate: 1.4 }, false],
  ['ring', 0.25, { seq: 3, mineral: 'sodium' }, true],
]

// Static peak estimate (upper bound, envelopes' decay ignored): for each audio source (oscillator /
// bufferSource, amplitude 1) sum the product of every gain node's max |automation value| along each
// path to the destination. Filters, panners, delay feedback (cycles are cut) and param modulation
// (LFO/constantSource into a gain param) are not modelled; the table ranks recipes, it is not dBFS.
const AUDIO_SRC = new Set(['bufferSource', 'oscillator'])
const gainMax = (n: FakeNode): number => {
  if (n.kind !== 'gain' || !n.gain) return 1
  const ev = n.gain.events.filter((e) => e.type !== 'cancelScheduledValues')
  return ev.length ? Math.max(...ev.map((e) => Math.abs(e.value))) : 1
}
function pathGain(n: FakeNode, dest: FakeNode, seen: Set<FakeNode>): number {
  if (n === dest) return 1
  if (seen.has(n)) return 0
  seen.add(n)
  let sum = 0
  for (const c of n.connections) sum += pathGain(c, dest, seen)
  seen.delete(n)
  return sum * gainMax(n)
}
const peakOf = (nodes: readonly FakeNode[], dest: FakeNode): number =>
  nodes.filter((n) => AUDIO_SRC.has(n.kind)).reduce((a, n) => a + pathGain(n, dest, new Set()), 0)
const db = (x: number): number => 20 * Math.log10(x)

// Bounds measured 2026-10-28 over 37 recipes x 3 variants (max per id, dB re 1.0 after catalog gain):
// range -31.1 (sfx_flame-loop) .. +10.8 (sfx_parry-perfect). Ceiling = measured max + ~1 dB headroom.
// Spread is checked per group over the ids NOT in SPREAD_EXEMPT; measured 12.7 dB (sfx), 12.2 dB (ui), bound 13.
const PEAK_CEIL_DB = 12
const GROUP_SPREAD_DB = 13
// Deliberate extremes: quiet beds/ticks (flame-loop, drip, cave-rumble) and loud events (critical flame/beacon/parry/rock/devourer).
const SPREAD_EXEMPT = new Set<SoundId>([
  'sfx_flame-loop', 'sfx_drip', 'sfx_cave-rumble',
  'sfx_parry-perfect', 'sfx_beacon-horn', 'sfx_beacon-ignite', 'sfx_flame-out', 'sfx_rock-impact', 'sfx_devourer-beat',
])

function checkPeaks(peaks: ReadonlyMap<SoundId, number>): void {
  const rows = [...peaks].map(([id, v]) => [id, db(v)] as const).sort((x, y) => y[1] - x[1])
  const table = (): string => '\n' + rows.map(([id, d]) => `  ${SOUNDS[id].group.padEnd(3)} ${d.toFixed(1).padStart(6)} dB  ${id}`).join('\n')
  for (const [id, d] of rows) ok(d <= PEAK_CEIL_DB, `${id} peak estimate ${d.toFixed(1)} dB > ceiling ${PEAK_CEIL_DB} dB${table()}`)
  for (const g of ['sfx', 'ui', 'amb'] as const) {
    const ds = rows.filter(([id]) => SOUNDS[id].group === g && !SPREAD_EXEMPT.has(id)).map(([, d]) => d)
    if (ds.length < 2) continue
    const spread = Math.max(...ds) - Math.min(...ds)
    ok(spread <= GROUP_SPREAD_DB, `group ${g} spread ${spread.toFixed(1)} dB > ${GROUP_SPREAD_DB} dB${table()}`)
  }
}

export function run(): void {
  const peaks = new Map<SoundId, number>()
  const fake = makeFakeCtx()
  const noise = noiseBuffers(fake.ctx)
  // The fake buffer is duck-compatible at runtime (audio-fake.ts header); cast for the AudioBuffer-typed Map.
  const ring = fake.createBuffer(1, 4800, fake.sampleRate) as unknown as AudioBuffer
  // Minimal AudioRes: recipes only read ctx, buffers and noise (the cast covers the engine-only fields).
  const mkRes = (withRing: boolean): AudioRes => ({
    ctx: fake.ctx,
    buffers: new Map<string, AudioBuffer | null>(withRing ? [['sfx_parry-perfect-ring', ring]] : []),
    noise,
  }) as unknown as AudioRes

  // Coverage: every SoundId has a SYNTH entry; the null entries are exactly the 6 music ids.
  const nulls: string[] = []
  for (const id of Object.keys(SOUNDS) as SoundId[]) {
    ok(id in SYNTH, 'SYNTH has no entry for ' + id)
    if (SYNTH[id] === null) nulls.push(id)
  }
  ok(JSON.stringify(nulls.sort()) === JSON.stringify([...NULL_IDS].sort()), 'null SYNTH entries are exactly the 6 music ids, got: ' + nulls.join(','))

  for (const [id, recipe] of Object.entries(SYNTH) as [SoundId, (Recipe | null)][]) {
    if (recipe === null) continue
    for (const [label, t, p, withRing] of VARIANTS) {
      fake.reset()
      let srcs: AudioScheduledSourceNode[]
      try {
        srcs = recipe(mkRes(withRing), fake.destination as unknown as AudioNode, t, p)
      } catch (e) {
        throw new Error(`audio-recipes check: ${id} (${label}) threw: ${String(e)}`)
      }
      ok(fake.violations.length === 0, `${id} (${label}) fake violations: ${fake.violations.join(' | ')}`)
      ok(srcs.length >= 1, `${id} (${label}) returned no sources`)
      const sources = fake.nodes.filter((n) => SOURCE_KINDS.has(n.kind))
      ok(sources.length >= 1, `${id} (${label}) created no source node`)
      peaks.set(id, Math.max(peaks.get(id) ?? 0, peakOf(fake.nodes, fake.destination) * SOUNDS[id].gain))
      const cap = NODE_CAPS[id] ?? NODE_CAP
      ok(fake.nodes.length <= cap, `${id} (${label}) used ${fake.nodes.length} nodes > cap ${cap}`)
      // Effective end: scheduled stop, or natural sample end for a non-loop buffer source started
      // without stop() (perfect-parry ring path). A source that can never end fails the guard below,
      // so every end here is finite and maxStop separates loops (900 s) from one-shots (<= 5.6 s measured).
      const endOf = (n: FakeNode): number => {
        if (n.stopped !== null) return n.stopped
        ok(n.kind === 'bufferSource' && !n.loop && !!n.buffer, `${id} (${label}) source (${n.kind}) never ends (no stop, not a natural-end buffer)`)
        return (n.started ?? 0) + n.buffer!.duration
      }
      const maxStop = Math.max(...sources.map(endOf))
      if (maxStop > LOOP_MAX_STOP) {
        // Loop recipe: expected to remain live well past any one-shot horizon.
        fake.advance(10)
        for (const n of sources) ok(fake.live(n), `${id} (${label}) loop source (${n.kind}) stopped early`)
      } else {
        // One-shot: advancing past the last end leaves no source still sounding (a missing stop() fails the guard above).
        fake.advance(maxStop + 0.1 - fake.currentTime)
        for (const n of sources) ok(endOf(n) <= fake.currentTime, `${id} (${label}) source (${n.kind}) still live after ${maxStop.toFixed(2)} s`)
      }
    }
  }
  checkPeaks(peaks)
}

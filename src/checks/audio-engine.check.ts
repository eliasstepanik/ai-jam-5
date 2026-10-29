// B1 (#101): automated check for the one-shot voice engine (issue #101 audit, Kittingsl 2026-10-26:
// "no repository automated check covers the explicitly required 24-voice pool/priority stealing and
// 30ms retrigger guard"). Drives the REAL src/audio/sfx.ts + mixer.ts against the recording fake ctx.
// No wall-clock: everything runs on the fake's advance()-driven clock.
// Layer note (D-CHECK): importing DOM-free src/audio/* from src/checks/ is a recorded deviation
// from architecture.md §4 / R-043; the owner records ruling R-043a.
import { makeFakeCtx } from './audio-fake.ts'
import type { FakeCtx, FakeNode } from './audio-fake.ts'
import { soundFile } from '../assets/sound-variants.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundDef, SoundId } from '../assets/sounds.ts'
import { play } from '../audio/sfx.ts'
import { musicStep } from '../audio/music.ts'
import { ensureMixer, setMaster } from '../audio/mixer.ts'
import type { AudioRes, Resources, Voice } from '../assets/resources.ts'
import type { State } from '../core/types.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`check failed: ${msg}`)
}

const MAX_ONESHOTS = 24
const RETRIGGER_S = 0.03

type Setup = { fake: FakeCtx; res: Resources; a: AudioRes }

function setup(): Setup {
  const fake = makeFakeCtx()
  const a: AudioRes = {
    ctx: fake.ctx, state: 'running', graphVersion: -1,
    master: null, comp: null, groups: null,
    buffers: new Map(), pending: new Set(), noise: null,
    voices: [], lastStart: new Map(),
    music: { cur: '', t0: 0, srcs: [], gains: [], danger: 0 },
    loops: {}, lastSeq: -1, lastScreen: '', unlock: [],
    duck: null, masterLp: null, lastMaster: -1, pauseAt: -1,
    nextCrackle: 0, nextBeat: 0, crackleN: 0, growlAt: 0,
    broken: new Set(), synthGen: -1,
  }
  const res = { audio: a } as unknown as Resources
  ensureMixer(res)
  // Arm a 0.1 s buffer under every one-shot's key so play() takes the sample path:
  // exactly one bufferSource per voice, no synth recipes, fully deterministic bookkeeping.
  for (const [id, d] of Object.entries(SOUNDS) as [SoundId, SoundDef][]) {
    if (d.group === 'music') continue
    for (const file of [d.file ?? id, ...d.variants ?? []]) a.buffers.set(file, fake.createBuffer(1, 4800, 48000) as unknown as AudioBuffer)
  }
  return { fake, res, a }
}

const srcOf = (v: Voice): FakeNode => v.nodes[0] as unknown as FakeNode
const countOf = (a: AudioRes, id: SoundId): number => a.voices.filter((v) => v.id === id).length

// Criterion 1: playing more than MAX_ONESHOTS distinct one-shots never leaves more than 24 live voices.
function capTest(): void {
  const { fake, res, a } = setup()
  const ids = (Object.keys(SOUNDS) as SoundId[]).filter((id) => SOUNDS[id].group !== 'music')
  ok(ids.length > MAX_ONESHOTS, `cap test needs > ${MAX_ONESHOTS} distinct one-shot ids, got ${ids.length}`)
  let peak = 0
  for (const id of ids) {
    play(res, id, { seq: 0 })
    peak = Math.max(peak, a.voices.length)
    ok(a.voices.length <= MAX_ONESHOTS, `voice pool exceeded ${MAX_ONESHOTS} after playing ${id}: ${a.voices.length} voices`)
  }
  ok(peak === MAX_ONESHOTS, `pool never reached the ${MAX_ONESHOTS} cap, peak ${peak} after ${ids.length} plays`)
  ok(a.voices.length === MAX_ONESHOTS, `final pool ${a.voices.length}, expected ${MAX_ONESHOTS} after ${ids.length} distinct plays`)
  const live = a.voices.filter((v) => fake.live(srcOf(v))).length
  ok(live === MAX_ONESHOTS, `live voice sources ${live}, expected ${MAX_ONESHOTS}`)
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

// Criterion 2a: full pool + higher-priority newcomer steals the OLDEST LOWEST-priority voice.
function stealTest(): void {
  const { fake, res, a } = setup()
  const fill: SoundId[] = ['amb_cave', 'sfx_swing', 'sfx_swing', 'sfx_roll', 'sfx_mine-hit', 'sfx_mine-hit',
    'sfx_mineral-collect', 'sfx_mineral-collect', 'sfx_resin', 'sfx_resin', 'sfx_mine-empty',
    'sfx_mon-growl', 'sfx_mon-growl', 'sfx_mon-growl', 'sfx_mon-death', 'sfx_mon-death', 'sfx_mon-death', 'sfx_mon-death',
    'sfx_cave-rumble', 'sfx_drip', 'sfx_drip', 'ui_click', 'ui_click', 'ui_confirm']
  ok(fill.length === MAX_ONESHOTS, `fill sequence must be exactly ${MAX_ONESHOTS} plays, got ${fill.length}`)
  for (const id of fill) {
    play(res, id, { seq: 0 })
    fake.advance(0.05) // gap > RETRIGGER_S so same-id repeats are not retrigger-dropped
  }
  ok(a.voices.length === MAX_ONESHOTS, `pool after fill ${a.voices.length}, expected ${MAX_ONESHOTS}`)
  ok(countOf(a, 'sfx_drip') === 2, `precondition: 2 sfx_drip voices expected, got ${countOf(a, 'sfx_drip')}`)
  const victim = a.voices.find((v) => v.id === 'sfx_drip')! // first pushed = oldest pri-0
  play(res, 'sfx_rock-warn', { seq: 0 }) // pri 2 > 0: steals the oldest pri-0 voice
  ok(a.voices.length === MAX_ONESHOTS, `pool ${a.voices.length} after rock-warn, expected ${MAX_ONESHOTS}`)
  ok(countOf(a, 'sfx_rock-warn') === 1, 'sfx_rock-warn (pri 2) did not play: expected to steal the oldest pri-0 voice')
  ok(countOf(a, 'sfx_drip') === 1, `oldest pri-0 sfx_drip was not stolen: ${countOf(a, 'sfx_drip')} drips remain`)
  ok(!a.voices.includes(victim), 'the stolen voice is still in the pool')
  ok(srcOf(victim).stopped !== null, 'stolen voice source was not stopped')
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

// Criterion 2b: a full pri-3 pool locks out lower-priority newcomers; a pri-3 newcomer steals the oldest pri-3.
// Note: the catalog has only 16 pri-3 cap slots (< 24), so the pool is seeded with synthetic pri-3 voices.
function lockoutTest(): void {
  const { fake, res, a } = setup()
  const seedIds: SoundId[] = ['sfx_flame-loop', 'sfx_flame-out', 'sfx_relight', 'sfx_parry-perfect', 'sfx_parry-bad']
  for (let i = 0; i < MAX_ONESHOTS; i++) {
    a.voices.push({
      id: seedIds[i % seedIds.length], pri: 3, t0: i * 0.1, stopAt: Infinity,
      out: fake.createGain() as unknown as GainNode, nodes: [],
    })
  }
  play(res, 'sfx_rock-warn', { seq: 0 }) // pri 2 < 3: must be dropped, nothing is stolen
  ok(!a.voices.some((v) => v.id === 'sfx_rock-warn'), 'pri-2 sfx_rock-warn stole from a full pri-3 pool (lockout broken)')
  ok(a.voices.length === MAX_ONESHOTS, `pool ${a.voices.length} after dropped rock-warn, expected ${MAX_ONESHOTS}`)
  const oldestSeed = a.voices[0]
  play(res, 'sfx_hurt', { seq: 0 }) // pri 3: may steal the oldest pri-3 voice
  ok(countOf(a, 'sfx_hurt') === 1, `pri-3 sfx_hurt did not steal from the pri-3 pool: ${countOf(a, 'sfx_hurt')} hurt voices`)
  ok(a.voices.length === MAX_ONESHOTS, `pool ${a.voices.length} after hurt steal, expected ${MAX_ONESHOTS}`)
  ok(!a.voices.includes(oldestSeed), 'the oldest pri-3 voice was not the one stolen')
  ok((oldestSeed.out as unknown as FakeNode).gain!.events.some((e) => e.type === 'setTargetAtTime' && e.value === 0),
    'stolen voice gain was not ramped to 0')
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

// Criterion 2c: the per-id cap steals the oldest voice of the same id before the global cap matters.
function perIdCapTest(): void {
  const { fake, res, a } = setup()
  ok(SOUNDS.sfx_swing.cap === 2, `test assumes sfx_swing cap 2, got ${SOUNDS.sfx_swing.cap}`)
  play(res, 'sfx_swing', { seq: 0 })
  fake.advance(0.05)
  play(res, 'sfx_swing', { seq: 0 })
  const first = a.voices[0]
  fake.advance(0.05)
  play(res, 'sfx_swing', { seq: 0 })
  ok(countOf(a, 'sfx_swing') === 2, `sfx_swing per-id cap 2 exceeded: ${countOf(a, 'sfx_swing')} voices`)
  ok(!a.voices.includes(first), 'the oldest sfx_swing was not stolen by the per-id cap')
  ok(srcOf(first).stopped !== null, 'per-id-cap stolen source was not stopped')
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

// Criterion 3: same-id retrigger within RETRIGGER_S is dropped; at exactly RETRIGGER_S it plays.
function retriggerTest(): void {
  {
    const { fake, res, a } = setup()
    play(res, 'sfx_swing', { seq: 0 })
    fake.advance(RETRIGGER_S - 0.001)
    play(res, 'sfx_swing', { seq: 0 })
    ok(a.voices.length === 1, `retrigger at ${RETRIGGER_S - 0.001} s was not dropped: ${a.voices.length} voices`)
  }
  {
    const { fake, res, a } = setup()
    play(res, 'sfx_swing', { seq: 0 })
    fake.advance(RETRIGGER_S) // exactly the boundary: guard is `< RETRIGGER_S`, so this plays
    play(res, 'sfx_swing', { seq: 0 })
    ok(a.voices.length === 2, `retrigger at exactly ${RETRIGGER_S} s was dropped: ${a.voices.length} voices`)
  }
}

// Criterion 4: mixer constants on the real nodes (mixer.ts). Master starts at max(0, lastMaster) = 0
// on a fresh registry; the default volume 0.7 reaches the node through setMaster as 0.7^2 (perceptual curve).
function mixerTest(): void {
  const { fake, res, a } = setup()
  const comp = a.comp as unknown as FakeNode
  ok(!!comp && !!a.master && !!a.groups, `ensureMixer did not build the graph: comp=${!!comp} master=${!!a.master} groups=${!!a.groups}`)
  ok(comp.threshold!.value === -14, `compressor threshold ${comp.threshold!.value}, expected -14`)
  ok(comp.knee!.value === 12, `compressor knee ${comp.knee!.value}, expected 12`)
  ok(comp.ratio!.value === 4, `compressor ratio ${comp.ratio!.value}, expected 4`)
  ok(comp.attack!.value === 0.015, `compressor attack ${comp.attack!.value}, expected 0.015`)
  ok(comp.release!.value === 0.2, `compressor release ${comp.release!.value}, expected 0.2`)
  const g = a.groups!
  const gv = (grp: keyof typeof g): number => (g[grp] as unknown as FakeNode).gain!.value
  ok(gv('music') === 0.55, `music group gain ${gv('music')}, expected 0.55`)
  ok(gv('amb') === 0.45, `amb group gain ${gv('amb')}, expected 0.45`)
  ok(gv('sfx') === 0.9, `sfx group gain ${gv('sfx')}, expected 0.9`)
  ok(gv('ui') === 0.7, `ui group gain ${gv('ui')}, expected 0.7`)
  const master = a.master as unknown as FakeNode
  ok(master.gain!.value === 0, `fresh master gain ${master.gain!.value}, expected 0 (max(0, lastMaster=-1))`)
  setMaster(res, 0.7, false)
  const ev = master.gain!.events[master.gain!.events.length - 1]
  ok(ev.type === 'setTargetAtTime' && Math.abs(ev.value - 0.49) < 1e-9 && ev.tc === 0.05,
    `setMaster(0.7) event ${JSON.stringify(ev)}, expected setTargetAtTime 0.7^2=0.49 tc 0.05`)
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

// P2 (stinger leak): a finished stinger must leave nothing connected. musicStep wires src -> gain -> music group;
// the source's ended handler disconnects both. Driven through the real music.ts API with the fake ctx.
function stingerTest(): void {
  const { fake, res, a } = setup()
  const dead = { meta: { screen: 'dead' } } as unknown as State
  const won = { meta: { screen: 'won' } } as unknown as State

  // No buffer decoded: musicStep must not create any node (music has no synth fallback).
  const before = fake.nodes.length
  musicStep(res, dead)
  ok(fake.nodes.length === before && a.music.srcs.length === 0, 'stinger without a buffer created nodes')

  a.buffers.set('mus_sting-death', fake.createBuffer(1, 4800, 48000) as unknown as AudioBuffer)
  musicStep(res, dead)
  ok(a.music.srcs.length === 1, 'death stinger did not start')
  const src = a.music.srcs[0] as unknown as FakeNode
  const g = a.music.gains[0] as unknown as FakeNode
  ok(src.connections.length === 1 && g.connections.length === 1, 'stinger not wired src->gain->group before end')
  fake.fireEnded(src)
  ok(src.connections.length === 0, 'stinger source still connected after ended')
  ok(g.connections.length === 0, 'stinger gain node still connected after ended')
  fake.fireEnded(src) // idempotent: a second ended must not throw or re-connect
  ok(src.connections.length === 0 && g.connections.length === 0, 'second ended re-connected stinger nodes')

  // Second stinger in a row (screen change fades the first out, win stinger plays and ends):
  // none of the four stinger nodes may stay connected.
  fake.advance(1)
  a.buffers.set('mus_sting-win', fake.createBuffer(1, 4800, 48000) as unknown as AudioBuffer)
  musicStep(res, won)
  ok(a.music.srcs.length === 1, 'win stinger did not start after the screen change')
  const src2 = a.music.srcs[0] as unknown as FakeNode
  const g2 = a.music.gains[0] as unknown as FakeNode
  ok(src2.connections.length === 1 && g2.connections.length === 1, 'win stinger not wired before end')
  fake.fireEnded(src2)
  for (const n of [src, g, src2, g2]) ok(n.connections.length === 0, `${n.kind} still connected after both stingers`)
  ok(fake.violations.length === 0, `fake ctx violations: ${fake.violations.join('; ')}`)
}

function rockVariantsTest(): void {
  const { fake, res, a } = setup(), heard = new Set<string>()
  for (let seq = 0; seq < 30; seq++) {
    play(res, 'sfx_rock-impact', { seq }) // simultaneous landings must each get one source, bounded by the shared cap
    const voice = a.voices[a.voices.length - 1], file = soundFile('sfx_rock-impact', seq)
    ok(voice.id === 'sfx_rock-impact' && voice.nodes.length === 1, 'one sample source per rock, not three layers')
    ok((srcOf(voice).buffer as unknown) === a.buffers.get(file), 'actual playback selects the chosen variation')
    ok(a.voices.length === Math.min(seq + 1, 4), 'simultaneous impacts respect the common four-voice cap')
    heard.add(file)
  }
  ok(heard.size === 3 && !a.broken.size && !fake.violations.length, 'all delivered alternatives play without synthesis or warnings')
}
export function run(): void {
  rockVariantsTest()
  capTest()
  stealTest()
  lockoutTest()
  perIdCapTest()
  retriggerTest()
  mixerTest()
  stingerTest()
}

// L4 audio: one-shot voices (priorities, stealing, pruning) and the loop manager (R2 §6, §7; R-091..R-096, R-100, R-134).
// Rules: all state lives in res.audio (voices, loops, cursors, camera mirror); no module-level mutable state, no timers,
// no Math.random. Recipe exceptions are caught here (broken set, one warning per id), never propagated.
import type { AudioRes, Resources, Voice } from '../assets/resources.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundDef, SoundId } from '../assets/sounds.ts'
import { hash2 } from '../core/noise.ts'
import type { MonsterKind, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { SYNTH } from './synth-2.ts'
import type { PlayParams } from './trigger.ts'

const MAX_ONESHOTS = 24
const RETRIGGER_S = 0.03
const LOOP_MAX = 890 // recipes build 900 s of source (synth-2/3 LOOP_S); a loop is rebuilt before it runs dry
const TAIL_S = 5.5 // sfx_beacon-horn echo tail outlives its sources (R3 §2)
const ZONE_RATE = [1, 0.96, 0.92, 0.88] as const
const GROWL: Record<MonsterKind, { rate: number; gain: number }> = {
  lurker: { rate: 1.4, gain: 0.6 }, stalker: { rate: 1.0, gain: 0.8 }, devourer: { rate: 0.6, gain: 1.0 },
}

// Camera mirror: play() has no State (positional PlayParams carry WORLD px), so loopStep writes the camera here every
// step; the engine runs loopStep before consuming events. ponytail: one step of camera lag, fine for 0.6 max pan.
type Cam = { x: number; y: number }
type CamRes = AudioRes & { cam?: Cam }
type LoopVoice = Voice & { lp?: BiquadFilterNode }
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const def = (id: SoundId): SoundDef => SOUNDS[id]

function warnBroken(a: AudioRes, id: SoundId, e: unknown): void {
  if (a.broken.has(id)) return
  a.broken.add(id)
  console.warn(`[audio] ${id} disabled:`, e)
}

function silence(v: Voice, now: number, fade: number, stopIn: number): void {
  v.out.gain.cancelScheduledValues(now)
  v.out.gain.setTargetAtTime(0, now, fade)
  for (const n of v.nodes) {
    try { n.stop(now + stopIn) } catch { /* already stopped */ }
  }
}

const steal = (a: AudioRes, v: Voice, now: number): void => {
  const i = a.voices.indexOf(v)
  if (i >= 0) a.voices.splice(i, 1)
  silence(v, now, 0.01, 0.05)
}
const oldest = (vs: Voice[]): Voice | undefined => vs.reduce<Voice | undefined>((m, v) => (!m || v.t0 < m.t0 ? v : m), undefined)

/** Make room for a new `id` voice (per-id cap, then the global one-shot cap). false = drop the new voice. */
export function stealFor(res: Resources, id: SoundId): boolean {
  const a = res.audio
  const now = a.ctx?.currentTime ?? 0
  const d = def(id)
  const same = a.voices.filter((v) => v.id === id)
  if (same.length >= d.cap) {
    steal(a, oldest(same)!, now)
    return true
  }
  const shots = a.voices.filter((v) => def(v.id).group !== 'music')
  if (shots.length < MAX_ONESHOTS) return true
  const low = Math.min(...shots.map((v) => v.pri))
  if (low >= 3 && d.pri < 3) return false // all voices pri 3: only a pri 3 newcomer may steal
  steal(a, oldest(shots.filter((v) => v.pri === low))!, now)
  return true
}

/** Fire a one-shot. Positional when p.x/p.y are set (world px, camera mirrored by loopStep). */
export function play(res: Resources, id: SoundId, p: PlayParams): void {
  const a = res.audio
  const ctx = a.ctx
  if (!ctx || a.state !== 'running' || !a.groups) return
  const d = def(id)
  const t = ctx.currentTime + (p.delay ?? 0)
  const last = a.lastStart.get(id)
  if (last !== undefined && Math.abs(t - last) < RETRIGGER_S) return
  const buf = a.buffers.get(d.file ?? id) ?? null
  const recipe = SYNTH[id]
  if (!buf && (!recipe || a.broken.has(id))) return
  if (!stealFor(res, id)) return
  const rate = (p.rate ?? 1) * (0.94 + 0.12 * hash2(p.seq, 1, 77))
  let gain = d.gain * (p.gain ?? 1) * (0.9 + 0.1 * hash2(p.seq, 2, 77))
  const out = ctx.createGain()
  let sink: AudioNode = a.groups[d.group]
  if (p.x !== undefined && p.y !== undefined) {
    const cam = (a as CamRes).cam ?? { x: p.x, y: p.y }
    const pan = ctx.createStereoPanner()
    pan.pan.value = clamp((p.x - cam.x) / 240, -1, 1) * 0.6
    gain *= clamp(1 - Math.hypot(p.x - cam.x, p.y - cam.y) / 480, 0, 1)
    pan.connect(sink)
    sink = pan
  }
  out.gain.value = gain
  out.connect(sink)
  let nodes: AudioScheduledSourceNode[] = []
  let stopAt = t + 6
  if (buf) {
    for (const f of [d.file ?? id, ...(d.layers ?? [])]) {
      const b = a.buffers.get(f)
      if (!b) continue
      const src = ctx.createBufferSource()
      src.buffer = b
      src.playbackRate.value = rate
      src.connect(out)
      src.start(t)
      nodes.push(src)
      stopAt = Math.max(stopAt === t + 6 ? 0 : stopAt, t + b.duration / rate)
    }
  } else {
    try {
      nodes = recipe!(a, out, t, { ...p, rate })
    } catch (e) {
      out.disconnect()
      warnBroken(a, id, e)
      return
    }
  }
  const v: Voice = { id, pri: d.pri, t0: t, stopAt, out, nodes }
  a.voices.push(v)
  a.lastStart.set(id, t)
  let live = nodes.length
  for (const n of nodes) {
    n.onended = () => {
      if (--live > 0) return
      const i = a.voices.indexOf(v)
      if (i < 0) return
      if (buf) a.voices.splice(i, 1), out.disconnect() // samples have no tail
      else v.stopAt = Math.min(v.stopAt, ctx.currentTime + (id === 'sfx_beacon-horn' ? TAIL_S : 0.3))
    }
  }
  if (id === 'sfx_hurt' && a.masterLp) { // R-100: master low-pass dip
    a.masterLp.frequency.setTargetAtTime(1200, t, 0.03)
    a.masterLp.frequency.setTargetAtTime(18000, t + 0.15, 0.15)
  }
}

/** Drop voices past their stopAt and release their graph nodes. */
export function pruneVoices(a: AudioRes): void {
  if (!a.ctx) return
  const now = a.ctx.currentTime
  for (let i = a.voices.length - 1; i >= 0; i--) {
    if (a.voices[i]!.stopAt >= now) continue
    a.voices[i]!.out.disconnect()
    a.voices.splice(i, 1)
  }
}

// ---------- loops ----------
function startLoop(a: AudioRes, id: SoundId, p: PlayParams): LoopVoice | null {
  const ctx = a.ctx!
  if (a.broken.has(id)) return null
  const d = def(id)
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = d.gain
  out.connect(a.groups![d.group])
  const v: LoopVoice = { id, pri: d.pri, t0: t, stopAt: t + LOOP_MAX, out, nodes: [] }
  const buf = a.buffers.get(d.file ?? id)
  try {
    if (buf) { // sample loop (amb_cave): lowpass in front, loop points from SOUNDS
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      if (d.loop) [src.loopStart, src.loopEnd] = d.loop
      v.lp = ctx.createBiquadFilter()
      v.lp.frequency.value = 8000
      src.connect(v.lp).connect(out)
      src.start(t)
      v.nodes = [src]
      v.stopAt = Infinity
    } else {
      const r = SYNTH[id]
      if (!r) throw new Error('no recipe')
      v.nodes = r(a, out, t, p)
    }
  } catch (e) {
    out.disconnect()
    warnBroken(a, id, e)
    return null
  }
  a.loops[id] = v
  return v
}

function stopLoop(a: AudioRes, id: SoundId): void {
  const v = a.loops[id]
  if (!v) return
  delete a.loops[id]
  silence(v, a.ctx!.currentTime, 0.05, 0.25)
}

/** Keep loop `id` running iff `on`; returns the live voice (started this call if needed). */
function want(a: AudioRes, id: SoundId, on: boolean, p: PlayParams): LoopVoice | null {
  if (!on) return stopLoop(a, id), null
  const v = a.loops[id] as LoopVoice | undefined
  if (v && v.stopAt > a.ctx!.currentTime) return v
  if (v) stopLoop(a, id) // ran out of source: rebuild
  return startLoop(a, id, p)
}

const param = (n: AudioScheduledSourceNode | undefined): AudioParam | null => (n as ConstantSourceNode | undefined)?.offset ?? null

// Node order required of SYNTH['sfx_flame-loop'] (synth-2.ts LOOP CONTRACT): [0] brown, [1] lp Hz, [2] body gain,
// [3] copper bp gain, [4] crackle gate, [5] white. [1..4] are ConstantSourceNodes whose .offset loopStep drives.
function flameStep(a: AudioRes, s: State, now: number): void {
  const pl = s.player
  const v = want(a, 'sfx_flame-loop', s.meta.phase === 'descent' && pl.energy > 0, { seq: 0, q: 1, mineral: pl.activeMineral })
  if (!v) return
  const e = clamp(pl.energy / pl.energyMax, 0, 1)
  const k = pl.activeMineral === 'sodium' ? 1.25 : pl.activeMineral === 'strontium' ? 0.7 : 1
  param(v.nodes[1])?.setTargetAtTime((300 + 900 * e) * k, now, 0.05)
  param(v.nodes[2])?.setTargetAtTime(0.15 + 0.35 * e, now, 0.05)
  param(v.nodes[3])?.setTargetAtTime(pl.activeMineral === 'copper' ? 0.05 : 0, now, 0.05)
  const gate = param(v.nodes[4])
  if (!gate) return
  if (a.nextCrackle < now) a.nextCrackle = now
  while (now + 0.1 > a.nextCrackle) { // 6 ms grains scheduled ahead
    const at = a.nextCrackle
    gate.setValueAtTime(0, at)
    gate.linearRampToValueAtTime(0.1 * e, at + 0.0005)
    gate.setValueAtTime(0, at + 0.006)
    a.nextCrackle += 0.04 + 0.12 * hash2(a.crackleN++, 0, 9)
  }
}

function growlStep(res: Resources, s: State, now: number): void {
  const a = res.audio
  if (now < a.growlAt) return
  let pick: State['monsters'][number] | null = null
  let best = -1
  for (const m of s.monsters) {
    const h = hash2(s.meta.steps >> 8, m.id, 3)
    if (m.ai === 'ring' && h > best) pick = m, best = h
  }
  if (!pick) return
  const g = GROWL[pick.kind]
  a.growlAt = now + 4 + 5 * hash2(s.meta.steps, pick.id, 5) // 4..9 s, so the 1.5 s global gap always holds
  play(res, 'sfx_mon-growl', { seq: s.meta.steps, x: pick.x, y: pick.y, rate: g.rate, gain: g.gain })
}

/**
 * Per-step loop manager (engine calls it BEFORE consuming events). Everything stops when the screen is not 'playing'.
 * rockLand swell: events with seq > a.lastSeq are new this step (engine advances lastSeq after loopStep), so a fresh
 * rockLand pushes the rumble's out gain to 0.9/0.4 x base for 0.5 s. beacon-charge: started once at hold start with
 * q = hold / holdS (the recipe ramps itself over (1 - q) * 5 s), stopped on release or when the Beacon is lit.
 */
export function loopStep(res: Resources, s: State): void {
  const a = res.audio
  const ctx = a.ctx
  if (!ctx || a.state !== 'running' || !a.groups) return
  const now = ctx.currentTime
  ;((a as CamRes).cam ??= { x: 0, y: 0 }).x = s.cam.x
  ;(a as CamRes).cam!.y = s.cam.y
  const ids = Object.keys(a.loops) as SoundId[]
  if (s.meta.screen !== 'playing') {
    for (const id of ids) stopLoop(a, id)
    a.nextBeat = 0
    return
  }
  const pl = s.player
  flameStep(a, s, now)
  // heartbeat: lub-dub recipe scheduled ahead, one beat per 0.857 s while hp === 1
  if (pl.hp === 1) {
    if (a.nextBeat < now) a.nextBeat = now
    if (now + 0.2 > a.nextBeat) {
      play(res, 'sfx_heartbeat', { seq: s.meta.steps, delay: a.nextBeat - now })
      a.nextBeat += 0.857
    }
  } else a.nextBeat = 0
  const charging = pl.beaconHold > 0 && !s.world.beaconLit
  want(a, 'sfx_beacon-charge', charging, { seq: 0, q: clamp(pl.beaconHold / T.beacon.holdS, 0, 1) })
  const rumble = want(a, 'sfx_cave-rumble', s.meta.phase === 'escape', { seq: 0 })
  if (rumble && a.lastSeq >= 0 && s.fx.events.some((e) => e.kind === 'rockLand' && e.seq > a.lastSeq)) {
    const base = def('sfx_cave-rumble').gain
    rumble.out.gain.cancelScheduledValues(now)
    rumble.out.gain.setTargetAtTime(base * 2.25, now, 0.08)
    rumble.out.gain.setTargetAtTime(base, now + 0.5, 0.2)
  }
  const amb = want(a, 'amb_cave', true, { seq: 0 })
  if (amb) {
    const z = s.meta.zone - 1
    const bed = amb.nodes[0] as AudioBufferSourceNode | undefined
    bed?.playbackRate?.setTargetAtTime(ZONE_RATE[z] ?? 1, now, 2)
    amb.lp?.frequency.setTargetAtTime(8000 - (5000 * z) / 3, now, 2)
  }
  growlStep(res, s, now)
}

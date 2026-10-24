// L4 music state machine (resources-2 §5, resources-3 §4, assets-audio §9). Runs every step after ensureMixer.
// No module-level mutable state: every cursor lives in res.audio.music (survives hot swaps with the registry).
//   cur   = wanted track id ('' = silence). Set even while its buffer is still missing (R-092: retry each step).
//   t0    = ctx time the current track's base source starts; the danger layer joins in phase from it.
//   srcs/gains = nodes of the CURRENT track only (base first, danger layer second). Started iff srcs.length > 0.
//   danger = last layer gain target applied (-1 = none yet), so setTargetAtTime runs only when it changes.
// A stinger plays once: it stays in srcs after it ends, so `cur === wanted` never restarts it. A new run changes
// the wanted track (title/descent) in between, which re-arms the next stinger.
import type { MusicRes, Resources } from '../assets/resources.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundDef, SoundId } from '../assets/sounds.ts'
import type { State } from '../core/types.ts'
import { danger, musicFor } from './trigger.ts'

const START_DELAY = 0.05 // s between the decision and the scheduled start
const FADE_IN = 1 // s, looped tracks
const STING_FADE_IN = 0.1 // s, stingers must hit immediately
const FADE_OUT_TC = 0.3 // setTargetAtTime time constant of the outgoing track
const FADE_OUT_STOP = 1.5 // s until the outgoing sources are stopped (gain is ~0 by then)
const LAYER_TC = 0.4 // danger layer follow speed
const LAYER_OF: Partial<Record<SoundId, SoundId>> = { mus_descent: 'mus_descent-danger' }

const defOf = (id: SoundId): SoundDef => SOUNDS[id]

function fadeOut(m: MusicRes, now: number): void {
  m.srcs.forEach((src, i) => {
    const g = m.gains[i]
    const p = g.gain
    const v = p.value // freeze a running fade-in at its current level instead of popping to 0
    p.cancelScheduledValues(now)
    p.setValueAtTime(v, now)
    p.setTargetAtTime(0, now, FADE_OUT_TC)
    src.onended = () => g.disconnect()
    src.stop(now + FADE_OUT_STOP)
  })
  // ponytail: a stinger that already ended never fires onended again; its silent gain node stays connected until the
  // registry is rebuilt (one node per death/win). Upgrade: track ended state in MusicRes and disconnect directly.
  m.srcs.length = 0
  m.gains.length = 0
}

function startNode(
  ctx: AudioContext, out: GainNode, m: MusicRes, id: SoundId, buf: AudioBuffer,
  when: number, offset: number, peak: number, ramp: number,
): void {
  const def = defOf(id)
  const src = ctx.createBufferSource()
  src.buffer = buf
  if (def.loop) { src.loop = true; src.loopStart = def.loop[0]; src.loopEnd = def.loop[1] }
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  if (ramp > 0) g.gain.linearRampToValueAtTime(peak, when + ramp)
  src.connect(g)
  g.connect(out)
  src.start(when, offset)
  m.srcs.push(src)
  m.gains.push(g)
}

// Buffers are fetched and decoded by the engine; null = failed, undefined = not decoded yet. Music has no synth fallback.
const bufferOf = (res: Resources, id: SoundId): AudioBuffer | null => res.audio.buffers.get(defOf(id).file ?? id) ?? null

export function musicStep(res: Resources, s: State): void {
  const a = res.audio
  const ctx = a.ctx
  const out = a.groups?.music
  if (!ctx || !out) return
  const m = a.music
  const now = ctx.currentTime
  const want = musicFor(s)
  if ((want ?? '') !== m.cur) { // track change: old nodes fade out, `cur` follows even if nothing can start yet
    fadeOut(m, now)
    m.cur = want ?? ''
    m.danger = -1
  }
  if (!want || ctx.state !== 'running') return

  if (m.srcs.length === 0) { // not started: first attempt, or still waiting for the decode
    const buf = bufferOf(res, want)
    if (!buf) return
    const def = defOf(want)
    m.t0 = now + START_DELAY
    startNode(ctx, out, m, want, buf, m.t0, 0, def.gain, def.loop ? FADE_IN : STING_FADE_IN)
  }

  const layer = LAYER_OF[want]
  if (!layer) return
  if (m.srcs.length === 1) { // layer not started: join in phase with the base, however late its buffer arrives
    const buf = bufferOf(res, layer)
    if (buf) {
      const [l0, l1] = defOf(layer).loop ?? [0, buf.duration]
      const late = now > m.t0
      startNode(ctx, out, m, layer, buf, late ? now : m.t0, late ? l0 + ((now - m.t0) % (l1 - l0)) : l0, 0, 0)
      m.danger = -1
    }
  }
  if (m.srcs.length === 2 && s.meta.screen !== 'paused') { // paused: hold the layer where it is
    const target = defOf(layer).gain * danger(s)
    if (target !== m.danger) {
      m.danger = target
      const p = m.gains[1].gain
      if (now < m.t0) { // before the track start: startNode's setValueAtTime(0, t0) is still queued, so ramp after it
        p.cancelScheduledValues(m.t0)
        p.setValueAtTime(0, m.t0)
        p.setTargetAtTime(target, m.t0, LAYER_TC)
      } else p.setTargetAtTime(target, now, LAYER_TC)
    }
  }
}

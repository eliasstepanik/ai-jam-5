// HMR-safe bounded loop voices; decoded deliveries replace a running synth fallback once ready.
import type { AudioRes, Voice } from '../assets/resources.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundId, SoundDef } from '../assets/sounds.ts'
import type { PlayParams } from './trigger.ts'
import { SYNTH } from './synth-2.ts'
export type LoopVoice = Voice & { lp?: BiquadFilterNode; run?: number; sample?: AudioBuffer }
const LOOP_MAX = 890 // synth sources last 900 s; rebuild before they run dry
const def = (id: SoundId): SoundDef => SOUNDS[id]
function warnBroken(a: AudioRes, id: SoundId, error: unknown): void {
  if (a.broken.has(id)) return
  a.broken.add(id); console.warn(`[audio] ${id} disabled:`, error)
}
function startLoop(a: AudioRes, id: SoundId, p: PlayParams): LoopVoice | null {
  const ctx = a.ctx!
  if (a.broken.has(id)) return null
  const d = def(id)
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, t).linearRampToValueAtTime(d.gain, t + 0.05) // 50 ms fade-in: sources start at full level
  out.connect(a.groups![d.group])
  const v: LoopVoice = { id, pri: d.pri, t0: t, stopAt: t + LOOP_MAX, out, nodes: [] }
  const buf = a.buffers.get(d.file ?? id)
  if (!buf && !SYNTH[id]) { out.disconnect(); return null }
  v.sample = buf ?? undefined
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

export function stopLoop(a: AudioRes, id: SoundId): void {
  const v = a.loops[id] as LoopVoice | undefined
  if (!v) return
  delete a.loops[id]
  const now = a.ctx!.currentTime
  v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, .05)
  const release = (): void => { v.out.disconnect(); v.lp?.disconnect() }
  if (!v.nodes.length) release()
  for (const n of v.nodes) { n.onended = release; try { n.stop(now + .25) } catch { release() } }
}

/** Keep loop `id` running iff `on`; returns the live voice (started this call if needed). */
export function wantLoop(a: AudioRes, id: SoundId, on: boolean, p: PlayParams): LoopVoice | null {
  if (!on) return stopLoop(a, id), null
  const v = a.loops[id] as LoopVoice | undefined
  const sample = a.buffers.get(def(id).file ?? id)
  if (v && v.stopAt > a.ctx!.currentTime && (!sample || v.sample === sample)) return v
  if (v) stopLoop(a, id) // ran out of source: rebuild
  return startLoop(a, id, p)
}


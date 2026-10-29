// Owner's full eight-minute scores stream through the existing music bus, avoiding a huge decoded AudioBuffer.
import opus from '../assets/audio/mus_beacon-run.ogg?url'
import mp3 from '../assets/audio/mus_beacon-run.mp3?url'
import escapeOpus from '../assets/audio/mus_blackout-escape.ogg?url'
import escapeMp3 from '../assets/audio/mus_blackout-escape.mp3?url'
import type { Resources } from '../assets/resources.ts'
import type { State } from '../core/types.ts'
import { pausedMenu } from '../core/settings.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundDef } from '../assets/sounds.ts'
import { musicFor } from './trigger.ts'

const TRACKS: Record<string, readonly [string, string]> = {
  'mus_beacon-run': [opus, mp3], 'mus_blackout-escape': [escapeOpus, escapeMp3],
}

function score(res: Resources): NonNullable<Resources['audio']['score']> | undefined {
  const a = res.audio, ctx = a.ctx, bus = a.groups?.music
  if (!ctx || !bus) return
  if (!a.score) {
    const element = new Audio()
    element.preload = 'auto'; element.loop = true
    element.src = element.canPlayType('audio/ogg; codecs="opus"') ? opus : mp3
    const source = ctx.createMediaElementSource(element), gain = ctx.createGain()
    gain.gain.value = .8; source.connect(gain); gain.connect(bus)
    a.score = { element, source, gain, bus, level: .8, pending: false, blocked: false }
  } else if (a.score.bus !== bus) {
    a.score.gain.disconnect(); a.score.gain.connect(bus); a.score.bus = bus
  }
  return a.score
}
function play(res: Resources): void {
  const m = score(res)
  if (!m || !m.element.paused || m.pending || m.blocked) return
  m.pending = true
  const gen = m.gen
  m.element.play().catch(() => { if (m.gen === gen) m.blocked = true })
    .finally(() => { if (m.gen === gen) m.pending = false })
}
// Called directly from the existing trusted audio-unlock gesture, so autoplay policy permits later resumes.
export function unlockMusic(res: Resources): void {
  const m = score(res)
  if (m) m.blocked = false
  play(res)
}
// true means this track is owned by streaming rather than the decoded-sample music player.
export function streamMusicStep(res: Resources, s: State): boolean {
  const id = musicFor(s), def: SoundDef | undefined = id ? SOUNDS[id] : undefined
  const pair = def?.file ? TRACKS[def.file] : undefined
  if (!def?.stream || !pair || pausedMenu(s) || document.hidden) {
    const m = res.audio.score
    if (m) {
      if (m.pending) { m.gen = (m.gen ?? 0) + 1; m.pending = false }
      m.element.pause()
    }
    return !!def?.stream
  }
  const m = score(res)
  if (!m) return true
  const url = pair[m.element.canPlayType('audio/ogg; codecs="opus"') ? 0 : 1]
  if (m.url !== url) {
    // A changed track starts at zero. Keep the single media/source graph across switches and HMR.
    if (m.element.src !== new URL(url, document.baseURI).href) {
      m.element.pause(); m.gen = (m.gen ?? 0) + 1
      m.pending = false; m.blocked = false; m.element.src = url
    }
    m.url = url
  }
  if (m.level !== def.gain) {
    m.level = def.gain; m.gain.gain.setTargetAtTime(def.gain, res.audio.ctx!.currentTime, .05)
  }
  play(res)
  return true
}

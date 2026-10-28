// L4 audio engine: per-step entry, AudioContext unlock/resume/suspend, DOM listener trampoline, event cursor, sample loader.
// Spec: resources-2 §1, §2, §8, resources §5-6, modules-render-2 §1, R-091..R-096, R-143. No module-level mutable state:
// cursors, the warn-dedupe set and the resume throttle live in the registry (res.audio); timers and rAF are not used.
// Sample behaviour while a file is not (yet) decoded: sfx.ts plays the SYNTH recipe, music.ts stays silent and retries every
// step; a failed decode stores null, which behaves the same. Samples are optional: absent files are simply never loaded.
import type { AudioRes, Resources } from '../assets/resources.ts'
import { getResources } from '../assets/resources.ts'
import { PENDING_AUDIO, SOUNDS } from '../assets/sounds.ts'
import type { SoundDef, SoundId } from '../assets/sounds.ts'
import { pausedMenu } from '../core/settings.ts'
import type { State } from '../core/types.ts'
import type { Input } from '../main.ts'
import { applyDucks, ensureMixer, setMaster, setBusVolumes } from './mixer.ts'
import { unlockMusic } from './stream-music.ts'
import { musicStep } from './music.ts'
import { loopStep, pruneVoices, play } from './sfx.ts'
import { noiseBuffers } from './synth.ts'
import { EXTRAS, TRIGGERS, duckFor } from './trigger.ts'
import type { Trigger } from './trigger.ts'

declare global {
  var __lastEmberAudio: ((type: string) => void) | undefined // R-143: strict tsc needs the hook typed
}

// Hot-reload-safe extras on the registry object (the registry survives engine.ts re-evaluation):
//   warned   = warnOnce dedupe keys; resumeAt = meta.time of the last resumeSoon attempt (throttle).
type EngineRes = AudioRes & { warned?: Set<string>; resumeAt?: number }
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const
const PAUSE_SUSPEND_S = 0.3 // ctx.suspend() this long after entering pause (ducks are down by then)
const RESUME_GAP_S = 0.5 // min meta.time between autonomous resume attempts
const LOAD_PARALLEL = 4
const FIRST_SAMPLES = ['mus_descent', 'amb_cave'] // decode order: P0 first
// Static Vite construct (not a runtime side effect): an absent or empty folder simply yields {}.
const URLS = import.meta.glob('../assets/audio/*.{ogg,mp3}', { query: '?url', import: 'default', eager: true }) as Record<string, string>

// console.warn once per distinct message. The dedupe Set sits on getResources().audio so it survives HMR swaps.
export function warnOnce(e: unknown): void {
  const a: EngineRes = getResources().audio
  const key = e instanceof Error ? e.message : String(e)
  const seen = (a.warned ??= new Set())
  if (seen.has(key)) return
  seen.add(key)
  console.warn('[audio]', e)
}

const syncState = (a: AudioRes): void => {
  if (a.ctx && a.state !== 'failed') a.state = a.ctx.state === 'running' ? 'running' : 'suspended' // 'interrupted' = suspended
  if (a.state === 'running') dropGestureListeners(a) // a re-armed set goes away as soon as the context runs again
}

// ---------- samples ----------
function sampleNames(): string[] {
  const pending: readonly string[] = PENDING_AUDIO
  const names = new Set<string>()
  for (const [id, def] of Object.entries(SOUNDS) as [SoundId, SoundDef][]) {
    if (def.stream || (!def.file && !def.layers)) continue
    for (const n of [def.file ?? id, ...(def.layers ?? [])]) if (!pending.includes(n)) names.add(n)
  }
  return [...names].sort((x, y) => Number(FIRST_SAMPLES.includes(y)) - Number(FIRST_SAMPLES.includes(x)))
}

async function loadOne(ctx: AudioContext, name: string, url: string): Promise<void> {
  const buffers = getResources().audio.buffers
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`sample ${name}: HTTP ${r.status}`)
    buffers.set(name, await ctx.decodeAudioData(await r.arrayBuffer()))
  } catch (e) {
    buffers.set(name, null) // synth fallback (sfx) or silence (music/ambience)
    warnOnce(e instanceof Error ? new Error(`sample ${name} failed: ${e.message}`) : e)
  }
}

// Fire-and-forget: never awaited by audioStep. Each name is requested once (pending/buffers guard).
function loadSamples(res: Resources): void {
  const a = res.audio
  const ctx = a.ctx
  if (!ctx) return
  const ext = document.createElement('audio').canPlayType('audio/ogg; codecs="opus"') !== '' ? 'ogg' : 'mp3'
  const queue: [string, string][] = []
  for (const name of sampleNames()) {
    const url = URLS[`../assets/audio/${name}.${ext}`]
    if (!url || a.pending.has(name) || a.buffers.has(name)) continue
    a.pending.add(name)
    queue.push([name, url])
  }
  const worker = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) await loadOne(ctx, job[0], job[1])
  }
  for (let i = 0; i < LOAD_PARALLEL; i++) worker().catch(warnOnce)
}

// ---------- unlock / resume / suspend ----------
function dropGestureListeners(a: AudioRes): void {
  for (let i = a.unlock.length - 1; i >= 0; i--) {
    const u = a.unlock[i]!
    if (u.type === 'visibilitychange') continue // kept for the page's lifetime
    u.el.removeEventListener(u.type, u.fn, true)
    a.unlock.splice(i, 1)
  }
}

export function unlock(res: Resources): void {
  const a = res.audio
  if (a.state === 'failed') return
  if (!a.ctx) {
    try {
      const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
      if (!Ctor) throw new Error('AudioContext is not available')
      a.ctx = new Ctor({ latencyHint: 'interactive' }) // one per page, never closed (R-091)
      a.state = 'suspended'
    } catch (e) {
      a.state = 'failed'
      warnOnce(e)
      return
    }
  }
  const ctx = a.ctx
  ctx.onstatechange = () => syncState(getResources().audio) // reads the live registry, not a captured one
  a.noise ??= noiseBuffers(ctx)
  ensureMixer(res)
  unlockMusic(res)
  loadSamples(res)
  ctx.resume().then(() => {
    const live = getResources().audio
    syncState(live)
    if (live.state === 'running') dropGestureListeners(live)
  }, warnOnce) // rejected: listeners stay, the next gesture retries
}

function onVisibility(a: AudioRes): void {
  const ctx = a.ctx
  if (!ctx || a.state === 'failed') return
  if (document.hidden) { a.score?.element.pause(); ctx.suspend().catch(warnOnce) }
  else if (a.lastScreen !== 'paused') ctx.resume().catch(warnOnce)
}

// The hook the DOM listeners call; re-assigned on every evaluation of this module (R-143).
function onDomEvent(type: string): void {
  try {
    const res = getResources()
    if (type === 'visibilitychange') onVisibility(res.audio)
    else unlock(res)
  } catch (e) {
    warnOnce(e)
  }
}
globalThis.__lastEmberAudio = onDomEvent

function listen(a: AudioRes, el: EventTarget, type: string, opts: AddEventListenerOptions): void {
  const fn: EventListener = (ev) => globalThis.__lastEmberAudio?.(ev.type)
  el.addEventListener(type, fn, opts)
  a.unlock.push({ el, type, fn })
}

// Idempotent: does nothing while any gesture handle is still registered.
function armGestures(a: AudioRes): void {
  if (a.unlock.some((u) => u.type !== 'visibilitychange')) return
  for (const t of GESTURES) listen(a, window, t, { capture: true, passive: true })
}

export function installAudioListeners(res: Resources): void {
  const a = res.audio
  if (a.unlock.length > 0) return // idempotent: the handles live in the registry
  if (!(a.ctx && a.state === 'running')) armGestures(a)
  listen(a, document, 'visibilitychange', {})
}

function resumeSoon(a: EngineRes, s: State): void {
  const ctx = a.ctx
  if (!ctx || ctx.state !== 'suspended' || document.hidden || pausedMenu(s)) return
  if (Math.abs(s.meta.time - (a.resumeAt ?? -Infinity)) < RESUME_GAP_S) return
  a.resumeAt = s.meta.time
  ctx.resume().catch(warnOnce)
}

// ---------- fx events ----------
// Keep the cursor current without playing (locked / failed / not running): a later unlock never replays the backlog.
const consumeSilently = (a: AudioRes, s: State): void => { a.lastSeq = s.fx.seq - 1 }

function playTrigger(res: Resources, t: Trigger | null | undefined, e: State['fx']['events'][number], s: State): void {
  if (!t) return
  try {
    play(res, t.id(e, s), t.params(e, s))
  } catch (err) {
    warnOnce(err) // one bad recipe must not stop the remaining events
  }
}

function consumeEvents(res: Resources, s: State): void {
  const a = res.audio
  // Fresh cursor, or the seq counter went backwards (new run / reset): jump to the newest event, no replay.
  if (a.lastSeq < 0 || a.lastSeq >= s.fx.seq || a.ctx?.state !== 'running') return consumeSilently(a, s)
  for (const e of s.fx.events) {
    if (e.seq <= a.lastSeq) continue
    playTrigger(res, TRIGGERS[e.kind], e, s)
    playTrigger(res, EXTRAS[e.kind], e, s) // flameHit / beaconLit second voice
  }
  consumeSilently(a, s)
}

// ---------- per-step entry ----------
// Mute (KeyM) and volume are owned by systems/screens.ts (writes s.settings); the engine only reads them. No M handling here.
export function audioStep(s: State, _input: Input): void {
  const res = getResources()
  const a: EngineRes = res.audio
  if (a.unlock.length === 0) installAudioListeners(res)
  const ctx = a.ctx
  if (!ctx || a.state === 'failed') {
    consumeSilently(a, s)
    a.lastScreen = pausedMenu(s) ? 'paused' : s.meta.screen
    return
  }
  resumeSoon(a, s)
  // iOS Safari may later drop the context to 'interrupted' (call, lock screen) and refuse a gesture-less resume():
  // bring the gesture listeners back (the visible, non-pause case only); syncState/unlock drop them once running again.
  if (a.score?.blocked) armGestures(a)
  if (ctx.state !== 'running' && !document.hidden && !pausedMenu(s) && a.lastScreen !== 'paused') armGestures(a)
  ensureMixer(res)
  setMaster(res, 1, s.settings.muted)
  setBusVolumes(res, s.settings.musicVolume, s.settings.sfxVolume)
  applyDucks(res, duckFor(s))
  musicStep(res, s)
  loopStep(res, s) // before events: it mirrors the camera that positional play() reads
  consumeEvents(res, s)
  pruneVoices(a)
  // Pause: ducks fall first, then the whole context is suspended once; leaving pause resumes via resumeSoon.
  if (!pausedMenu(s)) a.pauseAt = -1
  else if (a.lastScreen !== 'paused') a.pauseAt = ctx.currentTime
  else if (a.pauseAt >= 0 && ctx.state === 'running' && ctx.currentTime >= a.pauseAt + PAUSE_SUSPEND_S) {
    a.pauseAt = -2 // suspended once per pause
    ctx.suspend().catch(warnOnce)
  }
  a.lastScreen = pausedMenu(s) ? 'paused' : s.meta.screen
}

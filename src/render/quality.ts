// L4 render: quality table, settings.quality override, perf ring, pass marks and the auto ladder.
// Spec: docs/architecture-render-3.md §3.2-3.3, architecture-render.md §2-3, R-142, R-133. All mutable state lives in the
// resource registry (res.perf, architecture-resources.md §2); this module keeps none (hot-reload rule). Never writes State.
import type { State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'

export type Quality = {
  level: 0 | 1 | 2 | 3; dprCap: number; darkRes: 1 | 0.5
  glow: boolean; decor: boolean; particles: number; vignette: boolean
}

// Core flame, eyes and the light mask are never dropped at any level (gameplay readability).
export const QUALITY: readonly Quality[] = [
  { level: 0, dprCap: 2, darkRes: 1, glow: true, decor: true, particles: 1, vignette: true },
  { level: 1, dprCap: 1.5, darkRes: 1, glow: true, decor: true, particles: 1, vignette: true },
  { level: 2, dprCap: 1, darkRes: 0.5, glow: true, decor: false, particles: 0.5, vignette: true },
  { level: 3, dprCap: 1, darkRes: 0.5, glow: false, decor: false, particles: 0.25, vignette: false },
]

const WINDOW = 120 // frames per auto window (2 s at 60 Hz) = perf.frameMs length
const DOWN_MS = 18.5, UP_MS = 12 // window average thresholds
const DOWN_WINDOWS = 2, UP_WINDOWS = 5 // consecutive windows before a level change
const COOL_MS = 3000 // frames ignored after a change so canvas warm-up does not oscillate
const HIDDEN_MS = 100 // longer intervals are a hidden tab or a pause: discarded
const VSYNC30_MS = 1000 / 30, VSYNC30_SLACK_MS = 1, VSYNC30_WORK_MS = 8
const PASS_FRAMES = 30 // passMark smoothing length
const MARK = '@' // perf.pass key holding the timestamp of the previous mark; consumers must skip it

// Dev/user override: 'q0'..'q3' pins a level, anything else (incl. 'auto' and unknown stored values) means auto.
export function currentQuality(s: State): Quality {
  const o: string = getResources().debug.quality ?? s.settings.quality
  if (o.length === 2 && o[0] === 'q' && o[1] >= '0' && o[1] <= '3') return QUALITY[Number(o[1])]
  const level = getResources().perf.level
  return QUALITY[level >= 0 && level <= 3 ? level : 0]
}

// Pass 0. `now` is injectable for checks; the default is the browser/Node high-resolution clock.
export function frameBegin(now: number = performance.now()): void {
  const p = getResources().perf
  const dt = now - p.last
  if (p.last > 0 && dt <= HIDDEN_MS) {
    if (p.cool > 0) p.cool -= dt
    else p.frameMs[p.i++ % WINDOW] = dt // ring: if qualityTick is skipped the oldest samples are overwritten
  }
  p.last = now
  p.pass[MARK] = now
}

// Stores the time since the previous mark (or frameBegin) in res.perf.pass[name], smoothed over ~30 frames.
// ponytail: exponential average, not an exact 30-frame window; canvas calls are queued so CPU marks underestimate GPU cost.
export function passMark(name: string, now: number = performance.now()): void {
  const p = getResources().perf
  const d = now - (p.pass[MARK] ?? p.last)
  const prev = p.pass[name]
  p.pass[name] = prev === undefined ? d : prev + (d - prev) / PASS_FRAMES
  p.pass[MARK] = now
}

// Pass 23: evaluates a full window of frame intervals and moves the auto level; publishes the dpr cap for the host (S8).
// The user override is applied in currentQuality; the ladder keeps running underneath it.
export function qualityTick(s: State, now: number = performance.now()): void {
  const p = getResources().perf
  if (p.i >= WINDOW) {
    let sum = 0
    for (let i = 0; i < WINDOW; i++) sum += p.frameMs[i]
    const avg = sum / WINDOW
    const work = now - p.last // render work of this frame: a 30 Hz vsync display is slow without being overloaded
    const vsync30 = Math.abs(avg - VSYNC30_MS) <= VSYNC30_SLACK_MS && work < VSYNC30_WORK_MS // ponytail: one-frame work sample, upgrade: average work time
    if (avg > DOWN_MS && !vsync30) { p.down++; p.up = 0 }
    else if (avg < UP_MS) { p.up++; p.down = 0 }
    else { p.down = 0; p.up = 0 }
    const next = p.down >= DOWN_WINDOWS ? p.level + 1 : p.up >= UP_WINDOWS ? p.level - 1 : p.level
    if (next !== p.level && next >= 0 && next <= 3) {
      p.level = next as 0 | 1 | 2 | 3
      p.down = 0; p.up = 0; p.cool = COOL_MS
    } else if (next !== p.level) { p.down = 0; p.up = 0 } // already at the ladder end
    p.i = 0
  }
  // ponytail: the host reads this global only after the approved 1-line main.ts change (render-3 §3.2, open question Q1).
  const g = globalThis as { __lastEmberDprCap?: number }
  g.__lastEmberDprCap = currentQuality(s).dprCap
}

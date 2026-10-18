// L3 systems: fx event queue, strongest-wins shake, fx timers. DOM-free, writes only s.fx.
// Spec: docs/architecture-systems-4.md §4, architecture-state-2.md §7, R-067 (tickFx never touches hitstop).
import type { FxEventKind, State } from '../core/types.ts'
import { FX_EVENTS_MAX } from '../core/state.ts'
import { T } from '../core/tuning.ts'

const EVENT_MAX_AGE_STEPS = 30 // state-2 §7: events older than 30 steps are pruned

// Drop events older than 30 steps, then cap the queue at FX_EVENTS_MAX (oldest first).
function prune(s: State): void {
  const ev = s.fx.events
  const steps = s.meta.steps
  let drop = 0
  while (drop < ev.length && steps - ev[drop].step > EVENT_MAX_AGE_STEPS) drop += 1
  drop = Math.max(drop, ev.length - FX_EVENTS_MAX)
  if (drop > 0) ev.splice(0, drop)
}

// ponytail: prune assumes events are in emit order (step non-decreasing), true because only emit() appends.
export function emit(s: State, kind: FxEventKind, x: number, y: number, a = 0): void {
  const fx = s.fx
  fx.events.push({ seq: fx.seq, kind, x, y, a, step: s.meta.steps })
  fx.seq += 1
  prune(s)
}

// Strongest wins: a new shake never stacks past T.cam.shakeMaxPx and never weakens a stronger running one.
export function addShake(s: State, k: keyof typeof T.shake, scale = 1): void {
  const fx = s.fx
  const mag = T.shake[k].px * scale
  const currentAmp = fx.shakeMag * Math.min(1, fx.shake / T.cam.shakeDecayS)
  fx.shakeMag = Math.min(T.cam.shakeMaxPx, Math.max(currentAmp, mag))
  fx.shake = Math.max(fx.shake, T.shake[k].s)
}

// hitstop is decremented only by step() (R-067), never here.
export function tickFx(s: State, dt: number): void {
  const fx = s.fx
  fx.shake = Math.max(0, fx.shake - dt)
  fx.flare = Math.max(0, fx.flare - dt)
  fx.beaconFlash = Math.max(0, fx.beaconFlash - dt)
  prune(s)
}

// L4 ui: pure animation helpers (architecture-ui-2 §2-3 animations table, accessibility). No module-level state, no Math.random, no timers:
// every result is a function of its arguments (callers pass meta.time / meta.steps / ui timers). `reduced` = settings.reducedFlash.
import { clamp } from '../core/math.ts'

export const REDUCED_SHAKE = 0.4 // reducedFlash: shake amplitude x0.4 (flash and pulse effects have their own steady rest values)

// Ease-out cubic: x in 0..1 (clamped) -> 0..1. Fast start, soft landing.
export const easeOutCubic = (x: number): number => 1 - (1 - clamp(x, 0, 1)) ** 3

// Count-up value: 0 until `delay` seconds after `since`, then ease-out cubic to `total` over `dur` seconds (end screen score: delay 0.4, dur 0.8).
export const countUp = (t: number, since: number, total: number, delay: number, dur: number): number =>
  Math.round(total * easeOutCubic((t - since - delay) / dur))

// Sine pulse in 0..1 at `hz` cycles per second; `reduced` returns `rest` (steady, pulses disabled). Pick `rest` = the value the effect
// should hold while still: 0 for "grow by amount * pulse", 1 for "dim by (1 - pulse)".
export const pulse = (t: number, hz: number, reduced: boolean, rest = 0.5): number =>
  reduced ? rest : 0.5 + 0.5 * Math.sin(2 * Math.PI * hz * t)

// Amplitude factor for shakes: 1, or REDUCED_SHAKE when flashing is reduced.
export const shakeK = (reduced: boolean): number => (reduced ? REDUCED_SHAKE : 1)

// Title logo glow alpha: 0.2 + 0.1 * sin(t * 1.2); steady 0.2 when flashing is reduced (pulses disabled).
export const logoGlow = (t: number, reduced: boolean): number => (reduced ? 0.2 : 0.2 + 0.1 * Math.sin(t * 1.2))

// Deny shake offset in px: +-3u * sin(denyT * 60) while ui.denyT > 0 (0.25 s countdown), else 0.
export const denyShake = (denyT: number, u: number, reduced: boolean): number =>
  denyT > 0 ? 3 * u * Math.sin(denyT * 60) * shakeK(reduced) : 0

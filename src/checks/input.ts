// Scripted Input for mid-run checks. Spec: docs/architecture-modules-core.md §4 (input.ts row), architecture-state-3.md §7 #2.
// Pure and deterministic: the same k gives the same Input, and every call returns fresh Sets and arrays (no aliasing between steps).
import type { Input } from '../main.ts'

// Fixed script, one Input per update step k (0-based): hold a direction, tap Space / Digit1, click now and then.
export function scriptedInput(k: number): Input {
  const keys = new Set<string>([k % 240 < 120 ? 'KeyD' : 'KeyA'])
  if (k % 180 < 90) keys.add('KeyS')
  const pressed = new Set<string>()
  if (k % 90 === 0) pressed.add('Space')
  if (k % 150 === 0) pressed.add('Digit1')
  const clicks: { x: number; y: number }[] = []
  if (k % 45 === 0) clicks.push({ x: 100 + ((k * 7) % 200), y: 80 + ((k * 3) % 100) })
  // Built as a variable, not a returned literal: `view` (host-changes §1, A1) is not in the current main.ts Input, and an
  // object literal with an extra key would fail excess-property checks. Once A1 lands the type requires it and this satisfies it.
  const input = {
    keys,
    pressed,
    mouse: { x: 100 + ((k * 7) % 200), y: 80 + ((k * 3) % 100), down: k % 45 < 5 },
    clicks,
    view: { w: 640, h: 360, dpr: 1 },
  }
  return input
}

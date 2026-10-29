// Sparse copper guidance: independent short-lived cues, irregular gaps and sideways scatter.
import { hash2 } from './noise.ts'
export const COPPER_HINT_SLOTS = 3
export type CopperHint = { distance: number; side: number; lift: number; size: number; alpha: number }
export function copperHint(seed: number, time: number, slot: number): CopperHint | null {
  const period = [2.8, 3.7, 4.3][slot] ?? 3.7, clock = time + slot * .73
  const cycle = Math.floor(clock / period), h = (salt: number): number => hash2(cycle, slot, seed ^ salt)
  if (h(41) > .76) return null
  const life = .6 + h(42) * .35, age = clock - cycle * period - (.25 + h(43) * .8)
  if (age < 0 || age >= life) return null
  const f = age / life
  return { distance: 38 + h(44) * 88 + age * (12 + h(45) * 10),
    side: (h(46) * 2 - 1) * 18 + (h(47) * 2 - 1) * f * 4,
    lift: -3 - f * 7, size: h(48) < .7 ? 2 : 3, alpha: .2 * Math.sin(Math.PI * f) }
}

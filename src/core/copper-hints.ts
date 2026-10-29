// World-anchored cosmetic bursts. Only the resource pool changes; gameplay State/RNG are untouched.
import { hash2 } from './noise.ts'
export type CopperBurst = { x: number; y: number; born: number; life: number; id: number }
export type CopperHints = { runId: number; at: number; active: boolean; nextAt: number; seq: number; burst: CopperBurst | null }
export const COPPER_TWINKLE_PIXELS = 6
export function createCopperHints(): CopperHints {
  return { runId: -1, at: 0, active: false, nextAt: 0, seq: 0, burst: null }
}
const gap = (seed: number, seq: number): number => 1 + hash2(seq, 51, seed)
// choose() is sampled once at birth, never while the player moves during a live twinkle.
export function sampleCopperHints(p: CopperHints, runId: number, time: number, on: boolean, seed: number,
  choose: (fraction: number) => { x: number; y: number } | null): void {
  if (p.runId !== runId || time < p.at) Object.assign(p, createCopperHints(), { runId })
  p.at = time
  if (!on) { p.active = false; p.burst = null; return }
  if (!p.active) { p.active = true; p.nextAt = time + gap(seed, p.seq); return }
  if (p.burst && time >= p.burst.born + p.burst.life) p.burst = null
  if (time < p.nextAt) return
  const id = p.seq++, anchor = choose(hash2(id, 52, seed)), life = .5 + .5 * hash2(id, 53, seed)
  p.burst = anchor ? { x: anchor.x, y: anchor.y, born: time, life, id } : null
  // Skip missed bursts after a long render gap; never catch up with a pile of simultaneous cues.
  p.nextAt = time + (anchor ? life : 0) + gap(seed, p.seq)
}
export function copperPixel(b: CopperBurst, seed: number, time: number, i: number):
  { x: number; y: number; size: number; alpha: number } | null {
  const h = (salt: number): number => hash2(b.id * COPPER_TWINKLE_PIXELS + i, salt, seed)
  const start = h(54) * .15, end = .85 + h(55) * .15
  const f = ((time - b.born) / b.life - start) / (end - start)
  if (f <= 0 || f >= 1) return null
  return { x: Math.round(b.x + (h(56) - .5) * 20), y: Math.round(b.y + (h(57) - .5) * 14 - 2),
    size: h(58) < .5 ? 1 : 2, alpha: .95 * Math.sin(Math.PI * f) }
}
